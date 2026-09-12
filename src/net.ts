import { getCharacter } from "./characters";
import { NET_ENTER_MS, NET_SUMMON_MS, NET_SWING_MS, NET_HOLD_MS, NET_RETURN_MS } from "./engine/combat";
import type { CharacterId, NetState } from "./types";

export const JELLYFISH_NET_URL = new URL("../assets/ultimates/spongebob/jellyfish-net.png", import.meta.url).href;

// 保留原始画布。镜像后柄尾朝向战队；前后层仅分割演出遮挡，不修改素材背景。
const ART = {
  width: 1024, height: 1536, hoopWidth: 676,
  hoop: { x: 585, y: 270 }, grip: { x: 111, y: 1370 },
};
interface Point { x: number; y: number }
interface NetPose { pivot: Point; angle: number; scale: number; opacity: number }
interface NetRun extends NetState {
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  front: HTMLDivElement;
  back: HTMLDivElement;
  glow: HTMLDivElement;
  impact: HTMLDivElement;
  trails: HTMLDivElement[];
}
const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, progress: number): number => from + (to - from) * progress;
const easeOut = (progress: number): number => 1 - (1 - progress) ** 3;
const smooth = (progress: number): number => progress * progress * (3 - 2 * progress);
const point = (from: Point, to: Point, progress: number): Point => ({ x: mix(from.x, to.x, progress), y: mix(from.y, to.y, progress) });
const rotate = (value: Point, angle: number): Point => {
  const radians = angle * Math.PI / 180;
  return { x: value.x * Math.cos(radians) - value.y * Math.sin(radians), y: value.x * Math.sin(radians) + value.y * Math.cos(radians) };
};

/** 只呈现逻辑时间；扣头伤害由 advanceBattle 在 hitAtMs 单次提交。 */
export class NetEffects {
  private readonly runs = new Map<number, NetRun>();

  constructor(
    private readonly layer: HTMLDivElement,
    private readonly backLayer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (id: CharacterId) => HTMLElement | null,
  ) {}

  private create(state: NetState): NetRun {
    const element = (className: string): HTMLDivElement => {
      const node = document.createElement("div");
      node.className = className;
      return node;
    };
    const root = element("net-run");
    root.hidden = true;
    const avatar = new Image();
    avatar.className = "net-avatar";
    avatar.src = getCharacter(state.characterId).imageUrl;
    avatar.alt = "";
    avatar.draggable = false;
    const makeNet = (side: "front" | "back"): HTMLDivElement => {
      const net = element(`net-sprite net-sprite-${side}`);
      const image = new Image();
      image.src = JELLYFISH_NET_URL;
      image.alt = "";
      image.draggable = false;
      image.onerror = () => { image.hidden = true; };
      net.style.setProperty("--net-split", `${ART.hoop.y / ART.height * 100}%`);
      net.append(image);
      return net;
    };
    const front = makeNet("front");
    const back = makeNet("back");
    back.hidden = true;
    const glow = element("net-glow");
    const impact = element("net-impact");
    const trails = Array.from({ length: 3 }, () => element("net-trail"));
    root.append(glow, avatar, ...trails, impact, front);
    this.layer.append(root);
    this.backLayer.append(back);
    return { ...state, root, avatar, front, back, glow, impact, trails };
  }

  sync(states: readonly NetState[]): void {
    const ids = new Set(states.map((state) => state.id));
    for (const [id, run] of this.runs) {
      if (!ids.has(id)) {
        run.root.remove();
        run.back.remove();
        this.runs.delete(id);
      }
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

  private render(run: NetRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const staging = { x: width / 2, y: height / 2 };
    const base = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const large = Math.min(base * 3, width * 0.34, height * 0.78, 128);
    const contact = { x: boss.left + boss.width / 2 - field.left, y: boss.top - field.top + boss.height * 0.12 };
    const netWidth = Math.max(1, Math.min(boss.width * 1.45, width * 0.43, 164)) * ART.width / ART.hoopWidth;
    // 下扣时压缩纵向透视，网袋覆盖头脸，柄尾尽量留在战场底部。
    const netHeight = Math.max(1, Math.min(netWidth * 1.3,
      Math.max(boss.height * 1.35, height - contact.y + 14) * ART.height / (ART.grip.y - ART.hoop.y)));
    const grip = { x: ART.grip.x / ART.width * netWidth, y: ART.grip.y / ART.height * netHeight };
    const hoopVector = {
      x: (ART.hoop.x - ART.grip.x) / ART.width * netWidth,
      y: (ART.hoop.y - ART.grip.y) / ART.height * netHeight,
    };
    const landingGrip = { x: contact.x - hoopVector.x, y: contact.y - hoopVector.y };
    const summonGrip = { x: staging.x + large * 0.28, y: staging.y + large * 0.3 };
    const summon = clamp((run.elapsedMs - NET_ENTER_MS) / NET_SUMMON_MS);
    const swing = clamp((run.elapsedMs - NET_ENTER_MS - NET_SUMMON_MS) / NET_SWING_MS);
    const returning = run.hasHit ? clamp((run.elapsedMs - run.hitAtMs - NET_HOLD_MS) / NET_RETURN_MS) : 0;
    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    run.back.classList.toggle("is-reduced-motion", run.reducedMotion);

    let avatarPosition = staging;
    let avatarSize = large;
    let avatarOpacity = 1;
    if (!run.reducedMotion) {
      if (run.elapsedMs < NET_ENTER_MS) {
        const enter = easeOut(clamp(run.elapsedMs / NET_ENTER_MS));
        avatarPosition = point(origin, staging, enter);
        avatarSize = mix(base, large, enter);
      } else if (returning > 0) {
        const finish = smooth(returning);
        avatarPosition = point(staging, origin, finish);
        avatarSize = mix(large, base, finish);
        avatarOpacity = 1 - finish;
      }
    }
    this.place(run.avatar, avatarPosition, avatarSize, avatarSize, avatarOpacity);
    this.place(run.glow, staging, large * 1.4, large * 1.4,
      run.reducedMotion ? 0 : Math.sin(summon * Math.PI) * 0.65);

    const swingPose = (progress: number): NetPose => {
      const travel = smooth(progress);
      const pivot = point(summonGrip, landingGrip, travel);
      pivot.y -= Math.sin(progress * Math.PI) * Math.min(38, height * 0.25);
      return { pivot, angle: mix(-72, 0, travel), scale: mix(0.68, 1, travel), opacity: 1 };
    };
    let pose: NetPose;
    if (run.reducedMotion) {
      pose = { pivot: landingGrip, angle: 0, scale: 1, opacity: 1 };
    } else if (run.hasHit) {
      const release = easeOut(returning);
      pose = {
        pivot: { x: landingGrip.x - release * large * 0.2, y: landingGrip.y - release * Math.min(48, boss.height * 0.5) },
        angle: -12 * release, scale: 1 - 0.14 * release, opacity: 1 - release,
      };
    } else if (run.elapsedMs < NET_ENTER_MS + NET_SUMMON_MS) {
      pose = { pivot: summonGrip, angle: mix(-35, -72, smooth(summon)), scale: mix(0.45, 0.68, easeOut(summon)), opacity: easeOut(summon) };
    } else {
      // 同批其他技能先击败魔王时，停在接触前，等引擎实际结算后才罩住。
      pose = swingPose(Math.min(0.985, swing));
    }
    for (const node of [run.back, run.front]) {
      node.style.width = `${netWidth}px`;
      node.style.height = `${netHeight}px`;
      node.style.transformOrigin = `${grip.x}px ${grip.y}px`;
      node.style.transform = `translate(${pose.pivot.x - grip.x}px, ${pose.pivot.y - grip.y}px) rotate(${pose.angle}deg) scale(${pose.scale})`;
      node.style.opacity = String(clamp(pose.opacity));
    }

    const hoopAt = (progress: number): Point => {
      const sample = swingPose(progress);
      const offset = rotate(hoopVector, sample.angle);
      return { x: sample.pivot.x + offset.x * sample.scale, y: sample.pivot.y + offset.y * sample.scale };
    };
    run.trails.forEach((trail, index) => {
      const start = hoopAt(clamp(swing - 0.11 - index * 0.075));
      const end = hoopAt(clamp(swing - index * 0.075));
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      trail.style.width = `${Math.hypot(dx, dy)}px`;
      trail.style.opacity = String(!run.reducedMotion && !run.hasHit ? Math.sin(swing * Math.PI) * (0.65 - index * 0.16) : 0);
      trail.style.transform = `translate(${start.x}px, ${start.y}px) rotate(${Math.atan2(dy, dx)}rad)`;
    });
    const impact = run.hasHit ? clamp((run.elapsedMs - run.hitAtMs) / NET_HOLD_MS) : 0;
    this.place(run.impact, contact, boss.width * mix(0.6, 1.3, easeOut(impact)), boss.height * 0.22,
      run.hasHit && !run.reducedMotion ? (1 - impact) * 0.85 : 0);
    run.root.hidden = false;
    run.back.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
    this.backLayer.replaceChildren();
  }
}
