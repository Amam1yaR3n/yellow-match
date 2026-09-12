import { BOARD_STAGES, placeBossObstacles, remainingTileCount } from "./engine/board";
import { bossSkillHitAt, bossSkillDuration, createBossSkillState, unitUnavailable } from "./engine/boss-skills";
import { ULTIMATE_RUN_KEYS } from "./engine/combat";
import { getCharacter } from "./characters";
import { SPRAY_DURATION_MS, SPRAY_HIT_AT_MS, BANANA_DURATION_MS, BANANA_HIT_AT_MS, CANDY_DURATION_MS, CANDY_HIT_AT_MS, NET_DURATION_MS, NET_HIT_AT_MS, BOSS_INITIAL_HP, BOSS_REVIVE_MS, chargeTiming, CINEMATIC_DURATION_MS, PSYCHIC_DURATION_MS, PSYCHIC_HIT_AT_MS, REDUCED_EFFECT_DURATION_MS, SONIC_DURATION_MS, SONIC_HIT_AT_MS, countCharacters, nextBossMaxHp } from "./engine/combat";
import { MAX_BOSS_OBSTACLES, DOUBAO_OBSTACLE, CHARACTER_IDS, type BossSkillStage, type BoardMatrix, type CharacterId, type GameState, type PendingHit, type UltimateCast } from "./types";

export const GAME_STORAGE_KEY = `yellow-match:${new URL(".", document.baseURI).pathname}`;
const SAVE_VERSION = 18;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("存档对象无效");
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error("存档数字无效");
  return value;
}
function big(value: unknown, min = 0n): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new Error("存档大整数无效");
  const result = BigInt(value);
  if (result < min) throw new Error("存档大整数越界");
  return result;
}
function character(value: unknown): CharacterId {
  if (!CHARACTER_IDS.includes(value as CharacterId)) throw new Error("未知角色");
  return value as CharacterId;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("存档数组无效");
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("存档标记无效");
  return value;
}
function board(value: unknown, stage: number): BoardMatrix {
  const size = BOARD_STAGES[stage].size;
  const rows = array(value, size);
  if (rows.length !== size) throw new Error("棋盘尺寸不符");
  const result = rows.map((row) => {
    const cells = array(row, size);
    if (cells.length !== size) throw new Error("棋盘列数不符");
    return cells.map((cell) => cell === null || cell === DOUBAO_OBSTACLE ? cell : character(cell));
  });
  if (result.flat().filter((cell) => cell === DOUBAO_OBSTACLE).length > MAX_BOSS_OBSTACLES) throw new Error("障碍数量无效");
  if (Object.values(countCharacters(result)).some((count) => count % 2)) throw new Error("角色数量不是偶数");
  return result;
}

export function decodeSave(text: string): GameState {
  const envelope = object(JSON.parse(text));
  const version = integer(envelope.version, 1, SAVE_VERSION);
  const raw = object(envelope.state);
  // 旧存档移除退役角色，棋盘上的成对棋子转为小黄人，保留其余进度。
  if (version < 15) {
    const retiredId = "winnie-the-pooh";
    const replaceTiles = (value: unknown): unknown => Array.isArray(value)
      ? value.map(replaceTiles) : value === retiredId ? "minion" : value;
    raw.board = replaceTiles(raw.board);
    const counts = object(raw.boardRemaining);
    counts.minion = integer(counts.minion) + integer(counts[retiredId] ?? 0);
    delete counts[retiredId];
    const units = object(raw.battleUnits);
    delete units[retiredId];
    Object.values(units).map(object).sort((a, b) => integer(a.joinedOrder) - integer(b.joinedOrder))
      .forEach((unit, index) => { unit.joinedOrder = index; });
    const keepAttack = (value: unknown): boolean => object(value).characterId !== retiredId;
    raw.pendingHits = array(raw.pendingHits, 100).filter(keepAttack);
    for (const key of ULTIMATE_RUN_KEYS) {
      if (Array.isArray(raw[key])) raw[key] = array(raw[key], 100).filter(keepAttack);
    }
    if (raw.ultimateBatch !== null) {
      const batch = object(raw.ultimateBatch);
      const casts = array(batch.casts, CHARACTER_IDS.length + 1);
      const index = integer(batch.index, 0, casts.length - 1);
      batch.casts = casts.filter(keepAttack);
      batch.index = Math.min(casts.slice(0, index).filter(keepAttack).length, (batch.casts as unknown[]).length - 1);
      if (!(batch.casts as unknown[]).length) raw.ultimateBatch = null;
    }
    if (raw.boardSettlement !== null) {
      const task = object(raw.boardSettlement);
      if (task.phase === "ready" && task.kind === "next") {
        task.phase = "generating";
        task.board = null;
      } else task.board = replaceTiles(task.board);
    }
    if (version >= 14) {
      const skills = object(raw.bossSkills);
      for (const key of ["betrayedThisWindow", "exiled"]) {
        skills[key] = array(skills[key], CHARACTER_IDS.length + 1).filter((id) => id !== retiredId);
      }
      skills.shields = array(skills.shields, CHARACTER_IDS.length + 1).filter(keepAttack);
    }
  }
  const stage = integer(raw.boardStage, 0, BOARD_STAGES.length - 1);
  const matrix = board(raw.board, stage);
  const activeElapsedMs = integer(raw.activeElapsedMs);
  const storedBossHp = big(raw.bossHp);
  const storedBossMaxHp = big(raw.bossMaxHp, 1n);
  const bossReviveRemainingMs = integer(raw.bossReviveRemainingMs, 0, BOSS_REVIVE_MS);
  if (storedBossHp > storedBossMaxHp || (storedBossHp === 0n) !== (bossReviveRemainingMs > 0)) throw new Error("魔王状态无效");
  const units: GameState["battleUnits"] = {};
  const order = new Set<number>();
  for (const [key, value] of Object.entries(object(raw.battleUnits))) {
    const id = character(key);
    const unit = object(value);
    if (unit.id !== id) throw new Error("队员编号不符");
    const joinedOrder = integer(unit.joinedOrder, 0, CHARACTER_IDS.length - 1);
    if (order.has(joinedOrder)) throw new Error("入队顺序重复");
    order.add(joinedOrder);
    units[id] = { id, level: integer(unit.level, 1), joinedOrder, nextAttackAtMs: integer(unit.nextAttackAtMs, 0, activeElapsedMs + 3_300) };
  }
  if ([...order].some((index) => index >= order.size)) throw new Error("入队顺序不连续");
  const nextEventId = integer(raw.nextEventId, 1);
  const ids = new Set<number>();
  const eventId = (value: unknown): number => {
    const id = integer(value, 1, nextEventId - 1);
    if (ids.has(id)) throw new Error("待办编号重复");
    ids.add(id);
    return id;
  };
  const hit = (value: unknown): PendingHit => {
    const item = object(value);
    const id = character(item.characterId);
    if (!units[id] || (item.kind !== "normal" && item.kind !== "ultimate")) throw new Error("待命中角色无效");
    return { id: eventId(item.id), characterId: id, kind: item.kind, amount: big(item.amount, 1n) };
  };
  const cast = (value: unknown): UltimateCast => {
    const item = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate") throw new Error("大招类型无效");
    return { ...attack, level: integer(item.level, 1, units[attack.characterId]!.level) };
  };
  let expectedMaxHp = BOSS_INITIAL_HP;
  let completedRevives = 0;
  while (expectedMaxHp < storedBossMaxHp) {
    expectedMaxHp = version >= 15
      ? nextBossMaxHp(expectedMaxHp)
      : version >= 5
        ? (expectedMaxHp * 18n + 5n) / 10n
      : version >= 3
        ? expectedMaxHp * 2n
        : (expectedMaxHp * 21n + 5n) / 10n;
    completedRevives += 1;
    if (completedRevives > 10_000) throw new Error("存档魔王生命无效");
  }
  if (expectedMaxHp !== storedBossMaxHp) throw new Error("存档魔王生命无效");
  let bossMaxHp = BOSS_INITIAL_HP;
  for (let revive = 0; revive < completedRevives; revive += 1) bossMaxHp = nextBossMaxHp(bossMaxHp);
  const scaledBossHp = (storedBossHp * bossMaxHp + storedBossMaxHp / 2n) / storedBossMaxHp;
  const bossHp = storedBossHp === 0n ? 0n : scaledBossHp > 0n ? scaledBossHp : 1n;
  const derivedBossKillCount = completedRevives + (bossHp === 0n ? 1 : 0);
  const bossKillCount = version >= 2 ? integer(raw.bossKillCount) : derivedBossKillCount;
  if (bossKillCount !== derivedBossKillCount) throw new Error("存档魔王击杀数无效");
  const state: GameState = {
    board: matrix, boardStage: stage, phase: "playing", hintsRemaining: integer(raw.hintsRemaining), bombCount: integer(raw.bombCount, 0, Number.MAX_SAFE_INTEGER - (version < 18 ? 1 : 0)) + (version < 18 ? 1 : 0),
    // 版本升级只补一次基础炸弹；互动奖励与库存一起持久化。
    interactionRewards: version < 18 ? { triple: false, following: false } : {
      triple: flag(object(raw.interactionRewards).triple),
      following: flag(object(raw.interactionRewards).following),
    },
    bossHp, bossMaxHp, bossReviveRemainingMs, bossKillCount,
    bossSkills: createBossSkillState(bossHp === 0n ? 0 : Math.min(5, Number((bossMaxHp - bossHp) * 6n / bossMaxHp))),
    pendingBossEliminations: version >= 4 ? integer(raw.pendingBossEliminations) : 0,
    activeElapsedMs, totalDamage: big(raw.totalDamage),
    boardRemaining: countCharacters(matrix), battleUnits: units, nextEventId,
    pendingHits: array(raw.pendingHits, 100).map(hit), ultimateBatch: null, lightningRuns: [], chargeRuns: [], psychicRuns: [], sonicRuns: [], sprayRuns: [], bananaRuns: [], candyRuns: [], netRuns: [], boardSettlement: null,
  };
  const storedCounts = object(raw.boardRemaining);
  for (const id of CHARACTER_IDS) if (storedCounts[id] !== state.boardRemaining[id]) throw new Error("棋盘计数不符");
  if (raw.ultimateBatch !== null) {
    const batch = object(raw.ultimateBatch);
    const casts = array(batch.casts, CHARACTER_IDS.length).map(cast);
    if (!casts.length || new Set(casts.map((item) => item.characterId)).size !== casts.length) throw new Error("大招批次无效");
    if (batch.phase !== "preparing" && batch.phase !== "playing") throw new Error("特写阶段无效");
    const reducedMotion = flag(batch.reducedMotion);
    state.ultimateBatch = {
      casts, index: integer(batch.index, 0, casts.length - 1), phase: batch.phase, reducedMotion,
      remainingMs: integer(batch.remainingMs, 0, batch.phase === "preparing" ? 250 : reducedMotion ? 300 : CINEMATIC_DURATION_MS),
    };
  }
  state.lightningRuns = array(raw.lightningRuns, 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate") throw new Error("电击类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const durationMs = reducedMotion ? 300 : 1_800;
    const hitAtMs = reducedMotion ? 0 : 400;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("电击计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if (hasHit && elapsedMs < hitAtMs) throw new Error("电击命中状态无效");
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit };
  });
  state.chargeRuns = array(version >= 6 ? raw.chargeRuns : [], 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate" || getCharacter(attack.characterId).ultimate.effect !== "charge") throw new Error("冲撞类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const timing = chargeTiming(attack.characterId);
    const durationMs = reducedMotion ? REDUCED_EFFECT_DURATION_MS : timing.durationMs;
    const hitAtMs = reducedMotion ? 0 : timing.hitAtMs;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("冲撞计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if ((hasHit && elapsedMs < hitAtMs) || (!hasHit && elapsedMs > hitAtMs)) throw new Error("冲撞命中状态无效");
    const laneCount = integer(run.laneCount, 1, CHARACTER_IDS.filter((id) => getCharacter(id).ultimate.effect === "charge").length);
    const laneIndex = integer(run.laneIndex, 0, laneCount - 1);
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit, laneIndex, laneCount };
  });
  state.psychicRuns = array(version >= 7 ? raw.psychicRuns : [], 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate" || getCharacter(attack.characterId).ultimate.effect !== "psychic") throw new Error("念力类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const durationMs = reducedMotion ? REDUCED_EFFECT_DURATION_MS : PSYCHIC_DURATION_MS;
    const hitAtMs = reducedMotion ? 0 : PSYCHIC_HIT_AT_MS;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("念力计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if ((hasHit && elapsedMs < hitAtMs) || (!hasHit && elapsedMs > hitAtMs)) throw new Error("念力命中状态无效");
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit };
  });
  state.sonicRuns = array(version >= 8 ? raw.sonicRuns : [], 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate" || getCharacter(attack.characterId).ultimate.effect !== "sonic") throw new Error("声波类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const durationMs = reducedMotion ? REDUCED_EFFECT_DURATION_MS : SONIC_DURATION_MS;
    const hitAtMs = reducedMotion ? 0 : SONIC_HIT_AT_MS;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("声波计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if ((hasHit && elapsedMs < hitAtMs) || (!hasHit && elapsedMs > hitAtMs)) throw new Error("声波命中状态无效");
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit };
  });
  state.sprayRuns = array(version >= 13 ? raw.sprayRuns : [], 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate" || getCharacter(attack.characterId).ultimate.effect !== "spray") throw new Error("喷漆类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const durationMs = reducedMotion ? REDUCED_EFFECT_DURATION_MS : SPRAY_DURATION_MS;
    const hitAtMs = reducedMotion ? 0 : SPRAY_HIT_AT_MS;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("喷漆计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if ((hasHit && elapsedMs < hitAtMs) || (!hasHit && elapsedMs > hitAtMs)) throw new Error("喷漆命中状态无效");
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit };
  });
  state.bananaRuns = array(version >= 12 ? raw.bananaRuns : [], 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate" || getCharacter(attack.characterId).ultimate.effect !== "banana") throw new Error("香蕉大炮类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const durationMs = reducedMotion ? REDUCED_EFFECT_DURATION_MS : BANANA_DURATION_MS;
    const hitAtMs = reducedMotion ? 0 : BANANA_HIT_AT_MS;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("香蕉大炮计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if ((hasHit && elapsedMs < hitAtMs) || (!hasHit && elapsedMs > hitAtMs)) throw new Error("香蕉大炮命中状态无效");
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit };
  });
  state.candyRuns = array(version >= 11 ? raw.candyRuns : [], 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate" || getCharacter(attack.characterId).ultimate.effect !== "candy") throw new Error("糖果雨类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const durationMs = reducedMotion ? REDUCED_EFFECT_DURATION_MS : CANDY_DURATION_MS;
    const hitAtMs = reducedMotion ? 0 : CANDY_HIT_AT_MS;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("糖果雨计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if ((hasHit && elapsedMs < hitAtMs) || (!hasHit && elapsedMs > hitAtMs)) throw new Error("糖果雨命中状态无效");
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit };
  });
  state.netRuns = array(version >= 10 ? raw.netRuns : [], 100).map((value) => {
    const run = object(value);
    const attack = hit(value);
    if (attack.kind !== "ultimate" || getCharacter(attack.characterId).ultimate.effect !== "net") throw new Error("网兜类型无效");
    const reducedMotion = flag(run.reducedMotion);
    const durationMs = reducedMotion ? REDUCED_EFFECT_DURATION_MS : NET_DURATION_MS;
    const hitAtMs = reducedMotion ? 0 : NET_HIT_AT_MS;
    if (run.durationMs !== durationMs || run.hitAtMs !== hitAtMs) throw new Error("网兜计时无效");
    const elapsedMs = integer(run.elapsedMs, 0, durationMs);
    const hasHit = flag(run.hasHit);
    if ((hasHit && elapsedMs < hitAtMs) || (!hasHit && elapsedMs > hitAtMs)) throw new Error("网兜命中状态无效");
    return { ...attack, reducedMotion, durationMs, hitAtMs, elapsedMs, hasHit };
  });
  if (raw.boardSettlement !== null) {
    const task = object(raw.boardSettlement);
    if (task.phase !== "waiting" && task.phase !== "generating" && task.phase !== "ready") throw new Error("换盘阶段无效");
    if (task.kind !== "check" && task.kind !== "next" && task.kind !== "shuffle" && task.kind !== "boss-shuffle") throw new Error("换盘类型无效");
    const targetStage = integer(task.targetStage, 0, BOARD_STAGES.length - 1);
    const isEmpty = remainingTileCount(matrix) === 0;
    if (task.kind === "next" && (!isEmpty || targetStage !== Math.min(stage + 1, BOARD_STAGES.length - 1))) throw new Error("扩盘目标无效");
    if (task.kind !== "next" && targetStage !== stage) throw new Error("洗牌阶段无效");
    if ((task.kind === "check") !== (task.phase === "waiting")) throw new Error("换盘操作不一致");
    const ready = task.phase === "ready" ? board(task.board, targetStage) : null;
    if ((task.phase === "ready") !== (task.board !== null)) throw new Error("换盘结果无效");
    if (ready) {
      const counts = countCharacters(ready);
      if (task.kind === "shuffle" || task.kind === "boss-shuffle") {
        for (const id of CHARACTER_IDS) if (counts[id] !== state.boardRemaining[id]) throw new Error("洗牌角色不符");
        for (let row = 0; row < matrix.length; row++) for (let col = 0; col < matrix.length; col++) {
          if ((matrix[row][col] === DOUBAO_OBSTACLE) !== (ready[row][col] === DOUBAO_OBSTACLE)) throw new Error("洗牌障碍不符");
          if (version < 14 && (matrix[row][col] === null) !== (ready[row][col] === null)) throw new Error("洗牌空位不符");
        }
      } else {
        if (ready.flat().includes(DOUBAO_OBSTACLE)) throw new Error("新棋盘不能带障碍");
        const config = BOARD_STAGES[targetStage];
        if (Object.values(counts).filter(Boolean).length !== config.characterCount || Object.values(counts).reduce((a, b) => a + b, 0) !== Math.floor(config.size ** 2 / 2) * 2) throw new Error("新棋盘数量不符");
      }
    }
    state.boardSettlement = { id: eventId(task.id), phase: task.phase, kind: task.kind, targetStage, board: ready };
  }
  if (state.ultimateBatch && !state.boardSettlement) throw new Error("缺少大招后棋盘待办");
  if (!state.boardSettlement && remainingTileCount(matrix) === 0) throw new Error("空盘缺少换盘待办");
  if (version >= 14) {
    const rawSkills = object(raw.bossSkills);
    const triggeredStage = integer(rawSkills.triggeredStage, 0, 5);
    const expectedStage = bossHp === 0n ? 0 : Math.min(5, Number((bossMaxHp - bossHp) * 6n / bossMaxHp));
    if (triggeredStage !== expectedStage) throw new Error("技能阶段与血量不符");
    const stageNumber = (value: unknown): BossSkillStage => integer(value, 1, 5) as BossSkillStage;
    const queue = array(rawSkills.queue, 5).map(stageNumber);
    if (queue.some((stage, index) => stage > triggeredStage || (index > 0 && stage <= queue[index - 1]))) throw new Error("技能队列无效");
    const ids = (value: unknown): CharacterId[] => {
      const result = array(value, CHARACTER_IDS.length).map(character);
      if (new Set(result).size !== result.length || result.some((id) => !units[id])) throw new Error("技能角色无效");
      return result;
    };
    const skills: GameState["bossSkills"] = state.bossSkills = {
      triggeredStage, queue, active: null,
      betrayedThisWindow: ids(rawSkills.betrayedThisWindow), exiled: ids(rawSkills.exiled),
      shields: array(rawSkills.shields, CHARACTER_IDS.length).map((value) => {
        const item = object(value);
        const characterId = character(item.characterId);
        const maximum = big(item.maximum, 1n), remaining = big(item.remaining, 1n);
        if (!units[characterId] || maximum !== (storedBossMaxHp + 19n) / 20n || remaining > maximum) throw new Error("策反额度无效");
        const scaledMaximum = (bossMaxHp + 19n) / 20n;
        const scaledRemaining = (remaining * scaledMaximum + maximum - 1n) / maximum;
        return { characterId, maximum: scaledMaximum, remaining: scaledRemaining,
          joinedAtMs: version >= 16 ? integer(item.joinedAtMs, 0, state.activeElapsedMs) : Math.max(0, state.activeElapsedMs - 1_000) };
      }),
    };
    const shieldIds = skills.shields.map((shield) => shield.characterId);
    if (new Set(shieldIds).size !== shieldIds.length || shieldIds.some((id) => skills.exiled.includes(id))) throw new Error("角色离场状态冲突");
    if (rawSkills.active !== null) {
      const active = object(rawSkills.active);
      const stage = stageNumber(active.stage);
      let elapsedMs = integer(active.elapsedMs, 0, version < 16 && stage !== 2 && stage !== 3 ? 600 : stage === 3 ? Number.MAX_SAFE_INTEGER : bossSkillDuration(stage));
      const applied = flag(active.applied);
      if (stage > triggeredStage || queue.some((queued) => queued <= stage)) throw new Error("正在释放的技能无效");
      if ((stage === 2 || stage === 3) && !applied) throw new Error("限时技能无效");
      if (stage === 1 && !applied && elapsedMs !== 0) throw new Error("洗牌计时无效");
      const hitAt = version < 16 ? 300 : bossSkillHitAt(stage);
      if ((stage === 4 || stage === 5) && (applied ? elapsedMs < hitAt : elapsedMs > hitAt)) throw new Error("脉冲结算时间无效");
      if (version < 16) {
        if (stage === 1) elapsedMs = Math.round(elapsedMs * 1_000 / 600);
        if (stage === 4 || stage === 5) elapsedMs = applied
          ? bossSkillHitAt(stage) + Math.round((elapsedMs - 300) * (1_000 - bossSkillHitAt(stage)) / 300)
          : Math.round(elapsedMs * bossSkillHitAt(stage) / 300);
      }
      const obstacleTargets = array(active.obstacleTargets, MAX_BOSS_OBSTACLES).map((value) => {
        const coord = object(value);
        const row = integer(coord.row, 0, matrix.length - 1), col = integer(coord.col, 0, matrix.length - 1);
        if (stage !== 5 || (applied ? matrix[row][col] !== DOUBAO_OBSTACLE : matrix[row][col] !== null)) throw new Error("障碍投放位置无效");
        return { row, col };
      });
      if (new Set(obstacleTargets.map(({ row, col }) => `${row}:${col}`)).size !== obstacleTargets.length) throw new Error("障碍投放位置重复");
      if (version < 16 && stage === 5 && !applied) {
        const planned = placeBossObstacles(matrix);
        for (let row = 0; row < matrix.length; row++) for (let col = 0; col < matrix.length; col++) {
          if (planned[row][col] === DOUBAO_OBSTACLE && matrix[row][col] === null) obstacleTargets.push({ row, col });
        }
      }
      const shuffleFrom = stage === 1 ? (version >= 16 && active.shuffleFrom != null ? board(active.shuffleFrom, state.boardStage) : matrix.map((row) => [...row])) : null;
      const exileTargets = version >= 16 ? ids(active.exileTargets) : [];
      if (exileTargets.length && (stage !== 4 || !applied || exileTargets.some((id) => !skills.exiled.includes(id)))) throw new Error("激光目标无效");
      if (stage === 5 && !applied && matrix.flat().filter((cell) => cell === DOUBAO_OBSTACLE).length + obstacleTargets.length > MAX_BOSS_OBSTACLES) throw new Error("障碍数量无效");
      const chainHits = stage === 3 && version >= 17 ? integer(active.chainHits, 0, 12) : 0;
      const chainLastHitAtMs = chainHits > 0 ? integer(active.chainLastHitAtMs, 650, elapsedMs) : null;
      const chainReleaseAtMs = chainHits === 12 ? integer(active.chainReleaseAtMs, 650, elapsedMs) : null;
      if (chainReleaseAtMs !== null && (chainReleaseAtMs !== chainLastHitAtMs || elapsedMs > chainReleaseAtMs + 250)) throw new Error("锁链解除时间无效");
      skills.active = { stage, elapsedMs, applied, obstacleTargets, shuffleFrom, exileTargets, chainHits, chainLastHitAtMs, chainReleaseAtMs };
    }
    if (rawSkills.cinematic != null) {
      const cinematic = object(rawSkills.cinematic);
      const stage = stageNumber(cinematic.stage);
      integer(cinematic.remainingMs, 0, 1_000);
      if (skills.active || state.ultimateBatch || state.boardSettlement || stage > triggeredStage
        || queue.some((queued) => queued <= stage)) throw new Error("火山哥特写状态无效");
      // 旧特写尚未结算；放回队首，恢复后直接出招。
      queue.unshift(stage);
    }
    if ((state.boardSettlement?.kind === "boss-shuffle") !== (skills.active?.stage === 1 && !skills.active.applied)) throw new Error("技能洗牌待办不符");
    if (bossHp === 0n && (skills.active || queue.length || skills.shields.length || skills.betrayedThisWindow.length)) throw new Error("复活期间技能未清理");
    if (state.pendingHits.some((hit) => unitUnavailable(state, hit.characterId))
      || ULTIMATE_RUN_KEYS.some((key) => state[key].some((run) => !run.hasHit && unitUnavailable(state, run.characterId)))
      || state.ultimateBatch?.casts.some((cast) => unitUnavailable(state, cast.characterId))) throw new Error("离场角色仍有攻击");
  }
  return state;
}

export function encodeSave(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, state }, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value);
}

export class LocalSave {
  private readonly key = `${GAME_STORAGE_KEY}:save`;
  private readonly backupKey = `${GAME_STORAGE_KEY}:backup`;
  private lastValid: string | null = null;
  private warned = false;

  constructor(private readonly report: (message: string) => void) {}

  load(): GameState | null {
    try {
      const primary = localStorage.getItem(this.key);
      const backup = localStorage.getItem(this.backupKey);
      for (const [index, candidate] of [primary, backup].entries()) {
        if (!candidate) continue;
        try {
          const state = decodeSave(candidate);
          this.lastValid = candidate;
          if (index === 1) this.report("主存档不可用，已恢复上一份有效存档。");
          return state;
        } catch { /* 只使用完整且校验通过的快照。 */ }
      }
      if (primary || backup) this.report("存档无法读取，已开始新游戏。");
    } catch { this.unavailable(); }
    return null;
  }

  save(state: GameState): void {
    if (state.phase !== "playing") return;
    try {
      const serialized = encodeSave(state);
      if (this.lastValid) localStorage.setItem(this.backupKey, this.lastValid);
      localStorage.setItem(this.key, serialized);
      this.lastValid = serialized;
    } catch { this.unavailable(); }
  }

  clear(): void {
    this.lastValid = null;
    try { localStorage.removeItem(this.key); localStorage.removeItem(this.backupKey); }
    catch { this.unavailable(); }
  }

  private unavailable(): void {
    if (this.warned) return;
    this.warned = true;
    this.report("浏览器无法保存本地进度，本次仍可继续游玩；关闭后可能无法续玩。");
  }
}
