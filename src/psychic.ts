import { getCharacter } from "./characters";
import {
  PSYCHIC_ANTICIPATION_MS,
  PSYCHIC_ENTER_MS,
  PSYCHIC_FADE_MS,
  PSYCHIC_HIT_AT_MS,
} from "./engine/combat";
import type { CharacterId, PsychicState } from "./types";

interface Point {
  x: number;
  y: number;
}

interface PsychicRun extends PsychicState {
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  charge: HTMLDivElement;
  ring: HTMLDivElement;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function mixPoint(from: Point, to: Point, progress: number): Point {
  return { x: mix(from.x, to.x, progress), y: mix(from.y, to.y, progress) };
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function smoothStep(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

function nearestDistance(point: Point, rect: { left: number; right: number; top: number; bottom: number }): number {
  const nearest = {
    x: clamp(point.x, rect.left, rect.right),
    y: clamp(point.y, rect.top, rect.bottom),
  };
  return Math.hypot(nearest.x - point.x, nearest.y - point.y);
}

/** 念力只根据可保存的逻辑进度绘制；圆环接触与伤害结算共用 hitAtMs。 */
export class PsychicEffects {
  private readonly runs = new Map<number, PsychicRun>();

  constructor(
    private readonly layer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (characterId: CharacterId) => HTMLElement | null,
  ) {}

  private create(snapshot: PsychicState): PsychicRun {
    const character = getCharacter(snapshot.characterId);
    const root = document.createElement("div");
    root.className = "psychic-run";
    root.hidden = true;

    const charge = document.createElement("div");
    charge.className = "psychic-charge";
    const ring = document.createElement("div");
    ring.className = "psychic-ring";
    const avatar = document.createElement("img");
    avatar.className = "psychic-avatar";
    avatar.src = character.imageUrl;
    avatar.alt = "";
    avatar.draggable = false;
    avatar.onerror = () => { avatar.hidden = true; };

    root.append(charge, ring, avatar);
    this.layer.append(root);
    return { ...snapshot, root, avatar, charge, ring };
  }

  sync(states: readonly PsychicState[]): void {
    const ids = new Set(states.map((state) => state.id));
    for (const [id, run] of this.runs) {
      if (!ids.has(id)) {
        run.root.remove();
        this.runs.delete(id);
      }
    }
    if (!states.length) return;
    const field = this.layer.getBoundingClientRect();
    const boss = this.boss.getBoundingClientRect();
    for (const snapshot of states) {
      const run = this.runs.get(snapshot.id) ?? this.create(snapshot);
      Object.assign(run, snapshot);
      this.runs.set(snapshot.id, run);
      this.render(run, field, boss, this.getAvatar(run.characterId)?.getBoundingClientRect());
    }
  }

  private setDisc(element: HTMLDivElement, center: Point, diameter: number, opacity: number): void {
    element.style.width = `${diameter}px`;
    element.style.height = `${diameter}px`;
    element.style.opacity = String(clamp(opacity, 0, 1));
    element.style.transform = `translate(${center.x - diameter / 2}px, ${center.y - diameter / 2}px)`;
  }

  private setAvatar(avatar: HTMLImageElement, center: Point, size: number, opacity: number): void {
    avatar.style.width = `${size}px`;
    avatar.style.height = `${size}px`;
    avatar.style.opacity = String(clamp(opacity, 0, 1));
    avatar.style.transform = `translate(${center.x - size / 2}px, ${center.y - size / 2}px)`;
  }

  private render(run: PsychicRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const staging = { x: width / 2, y: height / 2 };
    const baseSize = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const largeSize = Math.min(baseSize * 3, width * 0.34, height * 0.78, 128);
    const returnStartsAt = PSYCHIC_HIT_AT_MS + PSYCHIC_FADE_MS;
    const returnDuration = Math.max(1, run.durationMs - returnStartsAt);

    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    if (run.reducedMotion) {
      this.setAvatar(run.avatar, staging, largeSize, 1);
    } else if (run.elapsedMs < PSYCHIC_ENTER_MS) {
      const progress = easeOutCubic(clamp(run.elapsedMs / PSYCHIC_ENTER_MS, 0, 1));
      this.setAvatar(run.avatar, mixPoint(origin, staging, progress), mix(baseSize, largeSize, progress), 1);
    } else if (run.elapsedMs < PSYCHIC_ENTER_MS + PSYCHIC_ANTICIPATION_MS) {
      const progress = clamp((run.elapsedMs - PSYCHIC_ENTER_MS) / PSYCHIC_ANTICIPATION_MS, 0, 1);
      const shake = Math.sin(run.elapsedMs / 12) * 1.8 * progress;
      const pulse = Math.sin(progress * Math.PI);
      this.setAvatar(
        run.avatar,
        { x: staging.x + shake, y: staging.y - shake * 0.45 },
        largeSize * (1 - easeOutCubic(progress) * 0.065 + pulse * 0.018),
        1,
      );
    } else if (run.elapsedMs < returnStartsAt) {
      const release = clamp((run.elapsedMs - PSYCHIC_ENTER_MS - PSYCHIC_ANTICIPATION_MS) / 160, 0, 1);
      const kick = (1 - release) * (0.075 + Math.sin(release * Math.PI * 2) * 0.018);
      this.setAvatar(run.avatar, staging, largeSize * (1 + kick), 1);
    } else {
      const progress = smoothStep(clamp((run.elapsedMs - returnStartsAt) / returnDuration, 0, 1));
      this.setAvatar(run.avatar, mixPoint(staging, origin, progress), mix(largeSize, baseSize, progress), 1 - progress);
    }

    const anticipation = clamp(
      (run.elapsedMs - PSYCHIC_ENTER_MS) / PSYCHIC_ANTICIPATION_MS,
      0,
      1,
    );
    const releaseFade = clamp(
      (run.elapsedMs - PSYCHIC_ENTER_MS - PSYCHIC_ANTICIPATION_MS) / 160,
      0,
      1,
    );
    const chargeOpacity = run.reducedMotion ? 0.38
      : run.elapsedMs < PSYCHIC_ENTER_MS ? 0
        : anticipation * (1 - releaseFade) * 0.9;
    this.setDisc(run.charge, staging, largeSize * mix(0.9, 1.48, anticipation), chargeOpacity);

    const startRadius = largeSize * 0.46;
    const bossRect = {
      left: boss.left - field.left,
      right: boss.right - field.left,
      top: boss.top - field.top,
      bottom: boss.bottom - field.top,
    };
    const contactRadius = Math.max(startRadius + 8, nearestDistance(staging, bossRect));
    const maximumRadius = Math.max(
      contactRadius + 8,
      Math.hypot(Math.max(staging.x, width - staging.x), Math.max(staging.y, height - staging.y)) + 8,
    );
    let ringRadius = startRadius;
    let ringOpacity = 0;
    const expansionStartsAt = PSYCHIC_ENTER_MS + PSYCHIC_ANTICIPATION_MS;
    if (run.reducedMotion) {
      ringRadius = contactRadius;
      ringOpacity = 0.54;
    } else if (run.elapsedMs >= expansionStartsAt && run.elapsedMs <= PSYCHIC_HIT_AT_MS) {
      const progress = clamp((run.elapsedMs - expansionStartsAt) / (PSYCHIC_HIT_AT_MS - expansionStartsAt), 0, 1);
      ringRadius = mix(startRadius, contactRadius, easeOutCubic(progress));
      ringOpacity = Math.min(1, progress * 4);
    } else if (run.elapsedMs > PSYCHIC_HIT_AT_MS && run.elapsedMs < returnStartsAt) {
      const progress = clamp((run.elapsedMs - PSYCHIC_HIT_AT_MS) / PSYCHIC_FADE_MS, 0, 1);
      ringRadius = mix(contactRadius, maximumRadius, easeOutCubic(progress));
      ringOpacity = 1 - progress;
    }
    this.setDisc(run.ring, staging, ringRadius * 2, ringOpacity);
    run.root.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
  }
}
