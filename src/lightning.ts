import type { CharacterId, LightningState } from "./types";
import { getCharacter } from "./characters";

const ENTER_MS = 400;
const DISCHARGE_MS = 1_000;
const RETURN_MS = 400;
const SVG_NS = "http://www.w3.org/2000/svg";

interface Point {
  x: number;
  y: number;
}

interface LightningRun extends LightningState {
  root: HTMLDivElement;
  avatar: HTMLImageElement;
  arcs: SVGSVGElement;
  bolts: SVGPathElement[];
  branches: SVGPathElement;
  impact: SVGGElement;
  geometryKey: string;
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, className: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute("class", className);
  return element;
}

function pathThrough(points: readonly Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

/** 电击只渲染逻辑状态中的演出进度，不拥有伤害回调。 */
export class LightningEffects {
  private readonly runs = new Map<number, LightningRun>();

  constructor(
    private readonly layer: HTMLDivElement,
    private readonly boss: HTMLElement,
    private readonly getAvatar: (characterId: CharacterId) => HTMLElement | null,
  ) {}

  private create(snapshot: LightningState): LightningRun {
    const character = getCharacter(snapshot.characterId);
    const root = document.createElement("div");
    root.className = "lightning-run";
    root.hidden = true;
    const avatar = document.createElement("img");
    avatar.className = "lightning-avatar";
    avatar.src = character.imageUrl;
    avatar.alt = "";
    avatar.draggable = false;
    avatar.onerror = () => { avatar.hidden = true; };

    const arcs = svgElement("svg", "lightning-arcs");
    arcs.setAttribute("preserveAspectRatio", "none");
    const bolts = ["halo", "edge", "gold", "core"].map((style) => svgElement("path", `lightning-bolt lightning-bolt-${style}`));
    const branches = svgElement("path", "lightning-branches");
    const impact = svgElement("g", "lightning-impact");
    const glow = svgElement("circle", "lightning-impact-glow");
    glow.setAttribute("r", "22");
    const sparks = svgElement("path", "lightning-sparks");
    sparks.setAttribute("d", Array.from({ length: 8 }, (_, index) => {
      const angle = index * Math.PI / 4;
      const length = index % 2 === 0 ? 27 : 20;
      return pathThrough([
        { x: Math.cos(angle) * 11, y: Math.sin(angle) * 11 },
        { x: Math.cos(angle + 0.12) * length, y: Math.sin(angle + 0.12) * length },
      ]);
    }).join(" "));
    const core = svgElement("circle", "lightning-impact-core");
    core.setAttribute("r", "6");
    impact.append(glow, sparks, core);
    arcs.append(...bolts, branches, impact);
    root.append(arcs, avatar);
    this.layer.append(root);
    return { ...snapshot, root, avatar, arcs, bolts, branches, impact, geometryKey: "" };
  }

  sync(states: readonly LightningState[]): void {
    const ids = new Set(states.map((state) => state.id));
    for (const [id, run] of this.runs) {
      if (!ids.has(id)) { run.root.remove(); this.runs.delete(id); }
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

  private render(run: LightningRun, field: DOMRect, boss: DOMRect, source?: DOMRect): void {
    const width = Math.max(1, field.width);
    const height = Math.max(1, field.height);
    const origin = source
      ? { x: source.left + source.width / 2 - field.left, y: source.top + source.height / 2 - field.top }
      : { x: width * 0.22, y: height / 2 };
    const baseSize = Math.max(1, Math.min(source?.width ?? 28, source?.height ?? 28, width * 0.2, height * 0.35));
    const largeSize = Math.min(baseSize * 3, width * 0.34, height * 0.78, 128);
    const enter = Math.min(1, run.elapsedMs / ENTER_MS);
    const leave = Math.min(1, Math.max(0, (run.elapsedMs - ENTER_MS - DISCHARGE_MS) / RETURN_MS));
    const travel = run.reducedMotion ? 1 : (1 - (1 - enter) ** 3) * (1 - leave * leave * (3 - 2 * leave));
    const size = baseSize + (largeSize - baseSize) * travel;
    const position = {
      x: origin.x + (width / 2 - origin.x) * travel,
      y: origin.y + (height / 2 - origin.y) * travel,
    };
    run.root.classList.toggle("is-reduced-motion", run.reducedMotion);
    const avatarSize = `${baseSize}px`;
    if (run.avatar.style.width !== avatarSize) {
      run.avatar.style.width = avatarSize;
      run.avatar.style.height = avatarSize;
    }
    run.avatar.style.transform = `translate(${position.x - size / 2}px, ${position.y - size / 2}px) scale(${size / baseSize})`;
    run.avatar.style.opacity = String(run.reducedMotion ? 1 : 1 - leave);

    const discharging = run.reducedMotion || run.elapsedMs >= ENTER_MS;
    run.arcs.style.opacity = String(discharging ? (run.reducedMotion ? 0.8 : 1 - leave) : 0);
    const viewBox = `0 0 ${width} ${height}`;
    if (run.arcs.getAttribute("viewBox") !== viewBox) run.arcs.setAttribute("viewBox", viewBox);
    if (discharging) {
      const target = { x: boss.left + boss.width / 2 - field.left, y: boss.top + boss.height / 2 - field.top };
      const start = { x: position.x + size * 0.34, y: position.y - size * 0.08 };
      const variant = run.reducedMotion ? 0 : Math.floor((run.elapsedMs - ENTER_MS) / 70);
      const geometryKey = [variant, start.x, start.y, target.x, target.y, height].map((value) => value.toFixed(1)).join(",");
      // 电弧形状每 70ms 才变化；静止区间复用路径，避免每帧重绘全部描边。
      if (geometryKey !== run.geometryKey) {
        run.geometryKey = geometryKey;
        const dx = target.x - start.x;
        const dy = target.y - start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const normal = { x: -dy / length, y: dx / length };
        const amplitude = Math.min(18, height * 0.09, Math.max(6, length * 0.08));
        const points = Array.from({ length: 9 }, (_, index) => {
          const fraction = index / 8;
          const jitter = index === 0 || index === 8 ? 0
            : (index % 2 === 0 ? 1 : -1) * amplitude * (0.75 + Math.sin(variant * 1.7 + index * 2.3) * 0.25);
          return { x: start.x + dx * fraction + normal.x * jitter, y: start.y + dy * fraction + normal.y * jitter };
        });
        const boltPath = pathThrough(points);
        for (const bolt of run.bolts) bolt.setAttribute("d", boltPath);
        run.branches.setAttribute("d", [2, 4, 6].map((index, branchIndex) => {
          const point = points[index];
          const side = branchIndex % 2 === 0 ? 1 : -1;
          const spread = amplitude * side * 2;
          return pathThrough([
            point,
            { x: point.x + dx * 0.055 + normal.x * spread * 0.45, y: point.y + dy * 0.055 + normal.y * spread * 0.45 },
            { x: point.x + dx * 0.035 + normal.x * spread * 0.7, y: point.y + dy * 0.035 + normal.y * spread * 0.7 },
            { x: point.x + dx * 0.11 + normal.x * spread, y: point.y + dy * 0.11 + normal.y * spread },
          ]);
        }).join(" "));
      }
      const pulse = run.reducedMotion ? 0.85 : 1 + Math.sin((run.elapsedMs - ENTER_MS) / 75) * 0.12;
      const impactScale = Math.min(1, width / 280, height / 100) * pulse;
      run.impact.setAttribute("transform", `translate(${target.x} ${target.y}) scale(${impactScale})`);
    }
    run.root.hidden = false;
  }

  cancel(): void {
    this.runs.clear();
    this.layer.replaceChildren();
  }
}
