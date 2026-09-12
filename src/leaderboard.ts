import { teamPower } from "./engine/combat";
import { getToySdk, type ToyMyRank, type ToyRankItem, type ToyUserProfile } from "./toy-sdk";
import type { GameState } from "./types";

export type LeaderboardBoard = 1 | 2;
export const LEADERBOARD_SCORE_MAX = 16_777_215;

export interface LeaderboardData {
  board: LeaderboardBoard;
  items: ToyRankItem[];
  mine: ToyMyRank | null;
  profile: ToyUserProfile | null;
}

interface Scores {
  kills: number;
  power: number;
}

function capScore(value: bigint | number): number {
  if (typeof value === "bigint") return value >= BigInt(LEADERBOARD_SCORE_MAX) ? LEADERBOARD_SCORE_MAX : Number(value);
  return Math.min(LEADERBOARD_SCORE_MAX, Math.max(0, value));
}

export class LeaderboardClient {
  private active = false;
  private profile: ToyUserProfile | null = null;
  private pending: Scores | null = null;
  private submitting: Promise<void> | null = null;
  private warned = false;

  constructor(
    enabled: boolean,
    private readonly onEnable: () => Promise<void>,
    private readonly report: (message: string) => void,
  ) {
    this.active = enabled;
  }

  get enabled(): boolean {
    return this.active;
  }

  get currentProfile(): ToyUserProfile | null {
    return this.profile;
  }

  restoreEnabled(): void {
    this.active = true;
  }

  async authorize(): Promise<ToyUserProfile | null> {
    const sdk = getToySdk();
    if (!sdk) return null;
    try {
      // 首次资料确认要求用户手势；点击入口后直接发起，避免先 await 能力探测而丢失激活态。
      this.profile = await sdk.getUserProfile();
      if (!this.active) {
        this.active = true;
        void this.onEnable();
      }
      return this.profile;
    } catch {
      return null;
    }
  }

  submit(state: GameState): Promise<void> {
    if (!this.active) return Promise.resolve();
    this.pending = { kills: capScore(state.bossKillCount), power: capScore(teamPower(state)) };
    return this.drain();
  }

  async load(board: LeaderboardBoard, state: GameState): Promise<LeaderboardData> {
    await this.submit(state);
    const sdk = getToySdk();
    if (!sdk) throw new Error("当前环境不支持排行榜");
    const [listSupported, mineSupported] = await Promise.all([sdk.isSupport("getRankList"), sdk.isSupport("getMyRank")]);
    if (!listSupported) throw new Error("当前环境不支持排行榜");
    const itemsPromise = sdk.getRankList({ board, period: "all", limit: 50 });
    const minePromise = mineSupported ? sdk.getMyRank({ board, period: "all" }).catch(() => null) : Promise.resolve(null);
    const [items, mine] = await Promise.all([itemsPromise, minePromise]);
    return { board, items: items.slice(0, 50), mine, profile: this.profile };
  }

  private drain(): Promise<void> {
    if (this.submitting) return this.submitting;
    this.submitting = (async () => {
      while (this.pending && this.active) {
        const scores = this.pending;
        this.pending = null;
        const sdk = getToySdk();
        try {
          if (!sdk || !await sdk.isSupport("submitScore")) throw new Error("当前环境不支持排行榜上报");
          await Promise.all([
            sdk.submitScore({ board: 1, score: scores.kills }),
            sdk.submitScore({ board: 2, score: scores.power }),
          ]);
        } catch {
          if (!this.pending) this.pending = scores;
          if (!this.warned) {
            this.warned = true;
            this.report("排行榜数据暂时未同步，将在下次击杀或打开排行榜时重试。");
          }
          break;
        }
      }
    })().finally(() => { this.submitting = null; });
    return this.submitting;
  }
}
