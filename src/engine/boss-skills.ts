import type { BossSkillRun, BossSkillStage, BossSkillState, CharacterId, GameState } from "../types";

export const BOSS_SKILL_SHOUTS: Record<BossSkillStage, string> = {
  1: "翻涌！", 2: "归顺！", 3: "封锁！", 4: "焚烧！", 5: "堵住！",
};

export const BOSS_SKILL_NAMES: Record<BossSkillStage, string> = {
  1: "熔流旋涡", 2: "烈焰蛊惑", 3: "熔岩锁链", 4: "火山射线", 5: "岩浆路障",
};
export function createBossSkillState(triggeredStage = 0): BossSkillState {
  return { triggeredStage, queue: [], active: null, betrayedThisWindow: [], shields: [], exiled: [] };
}
export function bossSkillDuration(stage: BossSkillStage): number {
  return stage === 2 ? 4_000 : stage === 3 ? Infinity : 1_000;
}
export function bossBlocksBoard(state: GameState): boolean {
  return (state.bossSkills.active !== null && state.bossSkills.active.stage !== 2);
}
export function unitUnavailable(state: GameState, id: CharacterId): boolean {
  return state.bossSkills.exiled.includes(id) || state.bossSkills.shields.some((shield) => shield.characterId === id);
}

export function bossSkillHitAt(stage: BossSkillStage): number {
  return stage === 4 ? 400 : stage === 5 ? 700 : 0;
}

export const BOSS_LASER_FIRE_MS = 250;

export const CHAIN_HITS = 12;
export const CHAIN_ENTER_MS = 650;
export const CHAIN_RELEASE_MS = 250;
export function bossSkillDeadline(run: BossSkillRun): number {
  return run.stage === 3 ? (run.chainReleaseAtMs === null ? Infinity : run.chainReleaseAtMs + CHAIN_RELEASE_MS) : bossSkillDuration(run.stage);
}
export function hitBossChain(state: GameState): boolean {
  const run = state.bossSkills.active;
  if (state.phase !== "playing" || !run || run.stage !== 3 || run.elapsedMs < CHAIN_ENTER_MS || run.chainHits >= CHAIN_HITS) return false;
  run.chainHits += 1;
  run.chainLastHitAtMs = run.elapsedMs;
  if (run.chainHits === CHAIN_HITS) run.chainReleaseAtMs = run.elapsedMs;
  return true;
}
