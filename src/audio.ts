import type { CharacterDefinition } from "./types";

type SoundKind = "chain-hit" | "boss-laser" | "click" | "match" | "bomb" | "wrong" | "attack" | "ultimate-whoosh" | "ultimate-impact" | "victory";

const ULTIMATE_SOUND_WAIT_MS = 250;
const ULTIMATE_VOLUME = 0.65;
const SOUND_LOAD_TIMEOUT_MS = 5_000;
const ULTIMATE_CAST_SOUND_URL = new URL("../assets/audio/ultimates/common-cast.m4a", import.meta.url).href;
const MATCH_SOUND_URL = new URL("../assets/audio/ui/match-pop.wav", import.meta.url).href;
const WRONG_SOUND_URL = new URL("../assets/audio/ui/pair-error.wav", import.meta.url).href;
const CHAIN_SOUND_URL = new URL("../assets/audio/effects/chain-hit.wav", import.meta.url).href;
const BOSS_LASER_SOUND_URL = new URL("../assets/audio/effects/boss-laser.wav", import.meta.url).href;
const BOMB_SOUND_URL = new URL("../assets/audio/effects/bomb-explosion.wav", import.meta.url).href;

type BrowserWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export class AudioFeedback {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private volume = 0.5;
  private paused = false;
  private muted = false;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pendingBuffers = new Map<string, Promise<AudioBuffer | null>>();

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.5));
    if (this.output && this.context) this.output.gain.setValueAtTime(this.volume, this.context.currentTime);
  }

  setMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;
    if (muted) this.stopAll();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!this.context) return;
    const change = paused ? this.context.suspend() : this.context.resume();
    void change.catch(() => undefined);
  }

  stopAll(): void {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* 已结束的声音无需处理。 */ }
    }
    this.sources.clear();
  }

  private trackSource(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
    };
  }

  private getContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }
    const AudioContextConstructor = window.AudioContext ?? (window as BrowserWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }
    try {
      this.context = new AudioContextConstructor();
      this.output = this.context.createGain();
      this.output.gain.value = this.volume;
      this.output.connect(this.context.destination);
      return this.context;
    } catch {
      return null;
    }
  }

  private getOutput(context: AudioContext): GainNode {
    if (this.output) return this.output;
    this.output = context.createGain();
    this.output.gain.value = this.volume;
    this.output.connect(context.destination);
    return this.output;
  }

  private loadBuffer(url: string): Promise<AudioBuffer | null> {
    const buffer = this.buffers.get(url);
    if (buffer) return Promise.resolve(buffer);
    const pending = this.pendingBuffers.get(url);
    if (pending) return pending;
    const context = this.getContext();
    if (!context) return Promise.resolve(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SOUND_LOAD_TIMEOUT_MS);
    const loading = fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`音效加载失败：${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((decoded) => {
        this.buffers.set(url, decoded);
        return decoded;
      })
      .catch(() => null)
      .finally(() => {
        window.clearTimeout(timeout);
        this.pendingBuffers.delete(url);
      });
    this.pendingBuffers.set(url, loading);
    return loading;
  }

  async preloadMatch(): Promise<void> {
    await this.loadBuffer(MATCH_SOUND_URL);
  }

  async preloadWrong(): Promise<void> {
    await this.loadBuffer(WRONG_SOUND_URL);
  }

  async preloadBossSounds(): Promise<void> {
    await Promise.all([this.loadBuffer(CHAIN_SOUND_URL), this.loadBuffer(BOSS_LASER_SOUND_URL)]);
  }

  async preloadBomb(): Promise<void> {
    await this.loadBuffer(BOMB_SOUND_URL);
  }

  async preloadUltimates(characters: readonly CharacterDefinition[]): Promise<void> {
    const urls = [
      ULTIMATE_CAST_SOUND_URL,
      ...characters.flatMap((character) => [character.ultimate.soundUrl, character.ultimate.fieldSoundUrl]
        .filter((url): url is string => Boolean(url))),
    ];
    for (let index = 0; index < urls.length; index += 2) {
      await Promise.all(urls.slice(index, index + 2).map((url) => this.loadBuffer(url)));
    }
  }

  async prepareUltimate(url?: string): Promise<void> {
    const urls = [ULTIMATE_CAST_SOUND_URL, ...(url ? [url] : [])].filter((soundUrl) => !this.buffers.has(soundUrl));
    if (urls.length === 0) return;
    let timeout: number | undefined;
    try {
      await Promise.race([
        Promise.all(urls.map((soundUrl) => this.loadBuffer(soundUrl))),
        new Promise<null>((resolve) => {
          timeout = window.setTimeout(() => resolve(null), ULTIMATE_SOUND_WAIT_MS);
        }),
      ]);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  playUltimate(): void {
    if (this.paused || this.muted) return;
    const context = this.getContext();
    if (!context) return;
    void context.resume().catch(() => undefined);
    const startAt = context.currentTime;
    const castBuffer = this.buffers.get(ULTIMATE_CAST_SOUND_URL);
    if (!castBuffer) void this.loadBuffer(ULTIMATE_CAST_SOUND_URL);
    if (!castBuffer || !this.playUltimateBuffer(context, castBuffer, startAt)) {
      this.play("ultimate-whoosh");
    }
  }

  playUltimateField(url?: string): void {
    if (!url || this.paused || this.muted) return;
    const context = this.getContext();
    const buffer = this.buffers.get(url);
    // 动作音效只在当前动作帧起播，不在加载完成后补播过期声音。
    if (!context || !buffer) return;
    void context.resume().catch(() => undefined);
    this.playUltimateBuffer(context, buffer, context.currentTime);
  }

  private playUltimateBuffer(context: AudioContext, buffer: AudioBuffer, startAt: number): boolean {
    const source = context.createBufferSource();
    const gain = context.createGain();
    try {
      source.buffer = buffer;
      gain.gain.value = ULTIMATE_VOLUME;
      source.connect(gain);
      gain.connect(this.getOutput(context));
      this.trackSource(source, [gain]);
      source.start(startAt);
      return true;
    } catch {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
      return false;
    }
  }

  private tone(
    context: AudioContext,
    frequency: number,
    offset: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const start = context.currentTime + offset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.getOutput(context));
    this.trackSource(oscillator, [gain]);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noiseSweep(context: AudioContext, duration: number, impact: boolean): void {
    const start = context.currentTime;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = impact ? "lowpass" : "bandpass";
    filter.Q.value = impact ? 0.7 : 1.1;
    filter.frequency.setValueAtTime(impact ? 1_100 : 350, start);
    filter.frequency.exponentialRampToValueAtTime(impact ? 90 : 3_600, start + duration * 0.55);
    if (!impact) filter.frequency.exponentialRampToValueAtTime(550, start + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime((impact ? 0.16 : 0.1) * ULTIMATE_VOLUME, start + (impact ? 0.008 : 0.09));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutput(context));
    this.trackSource(source, [filter, gain]);
    source.start(start);
    source.stop(start + duration);
  }

  private ultimateImpact(context: AudioContext): void {
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(155, start);
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.26);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18 * ULTIMATE_VOLUME, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    oscillator.connect(gain);
    gain.connect(this.getOutput(context));
    this.trackSource(oscillator, [gain]);
    oscillator.start(start);
    oscillator.stop(start + 0.36);
    this.noiseSweep(context, 0.16, true);
    this.tone(context, 82, 0.015, 0.2, "triangle", 0.045 * ULTIMATE_VOLUME);
  }

  play(kind: SoundKind): void {
    if (this.paused || this.muted) return;
    const context = this.getContext();
    if (!context) {
      return;
    }
    void context.resume().catch(() => undefined);

    try {
      if (kind === "chain-hit" || kind === "boss-laser" || kind === "wrong") {
        const url = kind === "chain-hit" ? CHAIN_SOUND_URL : kind === "wrong" ? WRONG_SOUND_URL : BOSS_LASER_SOUND_URL;
        const buffer = this.buffers.get(url);
        if (!buffer) {
          void (kind === "wrong" ? this.preloadWrong() : this.preloadBossSounds());
          return;
        }
        // 每次触发创建独立音源，连续点击不节流、不打断上一声。
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = kind === "chain-hit" ? 0.4 : 1;
        source.connect(gain);
        gain.connect(this.getOutput(context));
        this.trackSource(source, [gain]);
        source.start();
      } else if (kind === "click") {
        this.tone(context, 340, 0, 0.055, "sine", 0.035);
      } else if (kind === "match") {
        const buffer = this.buffers.get(MATCH_SOUND_URL);
        if (!buffer) {
          void this.preloadMatch();
          return;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = 1.5;
        // 原素材峰值已满幅，提升音量时压缩峰值，避免直接放大削波。
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -3;
        compressor.knee.value = 0;
        compressor.ratio.value = 20;
        compressor.attack.value = 0;
        compressor.release.value = 0.05;
        source.connect(gain);
        gain.connect(compressor);
        compressor.connect(this.getOutput(context));
        this.trackSource(source, [gain, compressor]);
        source.start();
      } else if (kind === "bomb") {
        const buffer = this.buffers.get(BOMB_SOUND_URL);
        if (!buffer) {
          void this.preloadBomb();
          return;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.getOutput(context));
        this.trackSource(source, []);
        source.start();

      } else if (kind === "attack") {
        this.tone(context, 430, 0, 0.07, "triangle", 0.018);
      } else if (kind === "ultimate-whoosh") {
        this.noiseSweep(context, 0.28, false);
      } else if (kind === "ultimate-impact") {
        this.ultimateImpact(context);
      } else {
        this.tone(context, 392, 0, 0.25, "sine", 0.04);
        this.tone(context, 523, 0.12, 0.3, "sine", 0.045);
        this.tone(context, 659, 0.25, 0.42, "sine", 0.05);
      }
    } catch {
      // 音频不可用时静默降级。
    }
  }
}
