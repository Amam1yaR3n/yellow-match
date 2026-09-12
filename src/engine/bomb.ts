import { isCharacterCell, type BoardMatrix, type CharacterId, type Coord } from "../types";

export interface BombSelection {
  footprint: Coord[];
  primary: Coord[];
  extra: Coord[];
  removed: Coord[];
  pairs: { first: Coord; second: Coord }[];
}

const CROSS_OFFSETS = [[0, 0], [-1, 0], [0, 1], [1, 0], [0, -1]] as const;
const coordKey = ({ row, col }: Coord): string => `${row},${col}`;

/** 只读取盘面；命中与视觉配对使用同一份结果，补消不会继续扩散。 */
export function selectBombTiles(board: BoardMatrix, center: Coord): BombSelection | null {
  if (!Number.isInteger(center.row) || !Number.isInteger(center.col)
    || center.row < 0 || center.row >= board.length
    || center.col < 0 || center.col >= board[center.row].length) return null;

  const footprint = CROSS_OFFSETS.map(([row, col]) => ({ row: center.row + row, col: center.col + col }))
    .filter(({ row, col }) => row >= 0 && row < board.length && col >= 0 && col < board[row].length);
  const primary = footprint.filter(({ row, col }) => isCharacterCell(board[row][col]));
  const hits = new Map<CharacterId, Coord[]>();
  for (const coord of primary) {
    const id = board[coord.row][coord.col];
    if (!isCharacterCell(id)) continue;
    const positions = hits.get(id) ?? [];
    positions.push(coord);
    hits.set(id, positions);
  }
  const selected = new Set(primary.map(coordKey));
  const extra: Coord[] = [];
  for (const [id, positions] of hits) {
    if (positions.length % 2 === 0) continue;
    let nearest: Coord | null = null;
    let shortest = Infinity;
    // 行列顺序遍历，只替换严格更近的候选，保证距离相同的选择稳定。
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        if (board[row][col] !== id || selected.has(coordKey({ row, col }))) continue;
        const distance = Math.min(...positions.map((hit) => Math.abs(hit.row - row) + Math.abs(hit.col - col)));
        if (distance < shortest) {
          shortest = distance;
          nearest = { row, col };
        }
      }
    }
    // 盘面成对时必然存在补配；异常盘面不允许部分引爆或扣除库存。
    if (!nearest) return null;
    extra.push(nearest);
    selected.add(coordKey(nearest));
  }
  const removed = [...primary, ...extra];
  const positionsByCharacter = new Map<CharacterId, Coord[]>();
  for (const coord of removed) {
    const id = board[coord.row][coord.col];
    if (!isCharacterCell(id)) continue;
    const positions = positionsByCharacter.get(id) ?? [];
    positions.push(coord);
    positionsByCharacter.set(id, positions);
  }
  const pairs: BombSelection["pairs"] = [];
  for (const positions of positionsByCharacter.values()) {
    positions.sort((a, b) => a.row - b.row || a.col - b.col);
    for (let index = 0; index < positions.length; index += 2) {
      pairs.push({ first: positions[index], second: positions[index + 1] });
    }
  }
  return { footprint, primary, extra, removed, pairs };
}
