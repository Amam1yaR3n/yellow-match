import { getCharacter } from "./characters";
import { BANANA_ENTER_MS, BANANA_ASIDE_MS, BANANA_SUMMON_MS, BANANA_FIRE_AT_MS, BANANA_FLY_MS, BANANA_RETURN_MS } from "./engine/combat";
import type { BananaState, CharacterId } from "./types";

export const CANNON_URL = new URL("../assets/ultimates/minion/cannon.png", import.meta.url).href;
export const BANANA_URL = new URL("../assets/ultimates/minion/banana.png", import.meta.url).href;
interface Point { x: number; y: number }
interface BananaRun extends BananaState {
  soundTriggered?: boolean;
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  cannon: HTMLDivElement;
  banana: HTMLDivElement;
  smoke: HTMLDivElement[];
  impact: HTMLDivElement;
}
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const point = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
const within = (value: number, size: number, edge: number): number => Math.max(edge, Math.min(size - edge, value));

/** 画面只读取保存的逻辑时间，香蕉命中与伤害均由战斗引擎推进。 */
export class BananaEffects {
  private readonly runs = new Map<number, BananaRun>();
  constructor(
    private readonly layer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (id: CharacterId) => HTMLElement | null,
    private readonly onSound: (characterId: CharacterId) => void,
  ) {}

  private create(state: BananaState): BananaRun {
    const element = (name: string): HTMLDivElement => {
      const node = document.createElement("div");
      node.className = `banana-${name}`;
      return node;
    };
    const sprite = (name: string, url: string): HTMLDivElement => {
      const node = element(name);
      const image = new Image();
      image.src = url;
      image.alt = "";
      image.draggable = false;
      image.onerror = () => { image.hidden = true; };
      node.append(image);
      return node;
    };
    const root = element("run");
    root.hidden = true;
    const avatar = new Image();
    avatar.className = "banana-avatar";
    avatar.src = getCharacter(state.characterId).imageUrl;
    avatar.alt = "";
    avatar.draggable = false;
    const cannon = sprite("cannon", CANNON_URL);
    const banana = sprite("projectile", BANANA_URL);
    const smoke = Array.from({ length: 3 }, () => element("smoke"));
    const impact = element("impact");
    root.append(avatar, cannon, ...smoke, banana, impact);
    this.layer.append(root);
    return { ...state, root, avatar, cannon, banana, smoke, impact };
  }

  sync(states: readonly BananaState[]): void {
    const ids = new Set(states.map((state) => state.id));
    for (const [id, run] of this.runs) {
      if (!ids.has(id)) { run.root.remove(); this.runs.delete(id); }
    }
    if (!states.length) return;
    const field = this.layer.getBoundingClientRect();
    const boss = this.boss.getBoundingClientRect();
    for (const state of states) {
      const run = this.runs.get(state.id) ?? this.create(state);
      const soundAtMs = state.reducedMotion ? 0 : BANANA_ENTER_MS + BANANA_ASIDE_MS;
      const previousElapsedMs = this.runs.has(state.id) ? run.elapsedMs : -1;
      Object.assign(run, state);
      if (!run.soundTriggered && run.elapsedMs >= soundAtMs) {
        run.soundTriggered = true;
        // 大炮开始显现时播放一次；恢复到动作后半段时不补播。
        if (previousElapsedMs < soundAtMs && (previousElapsedMs >= 0 || run.elapsedMs <= soundAtMs + 100)) {
          this.onSound(run.characterId);
        }
      }
      this.runs.set(state.id, run);
      this.render(run, field, boss, this.getAvatar(run.characterId)?.getBoundingClientRect());
    }
  }

  private place(node: HTMLElement, center: Point, width: number, height: number, opacity: number, angle = 0): void {
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.opacity = String(clamp(opacity));
    node.style.transform = `translate(${center.x - width / 2}px, ${center.y - height / 2}px) rotate(${angle}rad)`;
  }

  private render(run: BananaRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const center = { x: width / 2, y: height / 2 };
    const base = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const large = Math.min(base * 3, width * 0.34, height * 0.7, 128);
    const aside = {
      x: within(center.x - large * 0.8, width, large / 2),
      y: within(center.y - large * 0.5, height, large / 2),
    };
    const entering = easeOut(clamp(run.elapsedMs / BANANA_ENTER_MS));
    const movingAside = easeOut(clamp((run.elapsedMs - BANANA_ENTER_MS) / BANANA_ASIDE_MS));
    const summon = clamp((run.elapsedMs - BANANA_ENTER_MS - BANANA_ASIDE_MS) / BANANA_SUMMON_MS);
    const flying = clamp((run.elapsedMs - BANANA_FIRE_AT_MS) / BANANA_FLY_MS);
    const finish = run.hasHit ? clamp((run.elapsedMs - run.hitAtMs) / BANANA_RETURN_MS) : 0;
    const returning = finish * finish * (3 - 2 * finish);
    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);

    let avatarPosition = run.elapsedMs < BANANA_ENTER_MS ? point(origin, center, entering) : point(center, aside, movingAside);
    let avatarSize = mix(base, large, entering);
    let avatarOpacity = 1;
    if (run.reducedMotion) {
      avatarPosition = aside;
      avatarSize = large;
    } else if (run.hasHit) {
      avatarPosition = point(aside, origin, returning);
      avatarSize = mix(large, base, returning);
      avatarOpacity = 1 - returning;
    }
    this.place(run.avatar, avatarPosition, avatarSize, avatarSize, avatarOpacity);

    // 整张 PNG 保留原始透明通道，仅通过布局处理素材留白。
    const cannonWidth = Math.min(140, width * 0.32, height * 0.95);
    const cannonHeight = cannonWidth * 800 / 1405;
    const cannonCenter = { x: center.x, y: within(center.y + height * 0.2, height, cannonWidth / 2) };
    const target = { x: boss.left + boss.width * 0.42 - field.left, y: boss.top + boss.height * 0.48 - field.top };
    const dx = target.x - cannonCenter.x;
    const dy = target.y - cannonCenter.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const muzzleY = -cannonHeight * 0.27;
    const angle = Math.atan2(dy, dx) - Math.asin(Math.max(-1, Math.min(1, muzzleY / distance)));
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const muzzle = {
      x: cannonCenter.x + direction.x * cannonWidth * 0.48 - direction.y * muzzleY,
      y: cannonCenter.y + direction.y * cannonWidth * 0.48 + direction.x * muzzleY,
    };
    const recoil = run.reducedMotion ? 0 : Math.sin(clamp((run.elapsedMs - BANANA_FIRE_AT_MS) / 200) * Math.PI) * cannonWidth * 0.055;
    const summonScale = run.reducedMotion ? 1 : 0.7 + 0.3 * easeOut(summon) + Math.sin(summon * Math.PI) * 0.06;
    const cannonOpacity = run.reducedMotion ? 1 : summon * (1 - returning);
    this.place(run.cannon, { x: cannonCenter.x - direction.x * recoil, y: cannonCenter.y - direction.y * recoil },
      cannonWidth * summonScale, cannonHeight * summonScale, cannonOpacity, angle);

    const bananaWidth = Math.min(56, width * 0.14, cannonWidth * 0.43);
    // 未获准结算时，香蕉前端停在魔王前，避免同批技能击杀造成提前命中的画面。
    const flightDistance = Math.max(1, Math.hypot(target.x - muzzle.x, target.y - muzzle.y));
    const flightEnd = point(muzzle, target, Math.max(0, 1 - (bananaWidth / 2 + 3) / flightDistance));
    const bananaPosition = run.reducedMotion ? point(muzzle, flightEnd, 0.6) : point(muzzle, flightEnd, flying);
    const flightAngle = Math.atan2(target.y - muzzle.y, target.x - muzzle.x);
    const bananaOpacity = run.reducedMotion ? 1 : Number(run.elapsedMs >= BANANA_FIRE_AT_MS && !run.hasHit);
    this.place(run.banana, bananaPosition, bananaWidth, bananaWidth * 770 / 1450, bananaOpacity, flightAngle);

    const smokeProgress = clamp((run.elapsedMs - BANANA_FIRE_AT_MS) / 240);
    run.smoke.forEach((smoke, index) => {
      const spread = (index - 1) * (4 + smokeProgress * 12);
      const travel = 6 + smokeProgress * 18;
      const position = {
        x: muzzle.x + direction.x * travel - direction.y * spread,
        y: muzzle.y + direction.y * travel + direction.x * spread,
      };
      const size = (8 + index * 2) * (0.7 + smokeProgress);
      this.place(smoke, position, size, size, !run.reducedMotion && run.elapsedMs >= BANANA_FIRE_AT_MS ? (1 - smokeProgress) * 0.85 : 0);
    });
    const impactSize = Math.min(56, boss.width * 0.65) * mix(0.7, 1.15, easeOut(finish));
    this.place(run.impact, target, impactSize, impactSize, !run.reducedMotion && run.hasHit ? 1 - finish : 0);
    run.root.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
  }
}
