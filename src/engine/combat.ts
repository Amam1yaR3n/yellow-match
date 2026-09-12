import { getCharacter } from "../characters";
import { DOUBAO_OBSTACLE, isCharacterCell, CHARACTER_IDS, type BossSkillStage, type CharacterId, type BattleUnitState, type BoardMatrix, type Coord, type GameState, type PendingHit, type UltimateCast } from "../types";
import { BOARD_STAGES, placeBossObstacles } from "./board";
import { BOSS_LASER_FIRE_MS, bossSkillDeadline, bossSkillHitAt, bossBlocksBoard, createBossSkillState, unitUnavailable } from "./boss-skills";

export const BOSS_INITIAL_HP = 20_000n;
export const BOSS_REVIVE_MS = 900;
export const HINT_COUNT = 3;
export const IMAGE_WAIT_MS = 250;
export const CINEMATIC_DURATION_MS = 1_100;
export const CHARGE_ENTER_MS = 400;
export const CHARGE_ANTICIPATION_MS = 120;
export const CHARGE_DASH_MS = 220;
export const CHARGE_REBOUND_MS = 260;
export const CHARGE_HIT_AT_MS = CHARGE_ENTER_MS + CHARGE_ANTICIPATION_MS + CHARGE_DASH_MS;
export const CHARGE_DURATION_MS = CHARGE_HIT_AT_MS + CHARGE_REBOUND_MS;
export const KNIFE_SUMMON_MS = 250;
export const KNIFE_DASH_MS = 250;
export const KNIFE_HOLD_MS = 150;
export const KNIFE_RETURN_MS = 450;
export const VEHICLE_TRANSFORM_MS = 420;
export const CHEW_TRAVEL_MS = 700;
export const CHEW_CONTACT_MS = 280;
export const CHEW_CYCLES = 4;

/** 登记、存档恢复和画面使用同一份角色冲撞时序。 */
export function chargeTiming(characterId: BattleUnitState["id"]): { hitAtMs: number; durationMs: number } {
  if (getCharacter(characterId).ultimate.knife) {
    const hitAtMs = CHARGE_ENTER_MS + KNIFE_SUMMON_MS + KNIFE_DASH_MS;
    return { hitAtMs, durationMs: hitAtMs + KNIFE_HOLD_MS + KNIFE_RETURN_MS };
  }
  if (getCharacter(characterId).ultimate.chew) {
    const travelAtMs = CHARGE_ENTER_MS + CHARGE_ANTICIPATION_MS;
    return { hitAtMs: travelAtMs + CHEW_CONTACT_MS, durationMs: travelAtMs + CHEW_TRAVEL_MS };
  }
  const hitAtMs = getCharacter(characterId).ultimate.vehicle
    ? CHARGE_ENTER_MS + VEHICLE_TRANSFORM_MS + CHARGE_DASH_MS
    : CHARGE_HIT_AT_MS;
  return { hitAtMs, durationMs: hitAtMs + CHARGE_REBOUND_MS };
}
export const PSYCHIC_ENTER_MS = 400;
export const PSYCHIC_ANTICIPATION_MS = 180;
export const PSYCHIC_EXPAND_MS = 420;
export const PSYCHIC_HIT_AT_MS = PSYCHIC_ENTER_MS + PSYCHIC_ANTICIPATION_MS + PSYCHIC_EXPAND_MS;
export const PSYCHIC_FADE_MS = 250;
export const PSYCHIC_RETURN_MS = 350;
export const PSYCHIC_DURATION_MS = PSYCHIC_HIT_AT_MS + PSYCHIC_FADE_MS + PSYCHIC_RETURN_MS;
export const SONIC_ENTER_MS = 400;
export const SONIC_ANTICIPATION_MS = 180;
export const SONIC_RING_COUNT = 3;
export const SONIC_RING_INTERVAL_MS = 120;
export const SONIC_CONTACT_MS = 280;
export const SONIC_FADE_MS = 170;
export const SONIC_HIT_AT_MS = SONIC_ENTER_MS + SONIC_ANTICIPATION_MS + SONIC_CONTACT_MS;
export const SONIC_LAST_RING_END_MS = SONIC_ENTER_MS + SONIC_ANTICIPATION_MS
  + (SONIC_RING_COUNT - 1) * SONIC_RING_INTERVAL_MS + SONIC_CONTACT_MS + SONIC_FADE_MS;
export const SONIC_RETURN_MS = 350;
export const SONIC_DURATION_MS = SONIC_LAST_RING_END_MS + SONIC_RETURN_MS;
export const BANANA_ENTER_MS = 400;
export const BANANA_ASIDE_MS = 200;
export const BANANA_SUMMON_MS = 250;
export const BANANA_FLY_MS = 400;
export const BANANA_FIRE_AT_MS = BANANA_ENTER_MS + BANANA_ASIDE_MS + BANANA_SUMMON_MS;
export const BANANA_HIT_AT_MS = BANANA_FIRE_AT_MS + BANANA_FLY_MS;
export const BANANA_RETURN_MS = 350;
export const BANANA_DURATION_MS = BANANA_HIT_AT_MS + BANANA_RETURN_MS;
export const SPRAY_ENTER_MS = 400;
export const SPRAY_SUMMON_MS = 250;
export const SPRAY_FLY_MS = 400;
export const SPRAY_HIT_AT_MS = SPRAY_ENTER_MS + SPRAY_SUMMON_MS + SPRAY_FLY_MS;
export const SPRAY_RETURN_MS = 350;
export const SPRAY_DURATION_MS = SPRAY_HIT_AT_MS + SPRAY_RETURN_MS;
export const CANDY_ENTER_MS = 400;
export const CANDY_SUMMON_MS = 200;
export const CANDY_FALL_MS = 300;
export const CANDY_HIT_AT_MS = CANDY_ENTER_MS + CANDY_SUMMON_MS + CANDY_FALL_MS;
export const CANDY_RAIN_MS = 300;
export const CANDY_RETURN_MS = 350;
export const CANDY_DURATION_MS = CANDY_HIT_AT_MS + CANDY_RAIN_MS + CANDY_RETURN_MS;
export const NET_ENTER_MS = 400;
export const NET_SUMMON_MS = 250;
export const NET_SWING_MS = 450;
export const NET_HIT_AT_MS = NET_ENTER_MS + NET_SUMMON_MS + NET_SWING_MS;
export const NET_HOLD_MS = 350;
export const NET_RETURN_MS = 350;
export const NET_DURATION_MS = NET_HIT_AT_MS + NET_HOLD_MS + NET_RETURN_MS;
export const REDUCED_EFFECT_DURATION_MS = 300;

export function nextBossMaxHp(currentMaxHp: bigint): bigint {
  return currentMaxHp * 2n;
}

export type BattleEffect =
  | { kind: "attack"; characterId: BattleUnitState["id"]; level: number }
  | { kind: "hit"; characterId: BattleUnitState["id"]; amount: bigint; ultimate: boolean }
  | { kind: "revive-start" | "revive-end" | "boss-state" | "boss-board" }
  | { kind: "boss-laser" }
  | { kind: "boss-skill"; stage: BossSkillStage }
  | { kind: "shield-hit"; characterId: CharacterId; amount: bigint }
  | { kind: "cast" | "cinematic"; id: number; characterId: BattleUnitState["id"] }
  | { kind: "ultimate-field"; characters: BattleUnitState["id"][]; soundCharacters: BattleUnitState["id"][] };

export interface BattleAdvanceOptions {
  playCinematics?: boolean;
  random?: () => number;
}

export interface EliminationOptions {
  reducedMotion: boolean;
  playCinematics: boolean;
}

export type EliminationSource = "manual" | "bomb" | "boss-auto";

export function reinforcementCount(level: number): number {
  return Math.floor(level / 5);
}

export function evolutionStage(level: number): number {
  return Math.min(4, reinforcementCount(level));
}

export function normalAttackDamage(level: number): bigint {
  return (10n + 3n * (BigInt(level) - 1n)) * (2n ** BigInt(reinforcementCount(level)));
}

export function ultimateDamage(level: number): bigint {
  return (560n + 240n * (BigInt(level) - 1n)) * (2n ** BigInt(reinforcementCount(level)));
}

export function nextAttackDelay(level: number, random = Math.random): number {
  return 2_700 + Math.floor(random() * 601) - Math.min(12, reinforcementCount(level)) * 200;
}

export function countCharacters(board: BoardMatrix): GameState["boardRemaining"] {
  const counts = Object.fromEntries(CHARACTER_IDS.map((id) => [id, 0])) as GameState["boardRemaining"];
  for (const row of board) for (const id of row) if (isCharacterCell(id)) counts[id] += 1;
  return counts;
}

export function createGameState(): GameState {
  const size = BOARD_STAGES[0].size;
  const board: BoardMatrix = Array.from({ length: size }, () => Array(size).fill(null));
  return {
    board, boardStage: 0, phase: "loading", hintsRemaining: HINT_COUNT, bombCount: 1,
    interactionRewards: { triple: false, following: false },
    bossSkills: createBossSkillState(),
    bossHp: BOSS_INITIAL_HP, bossMaxHp: BOSS_INITIAL_HP, bossReviveRemainingMs: 0,
    bossKillCount: 0, pendingBossEliminations: 0, totalDamage: 0n, activeElapsedMs: 0,
    boardRemaining: countCharacters(board), battleUnits: {},
    nextEventId: 1, pendingHits: [], ultimateBatch: null, lightningRuns: [], chargeRuns: [], psychicRuns: [], sonicRuns: [], sprayRuns: [], bananaRuns: [], candyRuns: [], netRuns: [], boardSettlement: null,
  };
}

export function orderedUnits(state: GameState): BattleUnitState[] {
  return Object.values(state.battleUnits).sort((a, b) => a.joinedOrder - b.joinedOrder);
}

export function teamPower(state: GameState): bigint {
  return orderedUnits(state).reduce((total, unit) => total + BigInt(unit.level), 0n);
}

export function canFight(state: GameState): boolean {
  return state.phase === "playing" && state.bossReviveRemainingMs === 0 && !state.ultimateBatch;
}

export function canEliminate(state: GameState): boolean {
  return canFight(state) && !state.boardSettlement && !bossBlocksBoard(state);
}

function hitBoss(state: GameState, hit: PendingHit, effects: BattleEffect[]): void {
  if (unitUnavailable(state, hit.characterId)) return;
  let damage = hit.amount;
  while (damage > 0n && state.bossSkills.shields.length) {
    const shield = state.bossSkills.shields[0];
    const absorbed = damage < shield.remaining ? damage : shield.remaining;
    shield.remaining -= absorbed;
    damage -= absorbed;
    effects.push({ kind: "shield-hit", characterId: shield.characterId, amount: absorbed });
    if (shield.remaining === 0n) {
      state.bossSkills.shields.shift();
      resumeUnit(state, shield.characterId);
      effects.push({ kind: "boss-state" });
    }
  }
  if (damage === 0n) return;
  const beforeHp = state.bossHp;
  const amount = damage < state.bossHp ? damage : state.bossHp;
  state.bossHp -= amount;
  state.totalDamage += amount;
  const beforeProgress = ((state.bossMaxHp - beforeHp) * 20n) / state.bossMaxHp;
  const afterProgress = ((state.bossMaxHp - state.bossHp) * 20n) / state.bossMaxHp;
  state.pendingBossEliminations += Number(afterProgress - beforeProgress);
  effects.push({ kind: "hit", characterId: hit.characterId, amount, ultimate: hit.kind === "ultimate" });
  if (state.bossHp === 0n) {
    state.bossKillCount += 1;
    state.bombCount += 1;
    state.bossReviveRemainingMs = BOSS_REVIVE_MS;
    for (const shield of state.bossSkills.shields) resumeUnit(state, shield.characterId);
    const exiled = state.bossSkills.exiled;
    state.bossSkills = { ...createBossSkillState(), exiled };
    if (state.boardSettlement?.kind === "boss-shuffle") state.boardSettlement = null;
    effects.push({ kind: "revive-start" });
  } else {
    const stage = Math.min(5, Number((state.bossMaxHp - state.bossHp) * 6n / state.bossMaxHp));
    while (state.bossSkills.triggeredStage < stage) {
      state.bossSkills.triggeredStage++;
      state.bossSkills.queue.push(state.bossSkills.triggeredStage as BossSkillStage);
    }
  }
}

function resumeUnit(state: GameState, id: CharacterId): void {
  const unit = state.battleUnits[id];
  if (unit) unit.nextAttackAtMs = state.activeElapsedMs + nextAttackDelay(unit.level);
}

function cancelUnitAttacks(state: GameState, id: CharacterId): void {
  state.pendingHits = state.pendingHits.filter((hit) => hit.characterId !== id);
  // 已命中的演出可收尾；未命中的攻击连同演出一起取消。
  for (const key of ULTIMATE_RUN_KEYS) {
    const runs = state[key];
    for (let index = runs.length - 1; index >= 0; index--) {
      if (runs[index].characterId === id && !runs[index].hasHit) runs.splice(index, 1);
    }
  }
  const batch = state.ultimateBatch;
  if (batch) {
    const current = batch.casts[batch.index];
    batch.casts = batch.casts.filter((cast) => cast.characterId !== id);
    if (!batch.casts.length) state.ultimateBatch = null;
    else {
      const index = batch.casts.indexOf(current);
      batch.index = index >= 0 ? index : Math.min(batch.index, batch.casts.length - 1);
      if (index < 0) { batch.phase = "preparing"; batch.remainingMs = IMAGE_WAIT_MS; }
    }
  }
}

function advanceBossSkill(state: GameState, effects: BattleEffect[], random: () => number): void {
  const skills = state.bossSkills;
  let active = skills.active;
  if (active && active.elapsedMs >= bossSkillDeadline(active)) {
    skills.active = null;
    active = null;
    effects.push({ kind: "boss-state" });
  }
  if (!active && !state.boardSettlement && skills.queue.length) {
    const stage = skills.queue.shift()!;
    active = skills.active = { stage, chainHits: 0, chainLastHitAtMs: null, chainReleaseAtMs: null, elapsedMs: 0, applied: stage === 2 || stage === 3,
      obstacleTargets: [], shuffleFrom: stage === 1 ? state.board.map((row) => [...row]) : null, exileTargets: [] };
    if (stage === 5) {
      const planned = placeBossObstacles(state.board, random);
      for (let row = 0; row < planned.length; row++) for (let col = 0; col < planned.length; col++) {
        if (planned[row][col] === DOUBAO_OBSTACLE && state.board[row][col] === null) active.obstacleTargets.push({ row, col });
      }
    }
    if (stage === 1) {
      state.boardSettlement = { id: state.nextEventId++, phase: "generating", kind: "boss-shuffle", targetStage: state.boardStage, board: null };
    }
    if (stage === 2) skills.betrayedThisWindow = [];
    effects.push({ kind: "boss-skill", stage });
  }
  if (!active || active.applied || active.elapsedMs < bossSkillHitAt(active.stage)) return;
  if (active.stage === 4) {
    const candidates = orderedUnits(state).filter((unit) => !unitUnavailable(state, unit.id));
    for (let count = 0; count < 8 && candidates.length; count++) {
      const [unit] = candidates.splice(Math.floor(random() * candidates.length), 1);
      skills.exiled.push(unit.id);
      active.exileTargets.push(unit.id);
      cancelUnitAttacks(state, unit.id);
    }
    active.applied = true;
    effects.push({ kind: "boss-state" });
  } else if (active.stage === 5) {
    state.board = state.board.map((row) => [...row]);
    for (const { row, col } of active.obstacleTargets) state.board[row][col] = DOUBAO_OBSTACLE;
    active.applied = true;
    effects.push({ kind: "boss-board" });
  }
}

function startPreparation(state: GameState, effects: BattleEffect[]): void {
  const batch = state.ultimateBatch!;
  batch.phase = "preparing";
  batch.remainingMs = IMAGE_WAIT_MS;
  const cast = batch.casts[batch.index];
  effects.push({ kind: "cast", id: cast.id, characterId: cast.characterId });
}

export function acceptImageReady(state: GameState, id: number): BattleEffect[] {
  const batch = state.ultimateBatch;
  if (!batch || batch.phase !== "preparing" || batch.casts[batch.index].id !== id) return [];
  batch.phase = "playing";
  batch.remainingMs = batch.reducedMotion ? 300 : CINEMATIC_DURATION_MS;
  return [{ kind: "cinematic", id, characterId: batch.casts[batch.index].characterId }];
}

export const ULTIMATE_RUN_KEYS = [
  "lightningRuns", "chargeRuns", "psychicRuns", "sonicRuns",
  "sprayRuns", "bananaRuns", "candyRuns", "netRuns",
] as const;
export type UltimateFieldSnapshot = Pick<GameState, typeof ULTIMATE_RUN_KEYS[number] | "pendingHits">;

/** 只构造新的演出快照；真实战斗与无伤预览共用时序。 */
export function createUltimateField(casts: readonly UltimateCast[], reducedMotion: boolean): UltimateFieldSnapshot {
  const state: UltimateFieldSnapshot = {
    lightningRuns: [], chargeRuns: [], psychicRuns: [], sonicRuns: [],
    sprayRuns: [], bananaRuns: [], candyRuns: [], netRuns: [], pendingHits: [],
  };
  const chargeCount = casts.filter((cast) => getCharacter(cast.characterId).ultimate.effect === "charge").length;
  let chargeIndex = 0;
  for (const cast of casts) {
    const effect = getCharacter(cast.characterId).ultimate.effect;
    if (effect === "lightning") {
      state.lightningRuns.push({
        ...cast, elapsedMs: 0, hitAtMs: reducedMotion ? 0 : 400,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : 1_800, hasHit: false, reducedMotion,
      });
    } else if (effect === "charge") {
      const timing = chargeTiming(cast.characterId);
      state.chargeRuns.push({
        ...cast, elapsedMs: 0,
        hitAtMs: reducedMotion ? 0 : timing.hitAtMs,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : timing.durationMs,
        hasHit: false, reducedMotion, laneIndex: chargeIndex, laneCount: chargeCount,
      });
      chargeIndex += 1;
    } else if (effect === "psychic") {
      state.psychicRuns.push({
        ...cast, elapsedMs: 0,
        hitAtMs: reducedMotion ? 0 : PSYCHIC_HIT_AT_MS,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : PSYCHIC_DURATION_MS,
        hasHit: false, reducedMotion,
      });
    } else if (effect === "sonic") {
      state.sonicRuns.push({
        ...cast, elapsedMs: 0,
        hitAtMs: reducedMotion ? 0 : SONIC_HIT_AT_MS,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : SONIC_DURATION_MS,
        hasHit: false, reducedMotion,
      });
    } else if (effect === "spray") {
      state.sprayRuns.push({
        ...cast, elapsedMs: 0,
        hitAtMs: reducedMotion ? 0 : SPRAY_HIT_AT_MS,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : SPRAY_DURATION_MS,
        hasHit: false, reducedMotion,
      });
    } else if (effect === "banana") {
      state.bananaRuns.push({
        ...cast, elapsedMs: 0,
        hitAtMs: reducedMotion ? 0 : BANANA_HIT_AT_MS,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : BANANA_DURATION_MS,
        hasHit: false, reducedMotion,
      });
    } else if (effect === "candy") {
      state.candyRuns.push({
        ...cast, elapsedMs: 0,
        hitAtMs: reducedMotion ? 0 : CANDY_HIT_AT_MS,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : CANDY_DURATION_MS,
        hasHit: false, reducedMotion,
      });
    } else if (effect === "net") {
      state.netRuns.push({
        ...cast, elapsedMs: 0,
        hitAtMs: reducedMotion ? 0 : NET_HIT_AT_MS,
        durationMs: reducedMotion ? REDUCED_EFFECT_DURATION_MS : NET_DURATION_MS,
        hasHit: false, reducedMotion,
      });
    } else {
      state.pendingHits.push({ ...cast });
    }
  }
  return state;
}

function stageUltimateEffects(
  state: GameState, casts: readonly UltimateCast[], reducedMotion: boolean, effects: BattleEffect[],
): void {
  const field = createUltimateField(casts, reducedMotion);
  state.lightningRuns.push(...field.lightningRuns);
  state.chargeRuns.push(...field.chargeRuns);
  state.psychicRuns.push(...field.psychicRuns);
  state.sonicRuns.push(...field.sonicRuns);
  state.sprayRuns.push(...field.sprayRuns);
  state.bananaRuns.push(...field.bananaRuns);
  state.candyRuns.push(...field.candyRuns);
  state.netRuns.push(...field.netRuns);
  state.pendingHits.push(...field.pendingHits);
  effects.push({
    kind: "ultimate-field",
    characters: field.pendingHits.map((hit) => hit.characterId),
    soundCharacters: casts.map((cast) => cast.characterId),
  });
}

function finishCinematic(state: GameState, effects: BattleEffect[], playCinematics: boolean): void {
  const batch = state.ultimateBatch!;
  batch.index += 1;
  if (batch.index < batch.casts.length && playCinematics) {
    startPreparation(state, effects);
    return;
  }
  stageUltimateEffects(state, batch.casts, batch.reducedMotion, effects);
  state.ultimateBatch = null;
}

/** 所有时间按到期事件消费；不依赖 DOM、动画回调或异步调用栈。 */
export function advanceBattle(state: GameState, deltaMs: number, options: BattleAdvanceOptions = {}): BattleEffect[] {
  const effects: BattleEffect[] = [];
  if (state.phase !== "playing") return effects;
  const playCinematics = options.playCinematics ?? true;
  const random = options.random ?? Math.random;
  let remaining = Math.max(0, Math.round(deltaMs));
  while (true) {
    if (state.bossReviveRemainingMs > 0) {
      const step = Math.min(remaining, state.bossReviveRemainingMs);
      // 已命中的头像继续退场；尚未命中的冲撞等待魔王复活。
      for (const run of state.chargeRuns) {
        if (run.hasHit) run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + step);
      }
      state.chargeRuns = state.chargeRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
      // 念力命中后只剩视觉收尾，可以在魔王复活期间继续完成；未命中的光环仍冻结等待。
      for (const run of state.psychicRuns) {
        if (run.hasHit) run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + step);
      }
      state.psychicRuns = state.psychicRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
      // 声波命中后继续扩散退场；未命中的声波冻结并等待下一只魔王。
      for (const run of state.sonicRuns) {
        if (run.hasHit) run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + step);
      }
      state.sonicRuns = state.sonicRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
      for (const run of state.sprayRuns) {
        if (run.hasHit) run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + step);
      }
      state.sprayRuns = state.sprayRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
      for (const run of state.bananaRuns) {
        if (run.hasHit) run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + step);
      }
      state.bananaRuns = state.bananaRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
      // 首颗已命中的糖雨继续视觉收尾；未命中的糖雨冻结等待魔王复活。
      for (const run of state.candyRuns) {
        if (run.hasHit) run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + step);
      }
      state.candyRuns = state.candyRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
      // 已扣中的网兜继续收网回位；尚未扣中的网兜等待魔王复活。
      for (const run of state.netRuns) {
        if (run.hasHit) run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + step);
      }
      state.netRuns = state.netRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
      state.bossReviveRemainingMs -= step;
      remaining -= step;
      if (state.bossReviveRemainingMs > 0) break;
      state.bossMaxHp = nextBossMaxHp(state.bossMaxHp);
      state.bossHp = state.bossMaxHp;
      effects.push({ kind: "revive-end" });
      continue;
    }
    const batch = state.ultimateBatch;
    if (batch) {
      const step = Math.min(remaining, batch.remainingMs);
      batch.remainingMs -= step;
      remaining -= step;
      if (batch.remainingMs > 0) break;
      if (batch.phase === "preparing") effects.push(...acceptImageReady(state, batch.casts[batch.index].id));
      else finishCinematic(state, effects, playCinematics);
      continue;
    }
    advanceBossSkill(state, effects, random);
    while (state.pendingHits.length && canFight(state)) hitBoss(state, state.pendingHits.shift()!, effects);
    if (!canFight(state)) continue;
    for (const run of state.lightningRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.lightningRuns = state.lightningRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    for (const run of state.psychicRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.psychicRuns = state.psychicRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    for (const run of state.sonicRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.sonicRuns = state.sonicRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    if (!canFight(state)) continue;
    for (const run of state.sprayRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.sprayRuns = state.sprayRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    for (const run of state.bananaRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.bananaRuns = state.bananaRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    for (const run of state.candyRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        // 整阵糖雨只在首颗接触时结算一次，后续糖豆不追加伤害。
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.candyRuns = state.candyRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    for (const run of state.netRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.netRuns = state.netRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    for (const run of state.chargeRuns) {
      if (!canFight(state)) break;
      if (!run.hasHit && run.elapsedMs >= run.hitAtMs) {
        run.hasHit = true;
        hitBoss(state, run, effects);
      }
    }
    state.chargeRuns = state.chargeRuns.filter((run) => !run.hasHit || run.elapsedMs < run.durationMs);
    if (!canFight(state)) continue;
    advanceBossSkill(state, effects, random);
    const units = orderedUnits(state).filter((unit) => !unitUnavailable(state, unit.id));
    for (const unit of units) {
      if (!canFight(state)) break;
      if (unitUnavailable(state, unit.id)) continue;
      if (unit.nextAttackAtMs <= state.activeElapsedMs) {
        // 成长只影响下一周期；已排定的本次攻击不会被升级重置。
        unit.nextAttackAtMs = state.activeElapsedMs + nextAttackDelay(unit.level, random);
        effects.push({ kind: "attack", characterId: unit.id, level: unit.level });
        hitBoss(state, { id: state.nextEventId++, characterId: unit.id, kind: "normal", amount: normalAttackDamage(unit.level) }, effects);
      }
    }
    if (!canFight(state)) continue;
    advanceBossSkill(state, effects, random);
    if (remaining === 0) break;
    let step = remaining;
    const skill = state.bossSkills.active;
    const skillTicking = skill && (skill.stage !== 1 || skill.applied);
    if (skillTicking) {
      const deadline = !skill.applied && (skill.stage === 4 || skill.stage === 5) ? bossSkillHitAt(skill.stage) : bossSkillDeadline(skill);
      step = Math.min(step, deadline - skill.elapsedMs);
      if (skill.stage === 4 && skill.elapsedMs < BOSS_LASER_FIRE_MS) step = Math.min(step, BOSS_LASER_FIRE_MS - skill.elapsedMs);
    }
    for (const unit of orderedUnits(state)) if (!unitUnavailable(state, unit.id)) step = Math.min(step, unit.nextAttackAtMs - state.activeElapsedMs);
    for (const run of state.lightningRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    for (const run of state.chargeRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    for (const run of state.psychicRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    for (const run of state.sonicRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    for (const run of state.sprayRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    for (const run of state.bananaRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    for (const run of state.candyRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    for (const run of state.netRuns) {
      step = Math.min(step, (run.hasHit ? run.durationMs : run.hitAtMs) - run.elapsedMs);
    }
    state.activeElapsedMs += step;
    if (skillTicking) {
      const previousElapsedMs = skill.elapsedMs;
      skill.elapsedMs += step;
      if (skill.stage === 4 && previousElapsedMs < BOSS_LASER_FIRE_MS && skill.elapsedMs >= BOSS_LASER_FIRE_MS) {
        effects.push({ kind: "boss-laser" });
      }
    }
    for (const run of state.lightningRuns) run.elapsedMs += step;
    for (const run of state.chargeRuns) run.elapsedMs += step;
    for (const run of state.psychicRuns) run.elapsedMs += step;
    for (const run of state.sonicRuns) run.elapsedMs += step;
    for (const run of state.sprayRuns) run.elapsedMs += step;
    for (const run of state.bananaRuns) run.elapsedMs += step;
    for (const run of state.candyRuns) run.elapsedMs += step;
    for (const run of state.netRuns) run.elapsedMs += step;
    remaining -= step;
  }
  return effects;
}

export interface BattleGain { characterId: BattleUnitState["id"]; before: number; level: number }

/** 盘面、炸弹、成长、首击和整批大招一起提交，异步演出不拥有数值。 */
export function commitElimination(
  state: GameState,
  coords: readonly Coord[],
  source: EliminationSource,
  options: EliminationOptions,
): { gains: BattleGain[]; effects: BattleEffect[] } | null {
  if (!canEliminate(state)
    || (source === "bomb" && state.bombCount === 0)
    || (source === "boss-auto" && state.pendingBossEliminations === 0)) return null;
  const groups = new Map<BattleUnitState["id"], number>();
  const seen = new Set<string>();
  for (const coord of coords) {
    const key = `${coord.row}:${coord.col}`;
    const id = state.board[coord.row]?.[coord.col];
    if (!isCharacterCell(id) || seen.has(key)) return null;
    seen.add(key);
    groups.set(id, (groups.get(id) ?? 0) + 1);
  }
  if (!groups.size || [...groups.values()].some((count) => count % 2 !== 0)) return null;
  if (source === "bomb") state.bombCount -= 1;
  else if (source === "boss-auto") state.pendingBossEliminations -= 1;
  for (const coord of coords) state.board[coord.row][coord.col] = null;
  const gains: BattleGain[] = [];
  const casts: UltimateCast[] = [];
  for (const [characterId, count] of groups) {
    const old = state.battleUnits[characterId];
    const before = old?.level ?? 0;
    const level = before + count / 2;
    if (old) old.level = level;
    else {
      state.battleUnits[characterId] = { id: characterId, level, joinedOrder: Object.keys(state.battleUnits).length, nextAttackAtMs: state.activeElapsedMs + nextAttackDelay(level) };
      state.pendingHits.push({ id: state.nextEventId++, characterId, kind: "normal", amount: normalAttackDamage(1) });
    }
    const skills = state.bossSkills;
    if (skills.exiled.includes(characterId)) {
      skills.exiled = skills.exiled.filter((id) => id !== characterId);
      resumeUnit(state, characterId);
    }
    if (skills.active?.stage === 2 && source !== "boss-auto" && !skills.betrayedThisWindow.includes(characterId)) {
      skills.betrayedThisWindow.push(characterId);
      // 上一窗口仍在抵挡的同名单位不重复增加护盾。
      if (!skills.shields.some((shield) => shield.characterId === characterId)) {
        const maximum = (state.bossMaxHp + 19n) / 20n;
        skills.shields.push({ characterId, remaining: maximum, maximum, joinedAtMs: state.activeElapsedMs });
      }
      cancelUnitAttacks(state, characterId);
    }
    state.boardRemaining[characterId] -= count;
    gains.push({ characterId, before, level });
    if (state.boardRemaining[characterId] === 0 && !unitUnavailable(state, characterId)) casts.push({ id: state.nextEventId++, characterId, level, kind: "ultimate", amount: ultimateDamage(level) });
  }
  casts.sort((a, b) => state.battleUnits[a.characterId]!.joinedOrder - state.battleUnits[b.characterId]!.joinedOrder);
  const effects: BattleEffect[] = [];
  if (casts.length) {
    if (options.playCinematics) {
      state.ultimateBatch = { casts, index: 0, phase: "preparing", remainingMs: IMAGE_WAIT_MS, reducedMotion: options.reducedMotion };
      startPreparation(state, effects);
    } else {
      stageUltimateEffects(state, casts, options.reducedMotion, effects);
    }
  }
  state.boardSettlement = { id: state.nextEventId++, phase: "waiting", kind: "check", targetStage: state.boardStage, board: null };
  effects.push(...advanceBattle(state, 0, { playCinematics: options.playCinematics }));
  return { gains, effects };
}

export function useReducedMotion(state: GameState): void {
  const batch = state.ultimateBatch;
  if (batch && !batch.reducedMotion) {
    batch.reducedMotion = true;
    if (batch.phase === "playing") batch.remainingMs = Math.min(300, batch.remainingMs);
  }
  for (const run of state.lightningRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
  for (const run of state.chargeRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
  for (const run of state.psychicRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
  for (const run of state.sonicRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
  for (const run of state.sprayRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
  for (const run of state.bananaRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
  for (const run of state.candyRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
  for (const run of state.netRuns) {
    if (run.reducedMotion) continue;
    run.reducedMotion = true;
    run.elapsedMs = 0;
    run.hitAtMs = 0;
    run.durationMs = REDUCED_EFFECT_DURATION_MS;
  }
}
