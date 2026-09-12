import { decodeSave, encodeSave, GAME_STORAGE_KEY } from "./save";
import { getToySdk, type ToySdk } from "./toy-sdk";
import type { GameState } from "./types";

const MANIFEST_KEY = "ym_manifest";
const RANK_ENABLED_KEY = "ym_rank_enabled";
const CLOUD_FORMAT_VERSION = 1;
const CHUNK_BYTES = 672;
const MAX_CHUNKS = 60;
const SAVE_DELAY_MS = 3_000;
const LOCAL_ARCHIVE_KEY = `${GAME_STORAGE_KEY}:cloud-archive-id`;
const LOCAL_PENDING_RESET_KEY = `${GAME_STORAGE_KEY}:pending-cloud-reset`;
const LOCAL_RANK_ENABLED_KEY = `${GAME_STORAGE_KEY}:rank-enabled`;

type Slot = "a" | "b";

interface CloudManifest {
  v: 1;
  active: Slot;
  previous: Slot | null;
  archiveId: string;
  revision: number;
}

interface SlotMeta {
  v: 1;
  archiveId: string;
  revision: number;
  chunks: number;
  digest: string;
}

interface DecodedSlot {
  slot: Slot;
  meta: SlotMeta;
  state: GameState;
}

export interface CloudSnapshot {
  state: GameState;
  manifest: CloudManifest;
  rankEnabled: boolean;
}

export type CloudReadResult =
  | { kind: "loaded"; snapshot: CloudSnapshot }
  | { kind: "empty"; rankEnabled: boolean }
  | { kind: "unavailable"; reason: "missing" | "unsupported" };

export interface PendingCloudReset {
  archiveId: string | null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("云存档元数据无效");
  return value as Record<string, unknown>;
}

function parseSlot(value: unknown): Slot {
  if (value !== "a" && value !== "b") throw new Error("云存档槽位无效");
  return value;
}

function parseManifest(text: string): CloudManifest {
  const raw = record(JSON.parse(text));
  if (raw.v !== CLOUD_FORMAT_VERSION || typeof raw.archiveId !== "string" || !raw.archiveId) throw new Error("云存档清单无效");
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1) throw new Error("云存档版本无效");
  return {
    v: 1,
    active: parseSlot(raw.active),
    previous: raw.previous === null ? null : parseSlot(raw.previous),
    archiveId: raw.archiveId,
    revision: raw.revision as number,
  };
}

function parseMeta(text: string): SlotMeta {
  const raw = record(JSON.parse(text));
  if (raw.v !== CLOUD_FORMAT_VERSION || typeof raw.archiveId !== "string" || !raw.archiveId) throw new Error("云存档槽位元数据无效");
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1) throw new Error("云存档槽位版本无效");
  if (!Number.isSafeInteger(raw.chunks) || (raw.chunks as number) < 1 || (raw.chunks as number) > MAX_CHUNKS) throw new Error("云存档分片数量无效");
  if (typeof raw.digest !== "string" || !/^[a-f\d]{64}$/.test(raw.digest)) throw new Error("云存档校验值无效");
  return { v: 1, archiveId: raw.archiveId, revision: raw.revision as number, chunks: raw.chunks as number, digest: raw.digest };
}

function slotMetaKey(slot: Slot): string {
  return `ym_${slot}_meta`;
}

function slotChunkKey(slot: Slot, index: number): string {
  return `ym_${slot}_${String(index).padStart(2, "0")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeChunks(text: string): string[] {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) chunks.push(bytesToBase64(bytes.subarray(offset, offset + CHUNK_BYTES)));
  if (!chunks.length) chunks.push("");
  if (chunks.length > MAX_CHUNKS) throw new Error("云存档超过可用容量");
  return chunks;
}

function decodeChunks(chunks: string[]): string {
  const parts = chunks.map(base64ToBytes);
  const size = parts.reduce((total, part) => total + part.length, 0);
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

async function digest(text: string): Promise<string> {
  if (!crypto.subtle) throw new Error("浏览器不支持云存档校验");
  const value = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function decodeSlot(values: Record<string, string>, slot: Slot, archiveId?: string): Promise<DecodedSlot | null> {
  try {
    const metaText = values[slotMetaKey(slot)];
    if (!metaText) return null;
    const meta = parseMeta(metaText);
    if (archiveId && meta.archiveId !== archiveId) return null;
    const chunks = Array.from({ length: meta.chunks }, (_, index) => values[slotChunkKey(slot, index)]);
    if (chunks.some((chunk) => typeof chunk !== "string")) return null;
    const serialized = decodeChunks(chunks as string[]);
    if (await digest(serialized) !== meta.digest) return null;
    return { slot, meta, state: decodeSave(serialized) };
  } catch {
    return null;
  }
}

function newArchiveId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); }
  catch { /* 云端仍可工作；本地元数据不可用时不阻断游戏。 */ }
}

function removeLocal(key: string): void {
  try { localStorage.removeItem(key); }
  catch { /* 下次仍会重新处理该标记。 */ }
}

export class CloudSave {
  private sdk: ToySdk | null = null;
  private manifest: CloudManifest | null = null;
  private writeEnabled = false;
  private queued: string | null = null;
  private timer = 0;
  private writing: Promise<void> | null = null;
  private epoch = 0;
  private warned = false;

  constructor(private readonly report: (message: string) => void) {}

  get rankEnabled(): boolean {
    return readLocal(LOCAL_RANK_ENABLED_KEY) === "1";
  }

  get pendingReset(): PendingCloudReset | null {
    const text = readLocal(LOCAL_PENDING_RESET_KEY);
    if (!text) return null;
    try {
      const raw = record(JSON.parse(text));
      return { archiveId: typeof raw.archiveId === "string" && raw.archiveId ? raw.archiveId : null };
    } catch {
      return { archiveId: null };
    }
  }

  async read(): Promise<CloudReadResult> {
    const sdk = getToySdk();
    if (!sdk) return { kind: "unavailable", reason: "missing" };
    const supported = await Promise.all([sdk.isSupport("getCloudStorage"), sdk.isSupport("setCloudStorage")]);
    if (!supported.every(Boolean)) return { kind: "unavailable", reason: "unsupported" };
    const values = await sdk.getCloudStorage();
    this.sdk = sdk;
    const rankEnabled = values[RANK_ENABLED_KEY] === "1";
    const manifestText = values[MANIFEST_KEY];
    if (!manifestText) return { kind: "empty", rankEnabled };
    let manifest: CloudManifest;
    try {
      manifest = parseManifest(manifestText);
    } catch {
      const recovered = (await Promise.all([decodeSlot(values, "a"), decodeSlot(values, "b")]))
        .filter((slot): slot is DecodedSlot => slot !== null)
        .sort((a, b) => b.meta.revision - a.meta.revision);
      const selected = recovered[0];
      if (!selected) throw new Error("云存档清单与快照均不可用");
      const previous = recovered.find((slot) => slot.meta.archiveId === selected.meta.archiveId && slot.slot !== selected.slot)?.slot ?? null;
      manifest = { v: 1, active: selected.slot, previous, archiveId: selected.meta.archiveId, revision: selected.meta.revision };
      return { kind: "loaded", snapshot: { state: selected.state, manifest, rankEnabled } };
    }
    const slots = [manifest.active, manifest.previous, manifest.active === "a" ? "b" : "a"].filter((slot, index, all): slot is Slot => slot !== null && all.indexOf(slot) === index);
    for (const slot of slots) {
      const decoded = await decodeSlot(values, slot, manifest.archiveId);
      if (decoded) {
        const selectedManifest: CloudManifest = { ...manifest, active: slot, previous: slot === manifest.active ? manifest.previous : manifest.active, revision: Math.max(manifest.revision, decoded.meta.revision) };
        return { kind: "loaded", snapshot: { state: decoded.state, manifest: selectedManifest, rankEnabled } };
      }
    }
    throw new Error("云存档的两个快照均不可用");
  }

  activate(result: Extract<CloudReadResult, { kind: "loaded" | "empty" }>): void {
    this.epoch += 1;
    this.writeEnabled = true;
    if (result.kind === "loaded") {
      this.manifest = result.snapshot.manifest;
      writeLocal(LOCAL_ARCHIVE_KEY, this.manifest.archiveId);
      if (result.snapshot.rankEnabled) writeLocal(LOCAL_RANK_ENABLED_KEY, "1");
    } else {
      const archiveId = newArchiveId();
      this.manifest = { v: 1, active: "b", previous: null, archiveId, revision: 0 };
      writeLocal(LOCAL_ARCHIVE_KEY, archiveId);
      if (result.rankEnabled) writeLocal(LOCAL_RANK_ENABLED_KEY, "1");
    }
  }

  deactivate(): void {
    this.epoch += 1;
    this.writeEnabled = false;
    this.queued = null;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = 0;
  }

  schedule(state: GameState, immediate = false): void {
    if (!this.writeEnabled || !this.manifest) return;
    this.queued = encodeSave(state);
    if (this.timer) window.clearTimeout(this.timer);
    if (immediate) {
      this.timer = 0;
      void this.drain();
    } else {
      this.timer = window.setTimeout(() => { this.timer = 0; void this.drain(); }, SAVE_DELAY_MS);
    }
  }

  async enableRanking(): Promise<void> {
    writeLocal(LOCAL_RANK_ENABLED_KEY, "1");
    const sdk = this.sdk ?? getToySdk();
    if (!sdk) return;
    try {
      if (await sdk.isSupport("setCloudStorage")) await sdk.setCloudStorage({ [RANK_ENABLED_KEY]: "1" });
    } catch { this.warn("排行榜偏好暂时未同步到云端，当前设备仍会记住。 "); }
  }

  markPendingReset(): void {
    // 旧快照即使正在网络途中也不能在重置之后清除待同步标记。
    this.epoch += 1;
    this.queued = null;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = 0;
    const archiveId = this.manifest?.archiveId ?? readLocal(LOCAL_ARCHIVE_KEY);
    writeLocal(LOCAL_PENDING_RESET_KEY, JSON.stringify({ archiveId: archiveId || null }));
  }

  clearPendingReset(): void {
    removeLocal(LOCAL_PENDING_RESET_KEY);
  }

  private async drain(): Promise<void> {
    if (this.writing) return this.writing;
    const epoch = this.epoch;
    this.writing = (async () => {
      while (this.queued && this.writeEnabled && epoch === this.epoch) {
        const serialized = this.queued;
        this.queued = null;
        try {
          await this.writeSnapshot(serialized, epoch);
        } catch {
          if (epoch === this.epoch && this.writeEnabled) this.queued = serialized;
          this.warn("云存档暂时同步失败，当前进度仍已保存在本机。 ");
          break;
        }
      }
    })().finally(() => {
      this.writing = null;
      if (this.queued && this.writeEnabled && !this.timer) void this.drain();
    });
    return this.writing;
  }

  private async writeSnapshot(serialized: string, epoch: number): Promise<void> {
    const sdk = this.sdk;
    const current = this.manifest;
    if (!sdk || !current || epoch !== this.epoch) return;
    const slot: Slot = current.active === "a" ? "b" : "a";
    const revision = current.revision + 1;
    const chunks = encodeChunks(serialized);
    const items = Object.fromEntries(chunks.map((chunk, index) => [slotChunkKey(slot, index), chunk]));
    await sdk.setCloudStorage(items);
    if (epoch !== this.epoch) return;
    const meta: SlotMeta = { v: 1, archiveId: current.archiveId, revision, chunks: chunks.length, digest: await digest(serialized) };
    await sdk.setCloudStorage({ [slotMetaKey(slot)]: JSON.stringify(meta) });
    if (epoch !== this.epoch) return;
    const next: CloudManifest = { v: 1, active: slot, previous: current.active, archiveId: current.archiveId, revision };
    await sdk.setCloudStorage({ [MANIFEST_KEY]: JSON.stringify(next) });
    if (epoch !== this.epoch) return;
    this.manifest = next;
    writeLocal(LOCAL_ARCHIVE_KEY, next.archiveId);
    this.clearPendingReset();
  }

  private warn(message: string): void {
    if (this.warned) return;
    this.warned = true;
    this.report(message.trim());
  }
}

export async function withCloudTimeout<T>(promise: Promise<T>, timeoutMs = 4_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("云存档读取超时")), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error: unknown) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}
