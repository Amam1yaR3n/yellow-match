export type ToyAbility =
  | "navigate"
  | "getUserProfile"
  | "getAuthorProfile"
  | "getAuthorRelation"
  | "getVideoUserActions"
  | "getAuthorVideos"
  | "getCloudStorage"
  | "setCloudStorage"
  | "removeCloudStorage"
  | "submitScore"
  | "getRankList"
  | "getMyRank";

export interface ToyUserProfile {
  avatar: string;
  nickname: string;
  toyOpenId?: string;
}

export interface ToyAuthorProfile {
  avatar: string;
  nickname: string;
}

export interface ToyAuthorProfileResp {
  status: string;
  data?: ToyAuthorProfile;
}

export type ToyVideoRef = { bvid: string; aid?: never } | { aid: number; bvid?: never };

export interface ToyAuthorRelationResp {
  status: string;
  data?: { isFollowing: boolean };
}

export interface ToyVideoUserActionsResp {
  status: string;
  items: Array<{
    status: string;
    aid: number;
    bvid: string;
    liked?: boolean;
    coinCount?: number;
    favorited?: boolean;
  }>;
}

export interface ToyAuthorVideoInfo {
  title?: string;
  cover?: string;
  pic?: string;
}

export interface ToyAuthorVideosResp {
  status: string;
  items: Array<ToyAuthorVideoInfo & {
    status: string;
    bvid: string;
    data?: ToyAuthorVideoInfo;
  }>;
}

export interface ToyRankItem {
  rank: number;
  score: number;
  nickname: string;
  avatar: string;
}

export interface ToyMyRank {
  ranked: boolean;
  rank: number;
  score: number;
}

export interface ToySdk {
  isSupport(ability: ToyAbility): Promise<boolean>;
  navigate(req: { type: "video" | "space" | "search" | "opus" | "tribee" | "toy"; id: string; extra?: Record<string, string> }): Promise<void>;
  getUserProfile(): Promise<ToyUserProfile>;
  getAuthorProfile(): Promise<ToyAuthorProfileResp>;
  getAuthorRelation(): Promise<ToyAuthorRelationResp>;
  getVideoUserActions(req: { videos: ToyVideoRef[]; aids?: never } | { aids: number[]; videos?: never }): Promise<ToyVideoUserActionsResp>;
  getAuthorVideos(req: { videos: ToyVideoRef[] }): Promise<ToyAuthorVideosResp>;
  getCloudStorage(keys?: string[]): Promise<Record<string, string>>;
  setCloudStorage(items: Record<string, string>): Promise<void>;
  removeCloudStorage(keys: string[]): Promise<void>;
  submitScore(req: { board?: 1 | 2 | 3; score: number }): Promise<{ score: number }>;
  getRankList(req?: { board?: 1 | 2 | 3; period?: "all" | "month" | "week" | "day"; limit?: number }): Promise<ToyRankItem[]>;
  getMyRank(req?: { board?: 1 | 2 | 3; period?: "all" | "month" | "week" | "day" }): Promise<ToyMyRank>;
}

declare global {
  interface Window {
    toy?: ToySdk;
  }
}

export function getToySdk(): ToySdk | null {
  return window.toy ?? null;
}
