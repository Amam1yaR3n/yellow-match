export const CHARACTER_IDS = [
  "pikachu",
  "psyduck",
  "spongebob",
  "minion",
  "bumblebee",
  "smiley",
  "invincible",
  "lei-yi",
  "bart-simpson",
  "nai-long",
  "nai-wa",
  "niu-lai",
  "meituan-kangaroo",
  "yellow-mms",
  "pacman",
  "hong-kong-yellow-duck",
  "among-us-crewmate",
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface Coord {
  row: number;
  col: number;
}

export interface PathPoint extends Coord {}

export type TileStatus = "active" | "removing" | "removed";

export interface TileState {
  coord: Coord;
  characterId: CharacterId | null;
  status: TileStatus;
}

export type GamePhase = "loading" | "playing" | "blocked";

export interface BoardConfig {
  size: 7 | 8 | 9 | 10;
  characterCount: number;
}

export interface BattleUnitState {
  id: CharacterId;
  level: number;
  joinedOrder: number;
  nextAttackAtMs: number;
}

export type CharacterCountMap = Record<CharacterId, number>;

export interface GameState {
  board: BoardMatrix;
  boardStage: number;
  phase: GamePhase;
  hintsRemaining: number;
  bombCount: number;
  interactionRewards: { triple: boolean; following: boolean };
  bossSkills: BossSkillState;
  bossHp: bigint;
  bossMaxHp: bigint;
  bossReviveRemainingMs: number;
  bossKillCount: number;
  pendingBossEliminations: number;
  totalDamage: bigint;
  activeElapsedMs: number;
  boardRemaining: CharacterCountMap;
  battleUnits: Partial<Record<CharacterId, BattleUnitState>>;
  nextEventId: number;
  pendingHits: PendingHit[];
  ultimateBatch: UltimateBatch | null;
  lightningRuns: LightningState[];
  chargeRuns: ChargeState[];
  psychicRuns: PsychicState[];
  sonicRuns: SonicState[];
  sprayRuns: SprayState[];
  bananaRuns: BananaState[];
  candyRuns: CandyState[];
  netRuns: NetState[];
  boardSettlement: BoardSettlement | null;
}

export interface PendingHit {
  id: number;
  characterId: CharacterId;
  amount: bigint;
  kind: "normal" | "ultimate";
}

export interface UltimateCast extends PendingHit {
  level: number;
}

export interface UltimateBatch {
  casts: UltimateCast[];
  index: number;
  phase: "preparing" | "playing";
  remainingMs: number;
  reducedMotion: boolean;
}

export interface LightningState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
}

export interface ChargeState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
  laneIndex: number;
  laneCount: number;
}

export interface PsychicState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
}

export interface SprayState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
}

export interface BananaState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
}

export interface CandyState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
}

export interface NetState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
}

export interface SonicState extends PendingHit {
  elapsedMs: number;
  hitAtMs: number;
  durationMs: number;
  hasHit: boolean;
  reducedMotion: boolean;
}

export interface BoardSettlement {
  id: number;
  phase: "waiting" | "generating" | "ready";
  kind: "check" | "next" | "shuffle" | "boss-shuffle";
  targetStage: number;
  board: BoardMatrix | null;
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  imageUrl: string;
  ultimate: {
    name: string;
    imageUrl: string;
    soundUrl?: string;
    fieldSoundUrl?: string;
    effect?: "lightning" | "charge" | "psychic" | "sonic" | "spray" | "banana" | "candy" | "net";
    knife?: { imageUrl: string };
    chew?: { openImageUrl: string; closedImageUrl: string };
    vehicle?: {
      imageUrl: string;
      imageWidth: number;
      imageHeight: number;
      bounds: { x: number; y: number; width: number; height: number };
    };
    direction: "up" | "down";
  };
}

export const MAX_BOSS_OBSTACLES = 6;
// 保留旧持久化标记，使历史棋盘中的路障直接沿用岩浆外观。
export const DOUBAO_OBSTACLE = "doubao-obstacle" as const;
export type BoardCell = CharacterId | typeof DOUBAO_OBSTACLE | null;
export type BoardMatrix = BoardCell[][];
export function isCharacterCell(cell: BoardCell | undefined): cell is CharacterId {
  return cell != null && cell !== DOUBAO_OBSTACLE;
}

export type BossSkillStage = 1 | 2 | 3 | 4 | 5;
export interface BossSkillRun {
  chainHits: number;
  chainLastHitAtMs: number | null;
  chainReleaseAtMs: number | null;
  stage: BossSkillStage;
  elapsedMs: number;
  applied: boolean;
  obstacleTargets: Coord[];
  shuffleFrom: BoardMatrix | null;
  exileTargets: CharacterId[];
}
export interface BossSkillState {
  triggeredStage: number;
  queue: BossSkillStage[];
  active: BossSkillRun | null;
  betrayedThisWindow: CharacterId[];
  shields: { characterId: CharacterId; remaining: bigint; maximum: bigint; joinedAtMs: number }[];
  exiled: CharacterId[];
}
