import { getCharacter } from "./characters";
import { SPRAY_ENTER_MS, SPRAY_SUMMON_MS, SPRAY_FLY_MS, SPRAY_RETURN_MS } from "./engine/combat";
import type { CharacterId, SprayState } from "./types";

export const SPRAY_CAN_URL = new URL("../assets/ultimates/bart-simpson/spray-can.svg", import.meta.url).href;
interface Point { x: number; y: number }
interface SprayRun extends SprayState {
  soundTriggered?: boolean;
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  can: HTMLImageElement;
  smoke: HTMLDivElement[];
  drops: HTMLDivElement[];
}
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const point = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

/** 烟雾只呈现可保存的逻辑进度，伤害由战斗引擎单次结算。 */
export class SprayEffects {
  private readonly runs = new Map<number, SprayRun>();
  constructor(
    private readonly layer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (id: CharacterId) => HTMLElement | null,
    private readonly onSound: (characterId: CharacterId) => void,
  ) {}

  private create(state: SprayState): SprayRun {
    const element = (name: string): HTMLDivElement => {
      const node = document.createElement("div");
      node.className = `spray-${name}`;
      return node;
    };
    const sprite = (name: string, url: string): HTMLImageElement => {
      const image = new Image();
      image.className = `spray-${name}`;
      image.src = url;
      image.alt = "";
      image.draggable = false;
      image.onerror = () => { image.hidden = true; };
      return image;
    };
    const root = element("run");
    root.hidden = true;
    const avatar = sprite("avatar", getCharacter(state.characterId).imageUrl);
    const can = sprite("can", SPRAY_CAN_URL);
    const smoke = Array.from({ length: 6 }, () => element("smoke"));
    const drops = Array.from({ length: 5 }, () => element("drop"));
    root.append(avatar, ...smoke, can, ...drops);
    this.layer.append(root);
    return { ...state, root, avatar, can, smoke, drops };
  }

  sync(states: readonly SprayState[]): void {
    const ids = new Set(states.map((state) => state.id));
    for (const [id, run] of this.runs) {
      if (!ids.has(id)) { run.root.remove(); this.runs.delete(id); }
    }
    if (!states.length) return;
    const field = this.layer.getBoundingClientRect();
    const boss = this.boss.getBoundingClientRect();
    for (const state of states) {
      const run = this.runs.get(state.id) ?? this.create(state);
      const soundAtMs = run.reducedMotion ? 0 : SPRAY_ENTER_MS;
      const previousElapsedMs = this.runs.has(state.id) ? run.elapsedMs : -1;
      Object.assign(run, state);
      if (!run.soundTriggered && run.elapsedMs >= soundAtMs) {
        run.soundTriggered = true;
        // 只响应跨过动作节点，恢复到动作后半段时不重放。
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

  private render(run: SprayRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const center = { x: width / 2, y: height / 2 };
    const base = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const large = Math.min(base * 3, width * 0.34, height * 0.7, 128);
    const target = { x: boss.left + boss.width / 2 - field.left, y: boss.top + boss.height * 0.48 - field.top };
    const direction = Math.atan2(target.y - center.y, target.x - center.x);
    const axis = { x: Math.cos(direction), y: Math.sin(direction) };
    const normal = { x: -axis.y, y: axis.x };
    const distance = Math.hypot(target.x - center.x, target.y - center.y);
    const canHeight = Math.max(1, Math.min(large * 0.72, height * 0.58, width * 0.16, 78));
    const canWidth = canHeight * 100 / 144;
    const canCenter = {
      x: center.x + axis.x * Math.min(large * 0.58, distance * 0.35),
      y: center.y + axis.y * Math.min(large * 0.58, distance * 0.35) + canHeight * 0.12,
    };
    // SVG 喷嘴出口为 (78, 19)，以素材中心旋转后计算实际喷口位置。
    const nozzle = {
      x: canCenter.x + axis.x * canWidth * 0.28 - normal.x * canHeight * 53 / 144,
      y: canCenter.y + axis.y * canWidth * 0.28 - normal.y * canHeight * 53 / 144,
    };
    const flightDistance = Math.hypot(target.x - nozzle.x, target.y - nozzle.y);
    const flightAngle = Math.atan2(target.y - nozzle.y, target.x - nozzle.x);
    const flightNormal = { x: -Math.sin(flightAngle), y: Math.cos(flightAngle) };
    const aimedCanCenter = {
      x: nozzle.x - Math.cos(flightAngle) * canWidth * 0.28 + flightNormal.x * canHeight * 53 / 144,
      y: nozzle.y - Math.sin(flightAngle) * canWidth * 0.28 + flightNormal.y * canHeight * 53 / 144,
    };
    const enter = easeOut(clamp(run.elapsedMs / SPRAY_ENTER_MS));
    const summon = easeOut(clamp((run.elapsedMs - SPRAY_ENTER_MS) / SPRAY_SUMMON_MS));
    const flying = clamp((run.elapsedMs - SPRAY_ENTER_MS - SPRAY_SUMMON_MS) / SPRAY_FLY_MS);
    const finish = run.hasHit ? clamp((run.elapsedMs - run.hitAtMs) / SPRAY_RETURN_MS) : 0;
    const back = finish * finish * (3 - 2 * finish);
    const reduced = run.reducedMotion;
    run.root.classList.toggle("is-reduced-motion", reduced);
    const avatarPosition = reduced ? center : run.hasHit ? point(center, origin, back) : point(origin, center, enter);
    const avatarSize = reduced ? large : run.hasHit ? mix(large, base, back) : mix(base, large, enter);
    this.place(run.avatar, avatarPosition, avatarSize, avatarSize, reduced ? 1 : 1 - back);
    const scale = reduced ? 1 : mix(0.65, 1, summon);
    this.place(run.can, aimedCanCenter, canWidth * scale, canHeight * scale,
      reduced ? 1 : summon * (1 - finish), flightAngle);

    run.smoke.forEach((smoke, index) => {
      const trail = index / (run.smoke.length - 1);
      const progress = flying * mix(1, 0.18, trail);
      const size = Math.min(large * 0.62, boss.width * 0.55, 52) * mix(0.45, 1, progress);
      // 等待复活时，烟团边缘停在魔王前；只有 hasHit 才能覆盖受击位置。
      const stop = clamp(1 - (size * 0.65 + boss.width * 0.48) / Math.max(1, flightDistance));
      const travel = reduced ? (run.hasHit ? 1 : stop) : run.hasHit ? mix(progress * stop, 1, easeOut(finish)) : progress * stop;
      const location = point(nozzle, target, travel);
      const spread = reduced ? 0 : Math.sin(index * 2.4) * size * 0.18 * (run.hasHit ? 1 + finish : progress);
      location.x += flightNormal.x * spread;
      location.y += flightNormal.y * spread;
      const opacity = reduced ? (index === 0 ? 0.65 : 0) : clamp(flying * 7 - trail) * (1 - finish) * mix(0.85, 0.55, trail);
      const puffSize = size * (run.hasHit && !reduced ? 1 + finish * 0.5 : 1);
      this.place(smoke, location, puffSize, puffSize * 0.8, opacity, flightAngle);
    });
    run.drops.forEach((drop, index) => {
      const angle = index / run.drops.length * Math.PI * 2;
      const travel = finish * Math.min(boss.width * 0.5, 38);
      const location = { x: target.x + Math.cos(angle) * travel, y: target.y + Math.sin(angle) * travel };
      const size = 3 + index % 3;
      this.place(drop, location, size, size * 1.3, run.hasHit && !reduced ? 1 - finish : 0, angle);
    });
    run.root.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
  }
}
