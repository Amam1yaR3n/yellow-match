import { getCharacter } from "./characters";
import { CANDY_ENTER_MS, CANDY_SUMMON_MS, CANDY_FALL_MS, CANDY_RAIN_MS, CANDY_RETURN_MS } from "./engine/combat";
import type { CharacterId, CandyState } from "./types";

interface Point { x: number; y: number }
interface CandyRun extends CandyState {
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  candies: HTMLDivElement[];
  glow: HTMLDivElement;
  impact: HTMLDivElement;
}
const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, progress: number): number => from + (to - from) * progress;
const easeOut = (progress: number): number => 1 - (1 - progress) ** 3;
const point = (from: Point, to: Point, progress: number): Point => ({ x: mix(from.x, to.x, progress), y: mix(from.y, to.y, progress) });

/** 只读取可保存的逻辑进度；第一颗糖豆到达头顶时由战斗逻辑单次结算。 */
export class CandyEffects {
  private readonly runs = new Map<number, CandyRun>();
  constructor(
    private readonly layer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (id: CharacterId) => HTMLElement | null,
  ) {}

  private create(state: CandyState): CandyRun {
    const element = (className: string): HTMLDivElement => {
      const node = document.createElement("div");
      node.className = className;
      return node;
    };
    const root = element("candy-run");
    root.hidden = true;
    const avatar = document.createElement("img");
    avatar.className = "candy-avatar";
    avatar.src = getCharacter(state.characterId).imageUrl;
    avatar.alt = "";
    avatar.draggable = false;
    const candies = Array.from({ length: 18 }, (_, index) => {
      const candy = element(`candy-bean candy-color-${index % 6}`);
      candy.textContent = "m";
      return candy;
    });
    const glow = element("candy-glow");
    const impact = element("candy-impact");
    root.append(glow, ...candies, impact, avatar);
    this.layer.append(root);
    return { ...state, root, avatar, candies, glow, impact };
  }

  sync(states: readonly CandyState[]): void {
    const ids = new Set(states.map((state) => state.id));
    for (const [id, run] of this.runs) {
      if (!ids.has(id)) { run.root.remove(); this.runs.delete(id); }
    }
    if (!states.length) return;
    const field = this.layer.getBoundingClientRect();
    const boss = this.boss.getBoundingClientRect();
    for (const state of states) {
      const run = this.runs.get(state.id) ?? this.create(state);
      Object.assign(run, state);
      this.runs.set(state.id, run);
      this.render(run, field, boss, this.getAvatar(run.characterId)?.getBoundingClientRect());
    }
  }

  private place(node: HTMLElement, center: Point, width: number, height: number, opacity: number): void {
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.opacity = String(clamp(opacity));
    node.style.transform = `translate(${center.x - width / 2}px, ${center.y - height / 2}px)`;
  }

  private render(run: CandyRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const staging = { x: width / 2, y: height / 2 };
    const base = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const large = Math.min(base * 3, width * 0.34, height * 0.78, 128);
    const contact = { x: boss.left + boss.width / 2 - field.left, y: boss.top - field.top + boss.height * 0.08 };
    const summon = clamp((run.elapsedMs - CANDY_ENTER_MS) / CANDY_SUMMON_MS);
    const returnAt = CANDY_ENTER_MS + CANDY_SUMMON_MS + CANDY_FALL_MS + CANDY_RAIN_MS;
    const finish = clamp((run.elapsedMs - returnAt) / CANDY_RETURN_MS);
    const impactProgress = clamp((run.elapsedMs - run.hitAtMs) / 240);
    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);

    let avatarPosition = staging;
    let avatarSize = large;
    let avatarOpacity = run.reducedMotion ? 1 - clamp(run.elapsedMs / run.durationMs) : 1;
    if (!run.reducedMotion) {
      if (run.elapsedMs < CANDY_ENTER_MS) {
        const progress = easeOut(clamp(run.elapsedMs / CANDY_ENTER_MS));
        avatarPosition = point(origin, staging, progress);
        avatarSize = mix(base, large, progress);
      } else if (run.elapsedMs >= returnAt) {
        const progress = finish * finish * (3 - 2 * finish);
        avatarPosition = point(staging, origin, progress);
        avatarSize = mix(large, base, progress);
        avatarOpacity = 1 - progress;
      } else {
        avatarSize *= 1 + Math.sin(summon * Math.PI) * 0.05;
      }
    }
    this.place(run.avatar, avatarPosition, avatarSize, avatarSize, avatarOpacity);
    this.place(run.glow, staging, large * 1.5, large * 1.5,
      run.reducedMotion ? 0 : Math.sin(summon * Math.PI) * 0.65);
    const impactSize = Math.min(90, boss.width * 1.1);
    const impactScale = run.reducedMotion ? 1 : mix(0.5, 1.3, easeOut(impactProgress));
    this.place(run.impact, contact, impactSize * impactScale, impactSize * 0.6 * impactScale,
      run.hasHit ? (1 - impactProgress) * 0.8 : 0);
    run.candies.forEach((candy, index) => {
      const delay = index / (run.candies.length - 1) * CANDY_RAIN_MS;
      const fallStart = CANDY_ENTER_MS + CANDY_SUMMON_MS + delay;
      const hitAt = fallStart + CANDY_FALL_MS;
      const falling = clamp((run.elapsedMs - fallStart) / CANDY_FALL_MS);
      const bounce = clamp((run.elapsedMs - hitAt) / CANDY_RETURN_MS);
      const size = Math.max(10, Math.min(25, boss.width * (0.17 + index % 3 * 0.025), width * 0.075));
      const spread = ((index * 7 % 18) / 17 - 0.5) * Math.min(boss.width * 0.75, width * 0.22);
      const landing = { x: contact.x + spread, y: contact.y - size * 0.39 };
      const distance = Math.max(35, Math.min(105, height * 0.65, field.top + landing.y - size));
      const spawn = { x: landing.x + ((index % 3) - 1) * 9, y: landing.y - distance };
      let center = point(spawn, landing, falling * falling);
      let opacity = clamp((run.elapsedMs - fallStart + CANDY_SUMMON_MS) / CANDY_SUMMON_MS);
      if (run.elapsedMs >= hitAt) {
        const direction = index % 2 ? 1 : -1;
        center = {
          x: landing.x + direction * bounce * Math.min(45, boss.width * 0.45),
          y: landing.y - Math.sin(bounce * Math.PI) * (15 + index % 3 * 5) + bounce * bounce * 15,
        };
        opacity = 1 - bounce;
      }
      if (run.reducedMotion) {
        center = landing;
        opacity = index < 6 ? 1 - clamp(run.elapsedMs / run.durationMs) : 0;
      }
      this.place(candy, center, size, size * 0.78, opacity);
      candy.style.fontSize = `${size * 0.64}px`;
      const angle = run.reducedMotion ? 0 : (index * 47 % 100 - 50) + falling * (index % 2 ? 75 : -75) + bounce * 90;
      candy.style.transform += ` rotate(${angle}deg)`;
    });
    run.root.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
  }
}
