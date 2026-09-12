import { getCharacter } from "./characters";
import { BOSS_LASER_FIRE_MS, CHAIN_ENTER_MS, CHAIN_RELEASE_MS, BOSS_SKILL_NAMES, BOSS_SKILL_SHOUTS, bossSkillDuration } from "./engine/boss-skills";
import { DOUBAO_OBSTACLE, type BossSkillRun, type CharacterId, type Coord, type GameState } from "./types";

export const OBSTACLE_IMAGE = new URL("../assets/avatars/volcano/lava-obstacle.png", import.meta.url).href;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => 1 - (1 - clamp(value)) ** 3;
const center = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
type Point = { x: number; y: number };
type ShieldView = { element: HTMLElement; flight: HTMLElement; thread: HTMLElement; joinedAt: number; remaining: bigint; hitAt: number; releaseAt: number | null };

/** 演出只读取引擎时间；不使用计时器、动画完成回调或视觉对象来结算技能。 */
export class BossSkillView {
  private readonly chainInput = document.createElement("button");
  onChainPress: (() => void) | null = null;
  private readonly status = document.createElement("div");
  private readonly layer = document.createElement("div");
  private readonly stageLayer = document.createElement("div");
  private readonly shields = document.createElement("div");
  private readonly nodes = new Map<string, HTMLElement>();
  private readonly members = new Map<CharacterId, ShieldView>();
  private readonly restoredStyles = new Set<HTMLElement>();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private run: BossSkillRun | null = null;
  private state: GameState | null = null;
  private readonly tileRects = new Map<string, DOMRect>();
  private shufflePieces: { id: CharacterId; from: Coord; to: Coord }[] = [];

  constructor(private readonly shell: HTMLElement, private readonly board: HTMLElement, private readonly battlefield: HTMLElement, private readonly bossSide: HTMLElement) {
    this.status.className = "boss-skill-status";
    this.status.hidden = true;
    board.parentElement!.append(this.status);
    this.layer.className = "boss-fx-layer";
    this.layer.setAttribute("aria-hidden", "true");
    this.layer.append(this.stageLayer);
    // 固定定位层采用视口坐标，不受棋盘容器裁切，也不占据交互位置。
    document.body.append(this.layer);
    this.chainInput.className = "boss-chain-input";
    this.chainInput.type = "button";
    this.chainInput.setAttribute("aria-label", "击碎熔岩锁链");
    this.chainInput.hidden = true;
    document.body.append(this.chainInput);
    this.chainInput.addEventListener("pointerdown", (event) => {
      event.preventDefault(); event.stopPropagation();
      if (event.button === 0) this.onChainPress?.();
    });
    this.chainInput.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      if (event.detail === 0) this.onChainPress?.();
    });
    this.shields.className = "betrayed-roster";
    this.shields.setAttribute("aria-label", "被策反的战队角色");
    bossSide.append(this.shields);
  }

  get animating(): boolean {
    return !!this.run || [...this.members.values()].some((member) => member.releaseAt !== null
      || (this.state?.activeElapsedMs ?? 0) - member.joinedAt < 500
      || (this.state?.activeElapsedMs ?? 0) - member.hitAt < 220);
  }

  private clearMembers(): void {
    for (const member of this.members.values()) { member.element.remove(); member.flight.remove(); member.thread.remove(); }
    this.members.clear();
    this.shields.hidden = true;
    this.bossSide.classList.remove("has-betrayed-units");
  }

  private tileRect(coord: Coord): DOMRect | undefined { return this.tileRects.get(`${coord.row}:${coord.col}`); }

  private node(key: string, className: string, imageUrl?: string): HTMLElement {
    let node = this.nodes.get(key);
    if (!node) {
      node = document.createElement("div");
      node.className = `boss-fx ${className}`;
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "";
        image.draggable = false;
        node.append(image);
      }
      this.stageLayer.append(node);
      this.nodes.set(key, node);
    }
    return node;
  }

  private place(node: HTMLElement, point: Point, width: number, height = width, rotation = 0, scale = 1, opacity = 1): void {
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;
    node.style.opacity = String(clamp(opacity));
  }

  private line(node: HTMLElement, from: Point, to: Point, width: number, opacity: number): void {
    this.place(node, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, Math.hypot(to.x - from.x, to.y - from.y), width,
      Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI, 1, opacity);
  }

  private hideTarget(element: HTMLElement | null): void {
    if (!element) return;
    element.style.visibility = "hidden";
    this.restoredStyles.add(element);
  }

  private tile(coord: Coord): HTMLElement | null {
    return this.board.querySelector(`[data-row="${coord.row}"][data-col="${coord.col}"]`);
  }

  private unit(id: CharacterId): HTMLElement | null {
    return this.battlefield.querySelector(`.team-unit[data-character-id="${id}"] .team-avatar`);
  }

  private ring(key: string, point: Point, size: number, progress: number, className = ""): void {
    this.place(this.node(key, `boss-impact-ring ${className}`), point, size, size,
      0, this.reducedMotion.matches ? 1 : .4 + progress * 1.3, 1 - progress);
  }

  private prepareShuffle(state: GameState, run: BossSkillRun): void {
    this.shufflePieces = [];
    const targets = new Map<CharacterId, Coord[]>();
    state.board.forEach((row, r) => row.forEach((id, c) => {
      if (id && id !== DOUBAO_OBSTACLE) {
        const coords = targets.get(id) ?? [];
        coords.push({ row: r, col: c });
        targets.set(id, coords);
      }
    }));
    run.shuffleFrom?.forEach((row, r) => row.forEach((id, c) => {
      if (!id || id === DOUBAO_OBSTACLE) return;
      const to = targets.get(id)?.shift();
      if (to) this.shufflePieces.push({ id, from: { row: r, col: c }, to });
    }));
  }

  private shuffle(state: GameState, run: BossSkillRun): void {
    if (!run.applied) return;
    if (!this.shufflePieces.length) this.prepareShuffle(state, run);
    const p = clamp(run.elapsedMs / 1_000);
    const rect = this.board.getBoundingClientRect(), origin = center(rect);
    const reduced = this.reducedMotion.matches;
    this.place(this.node("vortex", "boss-vortex"), origin, rect.width * .95, rect.height * .95,
      reduced ? 0 : p * 540, reduced ? 1 : .65 + Math.sin(p * Math.PI) * .4, Math.sin(p * Math.PI) * .65);
    this.shufflePieces.forEach((piece, index) => {
      const fromRect = this.tileRect(piece.from), toRect = this.tileRect(piece.to), toTile = this.tile(piece.to);
      if (!fromRect || !toRect || !toTile) return;
      const from = center(fromRect), to = center(toRect);
      const q = clamp(p / .84);
      const pull = Math.sin(q * Math.PI);
      const angle = q * Math.PI * 2 + index * .73;
      const radius = rect.width * .12 * pull;
      const point = reduced ? to : {
        x: mix(mix(from.x, to.x, q), origin.x, pull * .78) + Math.cos(angle) * radius,
        y: mix(mix(from.y, to.y, q), origin.y, pull * .78) + Math.sin(angle) * radius - pull * rect.height * .09,
      };
      if (p < .87) {
        this.hideTarget(toTile.querySelector("img"));
        const ghost = this.node(`shuffle-${index}`, "boss-shuffle-piece", getCharacter(piece.id).imageUrl);
        this.place(ghost, point, toRect.width * .86, toRect.height * .86, reduced ? 0 : Math.sin(q * Math.PI) * 180,
          reduced ? 1 : 1 - pull * .42, reduced ? .45 + p * .55 : 1);
      } else {
        const ghost = this.nodes.get(`shuffle-${index}`);
        if (ghost) ghost.style.opacity = "0";
      }
    });
    if (p >= .84) {
      const impact = (p - .84) / .16;
      this.ring("shuffle-impact", origin, rect.width * .8, impact);
      if (!reduced) this.board.style.translate = `${Math.sin(impact * Math.PI * 4) * (1 - impact) * 3}px 0`;
    }
  }

  private chains(run: BossSkillRun): void {
    const t = run.elapsedMs, rect = this.board.getBoundingClientRect(), mid = center(rect);
    const reduced = this.reducedMotion.matches;
    const enter = ease(t / 360), leave = run.chainReleaseAtMs === null ? 0 : clamp((t - run.chainReleaseAtMs) / CHAIN_RELEASE_MS);
    const hitAge = run.chainLastHitAtMs === null ? Infinity : t - run.chainLastHitAtMs;
    const kick = reduced ? 0 : Math.max(0, 1 - hitAge / 180);
    const hitChain = Math.floor(Math.max(0, run.chainHits - 1) / 3);
    const inputRect = this.board.getBoundingClientRect();
    Object.assign(this.chainInput.style, { left: `${inputRect.left}px`, top: `${inputRect.top}px`, width: `${inputRect.width}px`, height: `${inputRect.height}px` });
    const extension = reduced ? 1 : enter * (1 - ease(leave));
    const corners = [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }];
    corners.forEach((corner, index) => {
      const chain = this.node(`chain-${index}`, "boss-chain-cable");
      if (!chain.childElementCount) chain.innerHTML = `<svg viewBox="0 0 420 24" preserveAspectRatio="none">${Array.from({ length: 20 }, (_, i) => `<ellipse cx="${i * 21 + 10}" cy="12" rx="14" ry="8" fill="none" stroke="#381812" stroke-width="7"/><ellipse cx="${i * 21 + 10}" cy="11" rx="14" ry="8" fill="none" stroke="${i % 2 ? '#ef6337' : '#ffb369'}" stroke-width="4"/>`).join("")}</svg>`;
      const damage = Math.min(3, Math.max(0, run.chainHits - index * 3));
      const broken = damage === 3;
      chain.querySelectorAll("ellipse").forEach((link, part) => {
        const missing = damage > 0 && ((Math.floor(part / 2) + index * 3) % 7 < damage);
        link.setAttribute("stroke-dasharray", missing ? "9 8 3 10" : "none");
        link.setAttribute("opacity", broken ? "0" : "1");
      });
      const shake = index === hitChain ? Math.sin(hitAge / 16) * kick * 5 : 0;
      this.line(chain, corner, { x: mid.x + (Number.isFinite(shake) ? shake : 0), y: mid.y }, Math.max(12, rect.width * .035), 1 - leave);
      chain.style.filter = !reduced && index === hitChain && hitAge < 55 ? "brightness(2.4)" : "";
      for (let chip = 0; chip < 5; chip++) {
        const progress = clamp(hitAge / 220);
        const point = { x: mix(corner.x, mid.x, .55) + (chip - 2) * progress * 16, y: mix(corner.y, mid.y, .55) + progress * progress * 45 - Math.sin(progress * Math.PI) * 18 };
        this.place(this.node(`chain-chip-${index}-${chip}`, "boss-lock-chip"), point, 5, 9, reduced ? 0 : chip * 47 + progress * 140, 1,
          !reduced && index === hitChain && hitAge < 220 ? 1 - progress : 0);
      }
      chain.style.clipPath = `inset(-8px ${100 * (1 - extension)}% -8px -8px)`;
      this.ring(`anchor-${index}`, corner, 24, clamp(t / 450));
    });
    const lock = this.node("lock", "boss-center-lock");
    if (!lock.childElementCount) lock.innerHTML = `<svg viewBox="0 0 100 110"><path d="M26 43V28a24 24 0 0 1 48 0v15" fill="none" stroke="#3e1a14" stroke-width="17"/><path d="M26 43V28a24 24 0 0 1 48 0v15" fill="none" stroke="#ff874e" stroke-width="9"/><rect x="10" y="40" width="80" height="64" rx="15" fill="#6e241c" stroke="#ffc18b" stroke-width="5"/><path d="M24 42l8 12-7 10 10 9-9 15 8 14M76 42l-8 12 7 10-10 9 9 15-8 14" fill="none" stroke="#ff713c" stroke-width="3"/><path d="M28 62l13 6m31-6-13 6" stroke="#fff6bc" stroke-width="6"/><path d="M49 78v12" stroke="#2f130d" stroke-width="9"/></svg>`;
    const cracks = this.node("lock-cracks", "boss-lock-cracks");
    if (cracks.dataset.hits !== String(run.chainHits)) {
      cracks.dataset.hits = String(run.chainHits);
      cracks.innerHTML = `<svg viewBox="0 0 100 110">${Array.from({ length: run.chainHits }, (_, i) => `<path d="M${22 + (i * 17) % 57} ${46 + (i * 11) % 40}l-5 9 8 4-6 9"/>`).join("")}</svg>`;
    }
    this.place(cracks, mid, rect.width * .18, rect.width * .20, 0, 1, 1 - leave);
    const drop = ease((t - 170) / 240);
    this.place(lock, { x: mid.x, y: mid.y - (reduced ? 0 : (1 - drop) * rect.height * .35) }, rect.width * .18, rect.width * .20,
      reduced ? 0 : Math.sin(t / 80) * (t < 600 ? 5 : .6), reduced ? 1 : (1.45 - drop * .45) * (1 + leave * .5 - kick * .09), t < 170 ? 0 : (1 - leave));
    if (t >= 350 && t < 700) this.ring("lock-impact", mid, rect.width * .3, (t - 350) / 350);
    else { const ring = this.nodes.get("lock-impact"); if (ring) ring.style.opacity = "0"; }
    if (leave > 0) {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        this.place(this.node(`lock-chip-${i}`, "boss-lock-chip"), { x: mid.x + Math.cos(a) * leave * rect.width * .3, y: mid.y + Math.sin(a) * leave * rect.width * .3 }, 10, 17,
          reduced ? 0 : leave * 240 + i * 60, 1, reduced ? 0 : 1 - leave);
      }
    }
    if (!reduced && t >= 350 && t < 550) this.board.style.translate = `${Math.sin(t / 20) * (1 - (t - 350) / 200) * 3}px 0`;
  }

  private laser(run: BossSkillRun, origin: Point): void {
    const t = run.elapsedMs, reduced = this.reducedMotion.matches;
    const roster = this.battlefield.querySelector<HTMLElement>(".team-roster")!;
    const rosterRect = roster.getBoundingClientRect();
    const destination = center(rosterRect);
    // 实色区占光束高度的 76%；以发射点为轴覆盖阵列上下沿，留出命中余量。
    const coverage = Math.max(Math.abs(origin.y - rosterRect.top), Math.abs(rosterRect.bottom - origin.y));
    const beamHeight = (coverage + 4) * 2 / .76;
    const endpoint = { x: rosterRect.left - 6, y: origin.y };
    const charge = clamp(t / 400), fade = t < 400 ? 1 : 1 - clamp((t - 400) / 600);
    const chargeSize = Math.max(80, Math.min(140, beamHeight * .85));
    this.place(this.node("charge", "boss-laser-charge"), origin, chargeSize, chargeSize, reduced ? 0 : t * .25,
      reduced ? 1 : .3 + ease(charge) * .85, fade * (reduced ? .45 : 1));
    this.ring("charge-ring", origin, chargeSize * 1.25, t < 400 ? 1 - charge : 1);
    const beam = this.node("beam", "boss-laser-beam");
    const reach = ease((t - BOSS_LASER_FIRE_MS) / (400 - BOSS_LASER_FIRE_MS));
    this.line(beam, origin, { x: mix(origin.x, endpoint.x, reach), y: endpoint.y },
      beamHeight * (reduced ? 1 : .15 + reach * .85), t < BOSS_LASER_FIRE_MS ? 0 : fade * (reduced ? .35 : 1));
    for (const id of run.exileTargets) {
      const unit = this.unit(id);
      if (!unit) continue;
      const rect = unit.getBoundingClientRect(), start = center(rect);
      const p = clamp((t - 400) / 450);
      const hit = t >= 400;
      this.line(this.node(`ray-${id}`, "boss-laser-ray"), destination, start, 7, hit ? (1 - p) * (reduced ? .3 : .9) : 0);
      this.ring(`hit-${id}`, start, rect.width * 1.7, hit ? p : 1);
      this.place(this.node(`hit-glow-${id}`, "boss-laser-hit"), start, rect.width * 2, rect.height * 2,
        0, reduced ? 1 : 1 + p * .5, hit ? (1 - p) * (reduced ? .2 : .9) : 0);
      this.place(this.node(`hit-flash-${id}`, "boss-laser-flash"), start, rect.width * 1.6, rect.height * 1.6,
        0, 1, hit && !reduced ? 1 - clamp((t - 400) / 120) : 0);
      if (hit && p < 1) this.hideTarget(unit.querySelector(".unit-tombstone"));
      this.place(this.node(`exile-${id}`, "boss-exile-ghost", getCharacter(id).imageUrl), reduced ? start : {
        x: start.x - p * Math.min(rosterRect.width * .45, 120), y: start.y - Math.sin(p * Math.PI / 2) * 100,
      }, rect.width, rect.height, reduced ? 0 : -p * 290, reduced ? 1 : 1 + p * .3, hit ? 1 - p : 0);
    }
  }

  private obstacles(run: BossSkillRun, origin: Point): void {
    const reduced = this.reducedMotion.matches, t = run.elapsedMs;
    for (const [index, coord] of run.obstacleTargets.entries()) {
      const tile = this.tile(coord);
      if (!tile) continue;
      const rect = this.tileRect(coord);
      if (!rect) continue;
      const target = center(rect);
      const p = clamp((t - 100) / 600), landing = clamp((t - 700) / 300);
      this.place(this.node(`shadow-${index}`, "boss-landing-shadow"), { x: target.x, y: target.y + rect.height * .3 }, rect.width * .8, rect.height * .2,
        0, reduced ? 1 : .4 + p * .6, t < 700 ? .25 + p * .5 : 1 - landing);
      const point = reduced ? target : { x: mix(origin.x, target.x, p), y: mix(origin.y, target.y, p) - Math.sin(p * Math.PI) * Math.min(170, Math.abs(origin.y - target.y) * .35 + 65) };
      const ghost = this.node(`obstacle-${index}`, "boss-obstacle-flight", OBSTACLE_IMAGE);
      if (run.applied && landing < 1) this.hideTarget(tile.querySelector("img"));
      this.place(ghost, point, rect.width * .9, rect.height * .9, reduced ? 0 : (1 - p) * -240,
        reduced ? 1 : 1 + Math.sin(landing * Math.PI * 2) * .12, t < 100 ? 0 : reduced ? (t < 700 ? .4 : 1) : 1);
      const image = ghost.firstElementChild as HTMLElement;
      image.style.transform = reduced || t < 700 ? "" : `scale(${1 + Math.sin(landing * Math.PI * 2) * .2}, ${1 - Math.sin(landing * Math.PI * 2) * .2})`;
      if (t >= 700) this.ring(`dust-${index}`, target, rect.width, landing, "boss-dust-ring");
      if (!reduced && p > 0 && p < 1) {
        for (let n = 1; n <= 2; n++) {
          const trail = clamp(p - n * .055);
          this.place(this.node(`trail-${index}-${n}`, "boss-obstacle-trail"), {
            x: mix(origin.x, target.x, trail), y: mix(origin.y, target.y, trail) - Math.sin(trail * Math.PI) * Math.min(170, Math.abs(origin.y - target.y) * .35 + 65),
          }, rect.width * .55, rect.width * .55, 0, 1, .2 / n);
        }
      } else for (let n = 1; n <= 2; n++) { const node = this.nodes.get(`trail-${index}-${n}`); if (node) node.style.opacity = "0"; }
    }
    if (!reduced && run.obstacleTargets.length && t >= 700) this.board.style.translate = `0 ${Math.sin((t - 700) / 22) * (1 - (t - 700) / 300) * 3}px`;
  }

  private syncShields(state: GameState): void {
    const now = state.activeElapsedMs, reduced = this.reducedMotion.matches;
    const ids = new Set(state.bossSkills.shields.map((shield) => shield.characterId));
    for (const shield of state.bossSkills.shields) {
      let member = this.members.get(shield.characterId);
      if (!member || member.joinedAt !== shield.joinedAtMs) {
        if (member) { member.element.remove(); member.flight.remove(); member.thread.remove(); }
        const element = document.createElement("article");
        element.className = "betrayed-unit";
        const img = document.createElement("img");
        img.src = getCharacter(shield.characterId).imageUrl; img.alt = ""; img.draggable = false;
        element.append(img);
        this.shields.append(element);
        const flight = document.createElement("div"); flight.className = "boss-fx boss-betrayal-flight"; flight.append(img.cloneNode());
        const thread = document.createElement("div"); thread.className = "boss-fx boss-control-thread";
        this.layer.append(thread, flight);
        member = { element, flight, thread, joinedAt: shield.joinedAtMs, remaining: shield.remaining, hitAt: -Infinity, releaseAt: null };
        this.members.set(shield.characterId, member);
      }
      if (shield.remaining < member.remaining) member.hitAt = now;
      member.remaining = shield.remaining;
      const unit = state.battleUnits[shield.characterId]!;
      const label = `${getCharacter(shield.characterId).name}，等级${unit.level}，已被策反`;
      member.element.title = label; member.element.setAttribute("aria-label", label);
    }
    // 先完成阵列布局，再计算终点，避免新成员从零尺寸位置飞入。
    this.shields.hidden = this.members.size === 0;
    this.bossSide.classList.toggle("has-betrayed-units", this.members.size > 0);
    const origin = center(this.bossSide.querySelector(".boss-art-frame")!.getBoundingClientRect());
    for (const [id, member] of this.members) {
      if (!ids.has(id) && member.releaseAt === null) member.releaseAt = now;
      const released = member.releaseAt !== null;
      const release = released ? clamp((now - member.releaseAt!) / 300) : 0;
      if (release >= 1) {
        member.element.remove(); member.flight.remove(); member.thread.remove(); this.members.delete(id); continue;
      }
      const rect = member.element.getBoundingClientRect(), target = center(rect);
      const source = this.unit(id);
      const start = source ? center(source.getBoundingClientRect()) : origin;
      const p = clamp((now - member.joinedAt) / 500), progress = ease(p);
      const point = reduced ? target : { x: mix(start.x, target.x, progress), y: mix(start.y, target.y, progress) - Math.sin(progress * Math.PI) * 45 };
      this.place(member.flight, point, Math.min(56, rect.width), Math.min(56, rect.height), reduced ? 0 : Math.sin(progress * Math.PI) * -30, 1, released || p >= 1 ? 0 : 1);
      member.element.style.opacity = String(released ? 1 - release : p < 1 ? 0 : 1);
      const hit = clamp((now - member.hitAt) / 220);
      member.element.style.transform = reduced ? "" : `translateX(${Math.sin(hit * Math.PI * 4) * (1 - hit) * 3}px) scale(${released ? 1 + release * .4 : 1 - Math.sin(hit * Math.PI) * .1})`;
      member.element.classList.toggle("is-releasing", released);
      this.line(member.thread, origin, p < 1 ? point : target, p < 1 ? 3 : 1.5, (released ? 1 - release : .5) * (reduced ? .4 : 1));
    }
    this.shields.hidden = this.members.size === 0;
    this.bossSide.classList.toggle("has-betrayed-units", this.members.size > 0);
  }

  sync(state: GameState): void {
    for (const node of this.restoredStyles) node.style.visibility = "";
    this.restoredStyles.clear();
    this.board.style.translate = "";
    this.battlefield.style.translate = "";
    if (this.state !== state) {
      this.clearMembers(); this.state = state; this.run = null;
      this.nodes.clear(); this.stageLayer.replaceChildren(); this.shufflePieces = [];
    }
    const run = state.bossSkills.active;
    if (run !== this.run) {
      this.run = run; this.nodes.clear(); this.stageLayer.replaceChildren(); this.shufflePieces = [];
    }
    const visible = state.phase === "playing";
    this.layer.hidden = !visible;
    this.shell.dataset.bossSkill = String(visible ? run?.stage ?? 0 : 0);
    this.status.hidden = !run || !visible || run.stage === 3;
    this.chainInput.hidden = !visible || state.bossReviveRemainingMs > 0 || run?.stage !== 3;
    this.chainInput.disabled = !run || run.stage !== 3 || run.elapsedMs < CHAIN_ENTER_MS || run.chainReleaseAtMs !== null;
    if (!visible || state.bossReviveRemainingMs > 0) { this.clearMembers(); return; }
    // 在读取坐标之前施加轻震，固定定位特效与头像同步；每次同步先清理偏移。
    if (run?.stage === 4 && !this.reducedMotion.matches && run.elapsedMs >= 400 && run.elapsedMs < 550) {
      const p = (run.elapsedMs - 400) / 150;
      this.battlefield.style.translate = `${Math.sin(p * Math.PI * 6) * (1 - p) * 3}px 0`;
    }
    // 策反阵列改变火山哥尺寸后，再取实际出招位置。
    this.syncShields(state);
    const bossRect = this.bossSide.querySelector(".boss-art-frame")!.getBoundingClientRect();
    const origin = center(bossRect);
    if (!run) return;
    this.tileRects.clear();
    if (run.stage === 1 || run.stage === 5) {
      for (const tile of this.board.querySelectorAll<HTMLElement>("[data-row][data-col]")) {
        this.tileRects.set(`${tile.dataset.row}:${tile.dataset.col}`, tile.getBoundingClientRect());
      }
    }
    const remaining = Math.max(0, bossSkillDuration(run.stage) - run.elapsedMs) / 1_000;
    this.status.textContent = `${BOSS_SKILL_NAMES[run.stage]}${run.stage === 2 ? ` · ${remaining.toFixed(1)}s` : ""}`;
    const t = run.elapsedMs;
    const shout = this.node("shout", "boss-skill-shout");
    shout.textContent = BOSS_SKILL_SHOUTS[run.stage];
    const shoutP = clamp(t / 650);
    this.place(shout, { x: Math.max(55, Math.min(window.innerWidth - 55, origin.x)), y: Math.max(30, bossRect.top + 15) }, 100, 40,
      this.reducedMotion.matches ? 0 : -8 + shoutP * 5, this.reducedMotion.matches ? 1 : .8 + ease(t / 140) * .25, t < 450 ? 1 : 1 - clamp((t - 450) / 200));
    if (run.stage === 1) this.shuffle(state, run);
    else if (run.stage === 2) {
      const rect = this.board.getBoundingClientRect();
      this.ring("control-wave", center(rect), rect.width, clamp(t / 650), "boss-control-wave");
    } else if (run.stage === 3) this.chains(run);
    else if (run.stage === 4) this.laser(run, origin);
    else this.obstacles(run, origin);
  }
}
