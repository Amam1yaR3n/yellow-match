import { DOUBAO_OBSTACLE, type BoardMatrix, type Coord, type PathPoint } from "../types";

const DIRECTIONS = [
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
] as const;

interface SearchState {
  row: number;
  col: number;
  direction: number;
  turns: number;
}

function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

function stateKey(state: SearchState): string {
  return `${state.row},${state.col},${state.direction},${state.turns}`;
}

function isWalkable(board: BoardMatrix, row: number, col: number, start: Coord, target: Coord): boolean {
  const paddedRows = board.length + 2;
  const paddedCols = (board[0]?.length ?? 0) + 2;
  if (row < 0 || col < 0 || row >= paddedRows || col >= paddedCols) {
    return false;
  }

  const boardCoord = { row: row - 1, col: col - 1 };
  if (sameCoord(boardCoord, target)) {
    return true;
  }
  if (sameCoord(boardCoord, start)) {
    return false;
  }
  if (row === 0 || col === 0 || row === paddedRows - 1 || col === paddedCols - 1) {
    return true;
  }
  return board[boardCoord.row]?.[boardCoord.col] === null;
}

function compressPath(points: PathPoint[]): PathPoint[] {
  if (points.length <= 2) {
    return points;
  }

  const compressed: PathPoint[] = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = { row: current.row - previous.row, col: current.col - previous.col };
    const outgoing = { row: next.row - current.row, col: next.col - current.col };
    if (incoming.row !== outgoing.row || incoming.col !== outgoing.col) {
      compressed.push(current);
    }
  }
  compressed.push(points[points.length - 1]);
  return compressed;
}

export function findPath(board: BoardMatrix, start: Coord, target: Coord): PathPoint[] | null {
  if (board[start.row]?.[start.col] === DOUBAO_OBSTACLE || board[target.row]?.[target.col] === DOUBAO_OBSTACLE) return null;
  if (sameCoord(start, target)) {
    return null;
  }

  const paddedStart = { row: start.row + 1, col: start.col + 1 };
  const paddedTarget = { row: target.row + 1, col: target.col + 1 };
  const initial: SearchState = { ...paddedStart, direction: -1, turns: 0 };
  const queue: SearchState[] = [initial];
  let queueIndex = 0;
  const previous = new Map<string, string | null>([[stateKey(initial), null]]);
  const states = new Map<string, SearchState>([[stateKey(initial), initial]]);
  let targetKey: string | null = null;

  while (queueIndex < queue.length && targetKey === null) {
    const current = queue[queueIndex];
    queueIndex += 1;

    for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
      const delta = DIRECTIONS[direction];
      const turns = current.direction === -1 || current.direction === direction
        ? current.turns
        : current.turns + 1;
      if (turns > 2) {
        continue;
      }

      const next: SearchState = {
        row: current.row + delta.row,
        col: current.col + delta.col,
        direction,
        turns,
      };
      if (!isWalkable(board, next.row, next.col, start, target)) {
        continue;
      }

      const key = stateKey(next);
      if (previous.has(key)) {
        continue;
      }
      const currentKey = stateKey(current);
      previous.set(key, currentKey);
      states.set(key, next);

      if (next.row === paddedTarget.row && next.col === paddedTarget.col) {
        targetKey = key;
        break;
      }
      queue.push(next);
    }
  }

  if (targetKey === null) {
    return null;
  }

  const reversed: PathPoint[] = [];
  let cursor: string | null = targetKey;
  while (cursor !== null) {
    const state = states.get(cursor);
    if (!state) {
      break;
    }
    reversed.push({ row: state.row - 1, col: state.col - 1 });
    cursor = previous.get(cursor) ?? null;
  }

  return compressPath(reversed.reverse());
}
