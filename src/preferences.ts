import { GAME_STORAGE_KEY } from "./save";

const PREFERENCES_VERSION = 1;
const PREFERENCES_KEY = `${GAME_STORAGE_KEY}:preferences`;

export interface GamePreferences {
  volume: number;
  ultimateCinematics: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<GamePreferences> = {
  volume: 50,
  ultimateCinematics: true,
};

export function loadPreferences(): GamePreferences {
  try {
    const text = localStorage.getItem(PREFERENCES_KEY);
    if (!text) return { ...DEFAULT_PREFERENCES };
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PREFERENCES };
    const value = raw as Record<string, unknown>;
    if (
      value.version !== PREFERENCES_VERSION
      || !Number.isInteger(value.volume)
      || (value.volume as number) < 0
      || (value.volume as number) > 100
      || typeof value.ultimateCinematics !== "boolean"
    ) return { ...DEFAULT_PREFERENCES };
    return {
      volume: value.volume as number,
      ultimateCinematics: value.ultimateCinematics,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: GamePreferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: PREFERENCES_VERSION, ...preferences }));
  } catch {
    // 偏好保存失败不阻断游戏；当前页面仍保留已选择的设置。
  }
}
