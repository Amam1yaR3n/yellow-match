import { getCharacter } from "./characters";
import {
  SONIC_ANTICIPATION_MS,
  SONIC_CONTACT_MS,
  SONIC_ENTER_MS,
  SONIC_FADE_MS,
  SONIC_HIT_AT_MS,
  SONIC_LAST_RING_END_MS,
  SONIC_RING_COUNT,
  SONIC_RING_INTERVAL_MS,
} from "./engine/combat";
import type { CharacterId, SonicState } from "./types";

interface Point {
  x: number;
  y: number;
}

interface SonicRun extends SonicState {
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  charge: HTMLDivElement;
  rings: HTMLDivElement[];
  impact: HTMLDivElement;
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

function nearestPoint(point: Point, rect: { left: number; right: number; top: number; bottom: number }): Point {
  return {
    x: clamp(point.x, rect.left, rect.right),
    y: clamp(point.y, rect.top, rect.bottom),
  };
}

/** 大笑声波只读取可保存的逻辑进度；首圈抵达魔王边界时与 hitAtMs 同步命中。 */
export class SonicEffects {
  private readonly runs = new Map<number, SonicRun>();

  constructor(
    private readonly layer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (characterId: CharacterId) => HTMLElement | null,
  ) {}

  private create(snapshot: SonicState): SonicRun {
    const character = getCharacter(snapshot.characterId);
    const root = document.createElement("div");
    root.className = "sonic-run";
    root.hidden = true;

    const charge = document.createElement("div");
    charge.className = "sonic-charge";
    const rings = Array.from({ length: SONIC_RING_COUNT }, (_, index) => {
      const ring = document.createElement("div");
      ring.className = "sonic-ring";
      ring.dataset.wave = String(index + 1);
      return ring;
    });
    const impact = document.createElement("div");
    impact.className = "sonic-impact";
    const avatar = document.createElement("img");
    avatar.className = "sonic-avatar";
    avatar.src = character.imageUrl;
    avatar.alt = "";
    avatar.draggable = false;
    avatar.onerror = () => { avatar.hidden = true; };

    root.append(charge, ...rings, impact, avatar);
    this.layer.append(root);
    return { ...snapshot, root, avatar, charge, rings, impact };
  }

  sync(states: readonly SonicState[]): void {
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

  private render(run: SonicRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const staging = { x: width / 2, y: height / 2 };
    const baseSize = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const largeSize = Math.min(baseSize * 3, width * 0.34, height * 0.78, 128);
    const returnDuration = Math.max(1, run.durationMs - SONIC_LAST_RING_END_MS);

    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    if (run.reducedMotion) {
      this.setAvatar(run.avatar, staging, largeSize, 1);
    } else if (run.elapsedMs < SONIC_ENTER_MS) {
      const progress = easeOutCubic(clamp(run.elapsedMs / SONIC_ENTER_MS, 0, 1));
      this.setAvatar(run.avatar, mixPoint(origin, staging, progress), mix(baseSize, largeSize, progress), 1);
    } else if (run.elapsedMs < SONIC_ENTER_MS + SONIC_ANTICIPATION_MS) {
      const progress = clamp((run.elapsedMs - SONIC_ENTER_MS) / SONIC_ANTICIPATION_MS, 0, 1);
      const anticipationScale = 1 - easeOutCubic(progress) * 0.04 + Math.sin(progress * Math.PI) * 0.012;
      this.setAvatar(run.avatar, staging, largeSize * anticipationScale, 1);
    } else if (run.elapsedMs < SONIC_LAST_RING_END_MS) {
      let pulse = 0;
      const expansionStartsAt = SONIC_ENTER_MS + SONIC_ANTICIPATION_MS;
      for (let index = 0; index < SONIC_RING_COUNT; index += 1) {
        const localMs = run.elapsedMs - expansionStartsAt - index * SONIC_RING_INTERVAL_MS;
        if (localMs >= 0 && localMs <= SONIC_RING_INTERVAL_MS) {
          pulse = Math.max(pulse, Math.sin((localMs / SONIC_RING_INTERVAL_MS) * Math.PI) * 0.05);
        }
      }
      this.setAvatar(run.avatar, staging, largeSize * (1 + pulse), 1);
    } else {
      const progress = smoothStep(clamp((run.elapsedMs - SONIC_LAST_RING_END_MS) / returnDuration, 0, 1));
      this.setAvatar(run.avatar, mixPoint(staging, origin, progress), mix(largeSize, baseSize, progress), 1 - progress);
    }

    const anticipation = clamp((run.elapsedMs - SONIC_ENTER_MS) / SONIC_ANTICIPATION_MS, 0, 1);
    if (run.reducedMotion) {
      this.setDisc(run.charge, staging, largeSize * 1.08, 0.24);
    } else if (run.elapsedMs >= SONIC_ENTER_MS && run.elapsedMs < SONIC_ENTER_MS + SONIC_ANTICIPATION_MS) {
      const diameter = largeSize * mix(1.65, 0.92, easeOutCubic(anticipation));
      this.setDisc(run.charge, staging, diameter, Math.sin(anticipation * Math.PI) * 0.78);
    } else {
      this.setDisc(run.charge, staging, largeSize, 0);
    }

    const startRadius = largeSize / 2;
    const bossRect = {
      left: boss.left - field.left,
      right: boss.right - field.left,
      top: boss.top - field.top,
      bottom: boss.bottom - field.top,
    };
    const contactPoint = nearestPoint(staging, bossRect);
    const contactRadius = Math.max(startRadius + 8, Math.hypot(contactPoint.x - staging.x, contactPoint.y - staging.y));
    const maximumRadius = Math.max(
      contactRadius + 8,
      Math.hypot(Math.max(staging.x, width - staging.x), Math.max(staging.y, height - staging.y)) + 8,
    );
    const expansionStartsAt = SONIC_ENTER_MS + SONIC_ANTICIPATION_MS;
    for (let index = 0; index < run.rings.length; index += 1) {
      const ring = run.rings[index];
      if (run.reducedMotion) {
        const radius = mix(startRadius, contactRadius, (index + 1) / SONIC_RING_COUNT);
        this.setDisc(ring, staging, radius * 2, 0.62 - index * 0.1);
        continue;
      }
      const localMs = run.elapsedMs - expansionStartsAt - index * SONIC_RING_INTERVAL_MS;
      if (localMs < 0 || localMs >= SONIC_CONTACT_MS + SONIC_FADE_MS) {
        this.setDisc(ring, staging, startRadius * 2, 0);
      } else if (localMs <= SONIC_CONTACT_MS) {
        const progress = clamp(localMs / SONIC_CONTACT_MS, 0, 1);
        const opacity = Math.min(0.92 - index * 0.06, progress * 5);
        this.setDisc(ring, staging, mix(startRadius, contactRadius, easeOutCubic(progress)) * 2, opacity);
      } else {
        const progress = clamp((localMs - SONIC_CONTACT_MS) / SONIC_FADE_MS, 0, 1);
        this.setDisc(
          ring,
          staging,
          mix(contactRadius, maximumRadius, easeOutCubic(progress)) * 2,
          (0.92 - index * 0.06) * (1 - progress),
        );
      }
    }

    const impactMs = run.elapsedMs - SONIC_HIT_AT_MS;
    if (!run.reducedMotion && run.hasHit && impactMs >= 0 && impactMs < 140) {
      const progress = clamp(impactMs / 140, 0, 1);
      this.setDisc(run.impact, contactPoint, mix(18, 44, easeOutCubic(progress)), 1 - progress);
    } else {
      this.setDisc(run.impact, contactPoint, 18, 0);
    }
    run.root.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
  }
}
