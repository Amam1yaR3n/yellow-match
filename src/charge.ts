import { getCharacter } from "./characters";
import {
  CHARGE_ANTICIPATION_MS,
  CHARGE_DASH_MS,
  CHARGE_ENTER_MS,
  CHARGE_HIT_AT_MS,
  CHARGE_REBOUND_MS,
  KNIFE_SUMMON_MS,
  KNIFE_DASH_MS,
  KNIFE_HOLD_MS,
  KNIFE_RETURN_MS,
  CHEW_CONTACT_MS,
  CHEW_CYCLES,
  CHEW_TRAVEL_MS,
} from "./engine/combat";
import type { CharacterDefinition, CharacterId, ChargeState } from "./types";

interface Point {
  x: number;
  y: number;
}

interface ChargeRun extends ChargeState {
  soundTriggered?: boolean;
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  afterimages: HTMLImageElement[];
  impact: HTMLDivElement;
  knife?: HTMLImageElement;
  knifeGeometry?: { width: number; height: number; boss: DOMRect };
  closedMouth?: HTMLImageElement;
  chewGeometry?: { width: number; height: number; boss: DOMRect };
  vehicle?: { sprite: HTMLDivElement; echoes: HTMLDivElement[]; flash: HTMLDivElement };
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

function easeInCubic(progress: number): number {
  return progress ** 3;
}

function unitVector(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / length, y: dy / length };
}

/** 冲撞只渲染可保存的逻辑进度，不通过动画回调结算伤害。 */
export class ChargeEffects {
  private readonly runs = new Map<number, ChargeRun>();

  constructor(
    private readonly layer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (characterId: CharacterId) => HTMLElement | null,
    private readonly onSound: (characterId: CharacterId) => void,
  ) {}

  private create(snapshot: ChargeState): ChargeRun {
    const character = getCharacter(snapshot.characterId);
    const root = document.createElement("div");
    root.className = "charge-run";
    root.hidden = true;

    const createAvatar = (className: string): HTMLImageElement => {
      const avatar = document.createElement("img");
      avatar.className = className;
      avatar.src = character.imageUrl;
      avatar.alt = "";
      avatar.draggable = false;
      avatar.onerror = () => { avatar.hidden = true; };
      return avatar;
    };

    const afterimages = [
      createAvatar("charge-afterimage charge-afterimage-far"),
      createAvatar("charge-afterimage charge-afterimage-near"),
    ];
    const avatar = createAvatar("charge-avatar");
    let closedMouth: HTMLImageElement | undefined;
    if (character.ultimate.chew) {
      root.classList.add("charge-run-chew");
      avatar.src = character.ultimate.chew.openImageUrl;
      closedMouth = createAvatar("charge-avatar");
      closedMouth.src = character.ultimate.chew.closedImageUrl;
      closedMouth.style.opacity = "0";
    }
    const impact = document.createElement("div");
    impact.className = "charge-impact";
    root.append(...afterimages, avatar, impact);
    if (closedMouth) root.insertBefore(closedMouth, impact);
    let vehicle: ChargeRun["vehicle"];
    if (character.ultimate.vehicle) {
      const art = character.ultimate.vehicle;
      const createCar = (className: string): HTMLDivElement => {
        const sprite = document.createElement("div");
        sprite.className = className;
        const image = document.createElement("img");
        image.src = art.imageUrl;
        image.alt = "";
        image.draggable = false;
        // 仅在布局中排除用户原图的透明留白，保留文件原样。
        image.style.width = `${art.imageWidth / art.bounds.width * 100}%`;
        image.style.height = `${art.imageHeight / art.bounds.height * 100}%`;
        image.style.left = `${-art.bounds.x / art.bounds.width * 100}%`;
        image.style.top = `${-art.bounds.y / art.bounds.height * 100}%`;
        sprite.append(image);
        return sprite;
      };
      const sprite = createCar("charge-car");
      const echoes = [createCar("charge-car charge-car-echo"), createCar("charge-car charge-car-echo")];
      const flash = document.createElement("div");
      flash.className = "charge-transform";
      root.insertBefore(sprite, impact);
      root.insertBefore(flash, impact);
      for (const echo of echoes) root.insertBefore(echo, sprite);
      vehicle = { sprite, echoes, flash };
    }
    let knife: HTMLImageElement | undefined;
    if (character.ultimate.knife) {
      root.classList.add("charge-run-knife");
      knife = document.createElement("img");
      knife.className = "charge-knife";
      knife.src = character.ultimate.knife.imageUrl;
      knife.alt = "";
      knife.draggable = false;
      root.insertBefore(knife, impact);
    }
    this.layer.append(root);
    return { ...snapshot, root, avatar, afterimages, impact, vehicle, closedMouth, knife };
  }

  sync(states: readonly ChargeState[]): void {
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
      const soundAtMs = run.knife ? CHARGE_ENTER_MS + KNIFE_SUMMON_MS
        : run.vehicle ? CHARGE_ENTER_MS
        : run.closedMouth || getCharacter(run.characterId).ultimate.fieldSoundUrl ? CHARGE_ENTER_MS + CHARGE_ANTICIPATION_MS
        : Infinity;
      const previousElapsedMs = this.runs.has(snapshot.id) ? run.elapsedMs : -1;
      Object.assign(run, snapshot);
      if (!run.soundTriggered && run.elapsedMs >= soundAtMs) {
        run.soundTriggered = true;
        // 只响应跨过动作节点，恢复到动作后半段时不重放。
        if (previousElapsedMs < soundAtMs && (previousElapsedMs >= 0 || run.elapsedMs <= soundAtMs + 100)) {
          this.onSound(run.characterId);
        }
      }
      this.runs.set(snapshot.id, run);
      this.render(run, field, boss, this.getAvatar(run.characterId)?.getBoundingClientRect());
    }
  }

  private setAvatar(
    avatar: HTMLImageElement,
    position: Point,
    size: number,
    opacity: number,
    rotation = 0,
    stretch = 1,
  ): void {
    avatar.style.width = `${size}px`;
    avatar.style.height = `${size}px`;
    avatar.style.opacity = String(clamp(opacity, 0, 1));
    avatar.style.transform = `translate(${position.x - size / 2}px, ${position.y - size / 2}px) rotate(${rotation}deg) scaleX(${stretch}) scaleY(${1 / stretch})`;
  }

  private dashPosition(pulled: Point, target: Point, elapsedMs: number): Point {
    const raw = clamp((elapsedMs - CHARGE_ENTER_MS - CHARGE_ANTICIPATION_MS) / CHARGE_DASH_MS, 0, 1);
    const progress = Math.min(0.94, easeInCubic(raw));
    return mixPoint(pulled, target, progress);
  }

  private render(run: ChargeRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const baseSize = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const largeSize = Math.min(baseSize * 3, width * 0.34, height * 0.78, 128);
    const laneRatio = run.laneCount === 1 ? 0 : run.laneIndex / (run.laneCount - 1) * 2 - 1;
    const fanHalfSpan = Math.min(height * 0.18, largeSize * 0.55);
    const staging = {
      x: width / 2,
      y: clamp(height / 2 + laneRatio * fanHalfSpan, largeSize / 2, height - largeSize / 2),
    };
    const target = { x: boss.left + boss.width / 2 - field.left, y: boss.top + boss.height / 2 - field.top };
    if (run.knife) {
      this.renderKnife(run, origin, baseSize, largeSize, field, boss);
      return;
    }
    if (run.closedMouth) {
      this.renderChew(run, origin, baseSize, largeSize, field, boss);
      return;
    }
    const vehicleArt = getCharacter(run.characterId).ultimate.vehicle;
    if (run.vehicle && vehicleArt) {
      this.renderVehicle(run, vehicleArt, origin, staging, baseSize, largeSize, field, boss);
      return;
    }
    const direction = unitVector(staging, target);
    const pulled = {
      x: staging.x - direction.x * largeSize * 0.06,
      y: staging.y - direction.y * largeSize * 0.06,
    };
    const dashAngle = Math.atan2(target.y - pulled.y, target.x - pulled.x) * 180 / Math.PI;
    const spinDirection = run.laneIndex % 2 === 0 ? -1 : 1;

    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    if (run.reducedMotion) {
      this.setAvatar(run.avatar, staging, largeSize, 1);
      for (const afterimage of run.afterimages) afterimage.style.opacity = "0";
      const impactSize = Math.min(largeSize * 1.15, Math.max(42, boss.width * 1.2));
      run.impact.style.width = `${impactSize}px`;
      run.impact.style.height = `${impactSize}px`;
      run.impact.style.opacity = run.hasHit ? ".72" : "0";
      run.impact.style.transform = `translate(${target.x - impactSize / 2}px, ${target.y - impactSize / 2}px)`;
      run.root.hidden = false;
      return;
    }

    let position = origin;
    let size = baseSize;
    let opacity = 1;
    let rotation = 0;
    let stretch = 1;

    if (run.elapsedMs < CHARGE_ENTER_MS) {
      const progress = easeOutCubic(clamp(run.elapsedMs / CHARGE_ENTER_MS, 0, 1));
      position = mixPoint(origin, staging, progress);
      size = mix(baseSize, largeSize, progress);
    } else if (run.elapsedMs < CHARGE_ENTER_MS + CHARGE_ANTICIPATION_MS) {
      const progress = clamp((run.elapsedMs - CHARGE_ENTER_MS) / CHARGE_ANTICIPATION_MS, 0, 1);
      const pulse = Math.sin(progress * Math.PI);
      position = mixPoint(staging, pulled, easeOutCubic(progress));
      size = largeSize * (1 + pulse * 0.055);
      rotation = spinDirection * pulse * 3;
      stretch = 1 - pulse * 0.04;
    } else if (!run.hasHit) {
      position = this.dashPosition(pulled, target, run.elapsedMs);
      const progress = clamp((run.elapsedMs - CHARGE_ENTER_MS - CHARGE_ANTICIPATION_MS) / CHARGE_DASH_MS, 0, 1);
      rotation = dashAngle * 0.08 + spinDirection * 5 * progress;
      stretch = 1 + 0.18 * progress;
    } else {
      const progress = easeOutCubic(clamp((run.elapsedMs - CHARGE_HIT_AT_MS) / CHARGE_REBOUND_MS, 0, 1));
      const rebound = Math.min(28, Math.hypot(target.x - pulled.x, target.y - pulled.y) * 0.18);
      position = { x: target.x - direction.x * rebound * progress, y: target.y - direction.y * rebound * progress };
      size = largeSize * mix(1, 0.78, progress);
      opacity = 1 - progress;
      rotation = dashAngle * 0.08 + spinDirection * 12 * progress;
      stretch = mix(1.18, 0.92, progress);
    }
    this.setAvatar(run.avatar, position, size, opacity, rotation, stretch);

    const dashStarted = run.elapsedMs >= CHARGE_ENTER_MS + CHARGE_ANTICIPATION_MS && run.elapsedMs < CHARGE_HIT_AT_MS && !run.hasHit;
    const delays = [130, 70];
    run.afterimages.forEach((afterimage, index) => {
      if (!dashStarted) {
        afterimage.style.opacity = "0";
        return;
      }
      const delayedElapsed = Math.max(CHARGE_ENTER_MS + CHARGE_ANTICIPATION_MS, run.elapsedMs - delays[index]);
      const echoPosition = this.dashPosition(pulled, target, delayedElapsed);
      const dashProgress = clamp((run.elapsedMs - CHARGE_ENTER_MS - CHARGE_ANTICIPATION_MS) / CHARGE_DASH_MS, 0, 1);
      this.setAvatar(afterimage, echoPosition, largeSize, (index === 0 ? 0.16 : 0.32) * dashProgress, rotation, 1.08);
    });

    if (run.hasHit) {
      const impactProgress = clamp((run.elapsedMs - CHARGE_HIT_AT_MS) / CHARGE_REBOUND_MS, 0, 1);
      const easedImpact = easeOutCubic(impactProgress);
      const impactSize = Math.min(largeSize * 1.35, Math.max(50, boss.width * 1.35));
      run.impact.style.width = `${impactSize}px`;
      run.impact.style.height = `${impactSize}px`;
      run.impact.style.opacity = String(1 - impactProgress);
      run.impact.style.transform = `translate(${target.x - impactSize / 2}px, ${target.y - impactSize / 2}px) scale(${0.45 + easedImpact * 0.9})`;
    } else {
      run.impact.style.opacity = "0";
    }
    run.root.hidden = false;
  }

  private renderKnife(
    run: ChargeRun, origin: Point, baseSize: number, largeSize: number, field: DOMRect, boss: DOMRect,
  ): void {
    // 固定本次受击点，防止魔王受击抖动拖动角色与刀；窗口变化时重新布局。
    if (!run.knifeGeometry || run.knifeGeometry.width !== field.width || run.knifeGeometry.height !== field.height) {
      run.knifeGeometry = {
        width: field.width, height: field.height,
        boss: new DOMRect(boss.left - field.left, boss.top - field.top, boss.width, boss.height),
      };
    }
    const bounds = run.knifeGeometry.boss;
    const staging = { x: field.width / 2, y: field.height / 2 };
    const contact = { x: bounds.left + bounds.width * 0.28, y: bounds.top + bounds.height * 0.48 };
    const direction = unitVector(staging, contact);
    const normal = { x: -direction.y, y: direction.x };
    const angle = Math.atan2(direction.y, direction.x) * 180 / Math.PI;
    // SVG 柄中点为 (45,35)，刀尖为 (231,35)。刀尖到达接触点时才命中。
    const knifeWidth = Math.min(largeSize * 0.9, field.width * 0.22);
    const reach = largeSize * 0.22 + knifeWidth * (231 - 45) / 240;
    const target = {
      x: contact.x - direction.x * reach - normal.x * largeSize * 0.23,
      y: contact.y - direction.y * reach - normal.y * largeSize * 0.23,
    };
    const summon = clamp((run.elapsedMs - CHARGE_ENTER_MS) / KNIFE_SUMMON_MS, 0, 1);
    const dashAtMs = CHARGE_ENTER_MS + KNIFE_SUMMON_MS;
    const dash = clamp((run.elapsedMs - dashAtMs) / KNIFE_DASH_MS, 0, 1);
    const returning = run.hasHit ? clamp((run.elapsedMs - run.hitAtMs - KNIFE_HOLD_MS) / KNIFE_RETURN_MS, 0, 1) : 0;
    const smoothReturn = returning * returning * (3 - 2 * returning);
    const dashPosition = (elapsedMs: number): Point => mixPoint(staging, target,
      Math.min(0.97, easeInCubic(clamp((elapsedMs - dashAtMs) / KNIFE_DASH_MS, 0, 1))));
    let position = staging;
    let size = largeSize;
    let opacity = 1;
    if (!run.reducedMotion) {
      if (run.elapsedMs < CHARGE_ENTER_MS) {
        const enter = easeOutCubic(clamp(run.elapsedMs / CHARGE_ENTER_MS, 0, 1));
        position = mixPoint(origin, staging, enter);
        size = mix(baseSize, largeSize, enter);
      } else if (run.hasHit) {
        position = mixPoint(target, origin, smoothReturn);
        size = mix(largeSize, baseSize, smoothReturn);
        opacity = 1 - smoothReturn;
      } else if (run.elapsedMs >= dashAtMs) {
        // 尚未结算时停在刀尖接触前，等待魔王复活。
        position = dashPosition(run.elapsedMs);
      }
    }
    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    this.setAvatar(run.avatar, position, size, opacity);
    const scale = size / largeSize;
    const grip = {
      x: position.x + direction.x * size * 0.22 + normal.x * size * 0.23,
      y: position.y + direction.y * size * 0.22 + normal.y * size * 0.23,
    };
    const bladeWidth = knifeWidth * scale;
    const bladeHeight = bladeWidth / 3;
    const knife = run.knife!;
    knife.style.width = `${bladeWidth}px`;
    knife.style.height = `${bladeHeight}px`;
    knife.style.transformOrigin = "18.75% 43.75%";
    knife.style.transform = `translate(${grip.x - bladeWidth * 45 / 240}px, ${grip.y - bladeHeight * 35 / 80}px) rotate(${angle}deg) scale(${run.reducedMotion ? 1 : mix(0.5, 1, easeOutCubic(summon))})`;
    knife.style.opacity = String(run.reducedMotion ? 1 : easeOutCubic(summon) * opacity);
    run.afterimages.forEach((echo, index) => {
      const visible = !run.reducedMotion && !run.hasHit && run.elapsedMs >= dashAtMs;
      this.setAvatar(echo, dashPosition(run.elapsedMs - (index === 0 ? 90 : 45)), largeSize,
        visible ? (index === 0 ? 0.14 : 0.28) * Math.sin(dash * Math.PI) : 0);
    });
    const impact = clamp((run.elapsedMs - run.hitAtMs) / (KNIFE_HOLD_MS + 100), 0, 1);
    const impactSize = Math.min(largeSize, bounds.width * 0.85);
    run.impact.style.width = `${impactSize}px`;
    run.impact.style.height = `${impactSize}px`;
    run.impact.style.opacity = run.hasHit ? String(run.reducedMotion ? 0.65 : 1 - impact) : "0";
    run.impact.style.transform = `translate(${contact.x - impactSize / 2}px, ${contact.y - impactSize / 2}px) scale(${run.reducedMotion ? 1 : 0.5 + easeOutCubic(impact) * 0.8})`;
    run.root.hidden = false;
  }

  private renderChew(
    run: ChargeRun,
    origin: Point,
    baseSize: number,
    largeSize: number,
    field: DOMRect,
    boss: DOMRect,
  ): void {
    // 锁定本次穿越的水平线，避免受击抖动带动吃豆人的轨迹。
    if (!run.chewGeometry || run.chewGeometry.width !== field.width || run.chewGeometry.height !== field.height) {
      run.chewGeometry = {
        width: field.width, height: field.height,
        boss: new DOMRect(boss.left - field.left, boss.top - field.top, boss.width, boss.height),
      };
    }
    const bossBounds = run.chewGeometry.boss;
    const travelAtMs = CHARGE_ENTER_MS + CHARGE_ANTICIPATION_MS;
    const travelMs = clamp(run.elapsedMs - travelAtMs, 0, CHEW_TRAVEL_MS);
    const contact = {
      x: bossBounds.left + bossBounds.width * 0.12,
      y: bossBounds.top + bossBounds.height / 2,
    };
    // 身体右边缘接触魔王；随后沿同一水平线穿过整个魔王。
    const touch = { x: contact.x - largeSize / 2, y: contact.y };
    const staging = {
      x: Math.max(largeSize / 2, Math.min(field.width / 2, touch.x - largeSize * 0.65)),
      y: contact.y,
    };
    const exit = {
      x: Math.max(field.width + largeSize / 2, bossBounds.right + largeSize),
      y: contact.y,
    };
    const afterContactMs = CHEW_TRAVEL_MS - CHEW_CONTACT_MS;
    const passProgress = clamp((run.elapsedMs - run.hitAtMs) / afterContactMs, 0, 1);
    let position = staging;
    let bodySize = largeSize;
    let opacity = 1;
    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    for (const afterimage of run.afterimages) afterimage.style.opacity = "0";

    if (run.reducedMotion) {
      opacity = 1 - clamp(run.elapsedMs / run.durationMs, 0, 1);
    } else if (run.elapsedMs < CHARGE_ENTER_MS) {
      const progress = easeOutCubic(clamp(run.elapsedMs / CHARGE_ENTER_MS, 0, 1));
      position = mixPoint(origin, staging, progress);
      bodySize = mix(baseSize * 0.84, largeSize, progress);
    } else if (run.elapsedMs >= travelAtMs) {
      position = run.hasHit
        ? mixPoint(touch, exit, passProgress)
        : mixPoint(staging, touch, Math.min(0.999, travelMs / CHEW_CONTACT_MS));
      // 越过魔王后才开始淡出，保持穿越过程可见。
      const fadeStart = clamp((bossBounds.right + largeSize / 2 - touch.x) / Math.max(1, exit.x - touch.x), 0, 0.85);
      opacity = run.hasHit ? 1 - clamp((passProgress - fadeStart) / (1 - fadeStart), 0, 1) : 1;
    }

    // 两张素材常驻，按逻辑时间交替显示；暂停或读档不会重启咀嚼。
    const closed = !run.reducedMotion && run.elapsedMs >= travelAtMs
      && Math.floor(travelMs / (CHEW_TRAVEL_MS / (CHEW_CYCLES * 2))) % 2 === 1
      && run.closedMouth!.complete && run.closedMouth!.naturalWidth > 0;
    // 仅校准原始透明画布的留白，不裁切或改写生成素材。
    const openSize = bodySize / (731 / 1024);
    const closedSize = bodySize / (897 / 1254);
    this.setAvatar(run.avatar, { x: position.x - openSize * 0.015, y: position.y }, openSize, closed ? 0 : opacity);
    this.setAvatar(run.closedMouth!, { x: position.x - closedSize * 0.019, y: position.y }, closedSize, closed ? opacity : 0);

    const impactProgress = clamp((run.elapsedMs - run.hitAtMs) / CHARGE_REBOUND_MS, 0, 1);
    const impactSize = Math.min(largeSize * 1.35, Math.max(50, boss.width * 1.35));
    run.impact.style.width = `${impactSize}px`;
    run.impact.style.height = `${impactSize}px`;
    run.impact.style.opacity = run.hasHit ? String((1 - impactProgress) * (run.reducedMotion ? 0.72 : 1)) : "0";
    const impactScale = run.reducedMotion ? 1 : 0.45 + easeOutCubic(impactProgress) * 0.9;
    run.impact.style.transform = `translate(${contact.x - impactSize / 2}px, ${contact.y - impactSize / 2}px) scale(${impactScale})`;
    run.root.hidden = false;
  }

  private renderVehicle(
    run: ChargeRun,
    art: NonNullable<CharacterDefinition["ultimate"]["vehicle"]>,
    origin: Point,
    staging: Point,
    baseSize: number,
    largeSize: number,
    field: DOMRect,
    boss: DOMRect,
  ): void {
    const { sprite, echoes, flash } = run.vehicle!;
    const aspect = art.bounds.width / art.bounds.height;
    const contact = {
      x: boss.left - field.left + boss.width * 0.12,
      y: boss.top - field.top + boss.height * 0.55,
    };
    const carWidth = Math.max(1, Math.min(
      largeSize * 1.85, field.width * 0.38, field.height * 0.65 * aspect,
      Math.max(1, contact.x - staging.x - 12) * 2,
    ));
    const carHeight = carWidth / aspect;
    // 车头（素材右边界）到达受击点，而非让车体中心穿进魔王。
    const target = { x: contact.x - carWidth / 2, y: contact.y };
    const pulled = { x: staging.x - largeSize * 0.06, y: staging.y };
    const dashAtMs = run.hitAtMs - CHARGE_DASH_MS;
    const transformMs = dashAtMs - CHARGE_ENTER_MS;
    const transformProgress = clamp((run.elapsedMs - CHARGE_ENTER_MS) / transformMs, 0, 1);
    const switched = run.reducedMotion || transformProgress >= 0.3;
    const dashProgress = clamp((run.elapsedMs - dashAtMs) / CHARGE_DASH_MS, 0, 1);
    const reboundProgress = clamp((run.elapsedMs - run.hitAtMs) / CHARGE_REBOUND_MS, 0, 1);
    const carPosition = (elapsedMs: number): Point => {
      const progress = clamp((elapsedMs - dashAtMs) / CHARGE_DASH_MS, 0, 1);
      // 未结算时在接触前等待，包括魔王复活冻结的情况。
      return mixPoint(pulled, target, Math.min(0.98, easeInCubic(progress)));
    };
    const setCar = (element: HTMLDivElement, position: Point, opacity: number): void => {
      element.style.width = `${carWidth}px`;
      element.style.height = `${carHeight}px`;
      element.style.opacity = String(clamp(opacity, 0, 1));
      element.style.transform = `translate(${position.x - carWidth / 2}px, ${position.y - carHeight / 2}px)`;
    };

    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    for (const afterimage of run.afterimages) afterimage.style.opacity = "0";
    let position = staging;
    let opacity = switched ? 1 : 0;
    if (run.reducedMotion) {
      run.avatar.style.opacity = "0";
    } else if (run.elapsedMs < CHARGE_ENTER_MS) {
      const progress = easeOutCubic(clamp(run.elapsedMs / CHARGE_ENTER_MS, 0, 1));
      this.setAvatar(run.avatar, mixPoint(origin, staging, progress), mix(baseSize, largeSize, progress), 1);
    } else {
      this.setAvatar(run.avatar, staging, largeSize * (1 + Math.sin(transformProgress * Math.PI) * 0.05), switched ? 0 : 1);
      if (run.hasHit) {
        const rebound = Math.min(28, Math.hypot(target.x - pulled.x, target.y - pulled.y) * 0.18);
        const direction = unitVector(pulled, target);
        const progress = easeOutCubic(reboundProgress);
        position = { x: target.x - direction.x * rebound * progress, y: target.y - direction.y * rebound * progress };
        opacity = 1 - progress;
      } else if (run.elapsedMs >= dashAtMs) {
        position = carPosition(run.elapsedMs);
      } else {
        position = mixPoint(staging, pulled, easeOutCubic(transformProgress));
      }
    }
    setCar(sprite, position, opacity);
    echoes.forEach((echo, index) => {
      const visible = !run.reducedMotion && !run.hasHit && run.elapsedMs >= dashAtMs;
      setCar(echo, carPosition(run.elapsedMs - (index === 0 ? 130 : 70)), visible ? (index === 0 ? 0.16 : 0.32) * dashProgress : 0);
    });

    // 切换时闪光达到峰值，随后露出汽车并留出蓄力时间。
    const flashProgress = clamp(transformProgress / 0.6, 0, 1);
    const flashSize = Math.max(largeSize * 1.35, carWidth * 1.05);
    flash.style.width = `${flashSize}px`;
    flash.style.height = `${Math.max(largeSize * 1.3, carHeight * 1.4)}px`;
    flash.style.left = `${staging.x}px`;
    flash.style.top = `${staging.y}px`;
    flash.style.opacity = String(run.reducedMotion ? 0 : Math.sin(flashProgress * Math.PI));
    flash.style.transform = `translate(-50%, -50%) scale(${0.7 + flashProgress * 0.45})`;

    const impactSize = Math.min(largeSize * 1.35, Math.max(50, boss.width * 1.35));
    run.impact.style.width = `${impactSize}px`;
    run.impact.style.height = `${impactSize}px`;
    run.impact.style.opacity = run.hasHit ? String(run.reducedMotion ? 0.72 : 1 - reboundProgress) : "0";
    const impactScale = run.reducedMotion ? 1 : 0.45 + easeOutCubic(reboundProgress) * 0.9;
    run.impact.style.transform = `translate(${contact.x - impactSize / 2}px, ${contact.y - impactSize / 2}px) scale(${impactScale})`;
    run.root.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
  }
}
