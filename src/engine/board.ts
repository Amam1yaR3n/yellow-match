import { findPath } from "./pathfinding";
import { MAX_BOSS_OBSTACLES, DOUBAO_OBSTACLE, isCharacterCell, CHARACTER_IDS, type BoardConfig, type BoardMatrix, type CharacterId, type Coord, type PathPoint } from "../types";

export const BOARD_STAGES: readonly BoardConfig[] = [
  { size: 7, characterCount: 9 },
  { size: 8, characterCount: 12 },
  { size: 9, characterCount: 15 },
  { size: 10, characterCount: 17 },
];

const SHUFFLE_BUDGET_MS = 150;
const INITIAL_GENERATION_BUDGET_MS = 260;
const CSP_NODE_LIMIT = 60_000;
const PLACEHOLDER_ID = CHARACTER_IDS[0];

export interface GeneratedBoard {
  board: BoardMatrix;
  config: BoardConfig;
}

export interface AvailablePair {
  first: Coord;
  second: Coord;
  path: PathPoint[];
}

interface SolutionSlot {
  first: Coord;
  second: Coord;
}

interface CandidatePair extends SolutionSlot {
  path: PathPoint[];
  distance: number;
}

interface AssignmentOptions {
  allowedShortSlotCount?: number;
  distinctOpeningCount?: number;
  openingBoard?: BoardMatrix;
}

function shuffleArray<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createFullBoard(size: number): BoardMatrix {
  const board = Array.from(
    { length: size },
    () => Array<CharacterId | null>(size).fill(PLACEHOLDER_ID),
  );
  if (size % 2 !== 0) board[Math.floor(size / 2)][Math.floor(size / 2)] = null;
  return board;
}

function sameCoord(first: Coord, second: Coord): boolean {
  return first.row === second.row && first.col === second.col;
}

function manhattanDistance(a: Coord, b: Coord): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function occupiedCoords(board: BoardMatrix): Coord[] {
  const coords: Coord[] = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (isCharacterCell(board[row][col])) {
        coords.push({ row, col });
      }
    }
  }
  return coords;
}

function occupancyBoard(board: BoardMatrix): BoardMatrix {
  return board.map((row) => row.map((cell) => isCharacterCell(cell) ? PLACEHOLDER_ID : cell));
}

function pathTurns(path: readonly PathPoint[]): number {
  return Math.max(0, path.length - 2);
}

function collectCandidates(
  board: BoardMatrix,
  minimumDistance: number,
  deadline: number | null,
  maxCandidates: number,
  blockedOnBoard: BoardMatrix | null = null,
): CandidatePair[] {
  const coords = shuffleArray(occupiedCoords(board));
  const candidates: CandidatePair[] = [];
  let inspected = 0;

  for (let firstIndex = 0; firstIndex < coords.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < coords.length; secondIndex += 1) {
      inspected += 1;
      if (deadline !== null && inspected % 48 === 0 && performance.now() >= deadline) {
        return candidates;
      }
      const first = coords[firstIndex];
      const second = coords[secondIndex];
      const distance = manhattanDistance(first, second);
      if (distance < minimumDistance) {
        continue;
      }
      const path = findPath(board, first, second);
      if (!path) {
        continue;
      }
      if (blockedOnBoard && findPath(blockedOnBoard, first, second)) {
        continue;
      }
      candidates.push({ first, second, path, distance });
      if (candidates.length >= maxCandidates) {
        return candidates;
      }
    }
  }
  return candidates;
}

function chooseCandidate(candidates: readonly CandidatePair[]): CandidatePair {
  const scored = [...candidates].sort((a, b) => {
    const scoreA = pathTurns(a.path) * 40 + a.distance;
    const scoreB = pathTurns(b.path) * 40 + b.distance;
    return scoreB - scoreA;
  });
  return scored[Math.floor(Math.random() * Math.min(8, scored.length))];
}

function slotCoords(slot: SolutionSlot): readonly Coord[] {
  return [slot.first, slot.second];
}

function slotsOverlap(first: SolutionSlot, second: SolutionSlot): boolean {
  return slotCoords(first).some((firstCoord) => (
    slotCoords(second).some((secondCoord) => sameCoord(firstCoord, secondCoord))
  ));
}

function allAdjacentSlots(board: BoardMatrix): SolutionSlot[] {
  const size = board.length;
  const slots: SolutionSlot[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isCharacterCell(board[row][col])) continue;
      if (col + 1 < size && isCharacterCell(board[row][col + 1])) {
        slots.push({ first: { row, col }, second: { row, col: col + 1 } });
      }
      if (row + 1 < size && isCharacterCell(board[row + 1][col])) {
        slots.push({ first: { row, col }, second: { row: row + 1, col } });
      }
    }
  }
  return slots;
}

function chooseRandomOpeningSlots(fullBoard: BoardMatrix): SolutionSlot[] | null {
  const adjacentCandidates = shuffleArray(allAdjacentSlots(fullBoard));
  let adjacentEntries: SolutionSlot[] | null = null;

  for (const first of adjacentCandidates) {
    const second = adjacentCandidates.find((candidate) => (
      !slotsOverlap(first, candidate) && !slotsConflict(first, candidate, 2)
    ));
    if (second) {
      adjacentEntries = [first, second];
      break;
    }
  }
  if (!adjacentEntries) {
    return null;
  }

  const distantCandidates = shuffleArray(collectCandidates(fullBoard, 3, null, 400));
  const openings = [...adjacentEntries];
  for (const candidate of distantCandidates) {
    if (openings.some((opening) => slotsOverlap(opening, candidate))) {
      continue;
    }
    openings.push({ first: candidate.first, second: candidate.second });
    if (openings.length === 5) {
      return openings;
    }
  }
  return null;
}

function removeSlots(board: BoardMatrix, slots: readonly SolutionSlot[]): void {
  slots.forEach((slot) => {
    board[slot.first.row][slot.first.col] = null;
    board[slot.second.row][slot.second.col] = null;
  });
}

function tryBuildPeelContinuation(
  sourceBoard: BoardMatrix,
  minimumDistance: number,
  deadline: number,
  blockedOnBoard: BoardMatrix | null,
): SolutionSlot[] | null {
  const work = occupancyBoard(sourceBoard);
  const slots: SolutionSlot[] = [];

  while (occupiedCoords(work).length > 0) {
    const candidates = collectCandidates(work, minimumDistance, deadline, 48, blockedOnBoard);
    if (candidates.length === 0 || performance.now() >= deadline) {
      return null;
    }
    const chosen = chooseCandidate(candidates);
    slots.push({ first: chosen.first, second: chosen.second });
    removeSlots(work, [chosen]);
  }
  return slots;
}

function tryBuildPeelSolution(
  sourceBoard: BoardMatrix,
  minimumDistance: number,
  deadline: number,
): SolutionSlot[] | null {
  while (performance.now() < deadline) {
    const work = occupancyBoard(sourceBoard);
    const slots: SolutionSlot[] = [];
    let failed = false;

    while (occupiedCoords(work).length > 0) {
      const candidates = collectCandidates(work, minimumDistance, deadline, 36);
      if (candidates.length === 0 || performance.now() >= deadline) {
        failed = true;
        break;
      }
      const chosen = chooseCandidate(candidates);
      slots.push({ first: chosen.first, second: chosen.second });
      work[chosen.first.row][chosen.first.col] = null;
      work[chosen.second.row][chosen.second.col] = null;
    }

    if (!failed) {
      return slots;
    }
  }
  return null;
}

function buildGuaranteedPeelSolution(
  sourceBoard: BoardMatrix,
  preferredDistance: number,
  blockedOnBoard: BoardMatrix | null = null,
): SolutionSlot[] {
  const work = occupancyBoard(sourceBoard);
  const slots: SolutionSlot[] = [];
  let activeDistance = preferredDistance;
  let activeBlockedBoard = blockedOnBoard;

  while (occupiedCoords(work).length > 0) {
    let candidates = collectCandidates(work, activeDistance, null, 80, activeBlockedBoard);
    while (candidates.length === 0 && activeDistance > 1) {
      activeDistance -= 1;
      candidates = collectCandidates(work, activeDistance, null, 80, activeBlockedBoard);
    }
    if (candidates.length === 0 && activeBlockedBoard) {
      activeBlockedBoard = null;
      activeDistance = preferredDistance;
      continue;
    }
    if (candidates.length === 0) {
      const remaining = occupiedCoords(work);
      const first = remaining[0];
      const second = remaining[1];
      slots.push({ first, second });
      work[first.row][first.col] = null;
      work[second.row][second.col] = null;
      continue;
    }
    const chosen = chooseCandidate(candidates);
    slots.push({ first: chosen.first, second: chosen.second });
    work[chosen.first.row][chosen.first.col] = null;
    work[chosen.second.row][chosen.second.col] = null;
  }
  return slots;
}

function pairCounts(board: BoardMatrix): Map<CharacterId, number> {
  const copies = new Map<CharacterId, number>();
  board.flat().forEach((characterId) => {
    if (isCharacterCell(characterId)) {
      copies.set(characterId, (copies.get(characterId) ?? 0) + 1);
    }
  });
  return new Map([...copies.entries()].map(([id, count]) => [id, count / 2]));
}

function slotsConflict(first: SolutionSlot, second: SolutionSlot, minimumDistance: number): boolean {
  return [first.first, first.second].some((firstCoord) => (
    [second.first, second.second].some((secondCoord) => (
      manhattanDistance(firstCoord, secondCoord) < minimumDistance
    ))
  ));
}

function slotsConnectAcrossBoard(
  first: SolutionSlot,
  second: SolutionSlot,
  board: BoardMatrix,
): boolean {
  return slotCoords(first).some((firstCoord) => (
    slotCoords(second).some((secondCoord) => Boolean(findPath(board, firstCoord, secondCoord)))
  ));
}

function assignCharacters(
  slots: readonly SolutionSlot[],
  counts: ReadonlyMap<CharacterId, number>,
  minimumDistance: number,
  deadline: number,
  options: AssignmentOptions = {},
): CharacterId[] | null {
  const allowedShortSlotCount = options.allowedShortSlotCount ?? 0;
  if (slots.some((slot, index) => (
    index >= allowedShortSlotCount
    && manhattanDistance(slot.first, slot.second) < minimumDistance
  ))) {
    return null;
  }

  const ids = shuffleArray([...counts.keys()]);
  const remaining = new Map(ids.map((id) => [id, counts.get(id) ?? 0]));
  const members = new Map(ids.map((id) => [id, [] as number[]]));
  const assignments = Array<CharacterId | null>(slots.length).fill(null);
  const conflicts = slots.map(() => Array<boolean>(slots.length).fill(false));
  const guaranteedOpeningCount = Math.min(options.distinctOpeningCount ?? 3, slots.length);

  for (let firstIndex = 0; firstIndex < slots.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < slots.length; secondIndex += 1) {
      const conflict = slotsConflict(slots[firstIndex], slots[secondIndex], minimumDistance)
        || (firstIndex < guaranteedOpeningCount && secondIndex < guaranteedOpeningCount)
        || Boolean(
          options.openingBoard
          && slotsConnectAcrossBoard(slots[firstIndex], slots[secondIndex], options.openingBoard),
        );
      conflicts[firstIndex][secondIndex] = conflict;
      conflicts[secondIndex][firstIndex] = conflict;
    }
  }

  const order = slots.map((_, index) => index).sort((a, b) => {
    const degreeA = conflicts[a].filter(Boolean).length;
    const degreeB = conflicts[b].filter(Boolean).length;
    return degreeB - degreeA;
  });
  let nodes = 0;

  const search = (position: number): boolean => {
    nodes += 1;
    if (nodes >= CSP_NODE_LIMIT || (nodes % 128 === 0 && performance.now() >= deadline)) {
      return false;
    }
    if (position >= order.length) {
      return true;
    }

    const slotIndex = order[position];
    const equivalentUnusedCapacities = new Set<number>();
    const candidates = shuffleArray(ids).filter((id) => {
      const capacity = remaining.get(id) ?? 0;
      if (capacity <= 0) {
        return false;
      }
      const assignedSlots = members.get(id) ?? [];
      if (assignedSlots.some((otherIndex) => conflicts[slotIndex][otherIndex])) {
        return false;
      }
      if (assignedSlots.length === 0) {
        if (equivalentUnusedCapacities.has(capacity)) {
          return false;
        }
        equivalentUnusedCapacities.add(capacity);
      }
      return true;
    }).sort((a, b) => (members.get(b)?.length ?? 0) - (members.get(a)?.length ?? 0));

    for (const id of candidates) {
      assignments[slotIndex] = id;
      remaining.set(id, (remaining.get(id) ?? 0) - 1);
      members.get(id)?.push(slotIndex);
      if (search(position + 1)) {
        return true;
      }
      members.get(id)?.pop();
      remaining.set(id, (remaining.get(id) ?? 0) + 1);
      assignments[slotIndex] = null;
    }
    return false;
  };

  return search(0) ? assignments as CharacterId[] : null;
}

function simpleSlotAssignment(
  slots: readonly SolutionSlot[],
  counts: ReadonlyMap<CharacterId, number>,
  distinctOpeningCount = 3,
): CharacterId[] {
  const pairIds = shuffleArray([...counts.entries()].flatMap(([id, count]) => Array<CharacterId>(count).fill(id)));
  const usedOpeningIds = new Set<CharacterId>();
  for (let index = 0; index < Math.min(distinctOpeningCount, slots.length); index += 1) {
    if (usedOpeningIds.has(pairIds[index])) {
      const swapIndex = pairIds.findIndex((id, candidateIndex) => (
        candidateIndex > index && !usedOpeningIds.has(id)
      ));
      if (swapIndex > index) {
        [pairIds[index], pairIds[swapIndex]] = [pairIds[swapIndex], pairIds[index]];
      }
    }
    usedOpeningIds.add(pairIds[index]);
  }
  return pairIds;
}

function boardFromSlots(sourceBoard: BoardMatrix, slots: readonly SolutionSlot[], assignments: readonly CharacterId[]): BoardMatrix {
  const board: BoardMatrix = sourceBoard.map((row) => row.map((cell) => cell === DOUBAO_OBSTACLE ? cell : null));
  slots.forEach((slot, index) => {
    board[slot.first.row][slot.first.col] = assignments[index];
    board[slot.second.row][slot.second.col] = assignments[index];
  });
  return board;
}

function initialPairCounts(config: BoardConfig): Map<CharacterId, number> {
  const ids = shuffleArray(CHARACTER_IDS).slice(0, config.characterCount);
  const totalPairs = Math.floor(config.size * config.size / 2);
  const minimum = Math.floor(totalPairs / ids.length);
  const extra = totalPairs % ids.length;
  return new Map(ids.map((id, index) => [id, minimum + (index < extra ? 1 : 0)]));
}

function tryBuildRandomInitialBoard(size: number, counts: ReadonlyMap<CharacterId, number>): BoardMatrix | null {
  const deadline = performance.now() + INITIAL_GENERATION_BUDGET_MS;
  const fullBoard = createFullBoard(size);

  while (performance.now() < deadline - 24) {
    const openings = chooseRandomOpeningSlots(fullBoard);
    if (!openings) {
      continue;
    }

    const work = occupancyBoard(fullBoard);
    removeSlots(work, openings);
    const skeletonDeadline = Math.min(deadline - 18, performance.now() + 72);
    const continuation = tryBuildPeelContinuation(work, 3, skeletonDeadline, fullBoard);
    if (!continuation) {
      continue;
    }

    const slots = [...openings, ...continuation];
    const assignment = assignCharacters(slots, counts, 3, deadline, {
      allowedShortSlotCount: 2,
      distinctOpeningCount: 5,
      openingBoard: fullBoard,
    });
    if (assignment) {
      return boardFromSlots(fullBoard, slots, assignment);
    }
  }
  return null;
}

function buildRandomInitialFallback(size: number, counts: ReadonlyMap<CharacterId, number>): BoardMatrix {
  const fullBoard = createFullBoard(size);
  const openings = chooseRandomOpeningSlots(fullBoard) ?? [{ first: { row: 0, col: 0 }, second: { row: 0, col: 1 } }];
  const work = occupancyBoard(fullBoard);
  removeSlots(work, openings);
  const continuation = buildGuaranteedPeelSolution(work, 3, fullBoard);
  const slots = [...openings, ...continuation];

  for (let relaxedDistance = 3; relaxedDistance >= 1; relaxedDistance -= 1) {
    const assignment = assignCharacters(
      slots,
      counts,
      relaxedDistance,
      performance.now() + 100,
      {
        allowedShortSlotCount: 2,
        distinctOpeningCount: Math.min(5, openings.length),
        openingBoard: fullBoard,
      },
    );
    if (assignment) {
      return boardFromSlots(fullBoard, slots, assignment);
    }
  }
  return boardFromSlots(fullBoard, slots, simpleSlotAssignment(slots, counts, Math.min(5, openings.length)));
}

export function generateBoard(config: BoardConfig): GeneratedBoard {
  const counts = initialPairCounts(config);
  return {
    board: tryBuildRandomInitialBoard(config.size, counts) ?? buildRandomInitialFallback(config.size, counts),
    config,
  };
}

export function findAvailablePair(board: BoardMatrix): AvailablePair | null {
  const positionsByCharacter = new Map<CharacterId, Coord[]>();
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const characterId = board[row][col];
      if (isCharacterCell(characterId)) {
        const positions = positionsByCharacter.get(characterId) ?? [];
        positions.push({ row, col });
        positionsByCharacter.set(characterId, positions);
      }
    }
  }

  for (const positions of positionsByCharacter.values()) {
    for (let firstIndex = 0; firstIndex < positions.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
        const path = findPath(board, positions[firstIndex], positions[secondIndex]);
        if (path) {
          return { first: positions[firstIndex], second: positions[secondIndex], path };
        }
      }
    }
  }
  return null;
}

/** 对全部合法坐标配对做蓄水池抽样，使每一对被选中的概率相同。 */
export function findRandomAvailablePair(board: BoardMatrix, random = Math.random): AvailablePair | null {
  const positionsByCharacter = new Map<CharacterId, Coord[]>();
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const characterId = board[row][col];
      if (!isCharacterCell(characterId)) continue;
      const positions = positionsByCharacter.get(characterId) ?? [];
      positions.push({ row, col });
      positionsByCharacter.set(characterId, positions);
    }
  }

  let selected: AvailablePair | null = null;
  let candidateCount = 0;
  for (const positions of positionsByCharacter.values()) {
    for (let firstIndex = 0; firstIndex < positions.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
        const path = findPath(board, positions[firstIndex], positions[secondIndex]);
        if (!path) continue;
        candidateCount += 1;
        if (random() < 1 / candidateCount) {
          selected = { first: positions[firstIndex], second: positions[secondIndex], path };
        }
      }
    }
  }
  return selected;
}

export function shuffleRemaining(board: BoardMatrix): BoardMatrix {
  if (board.some((row) => row.includes(DOUBAO_OBSTACLE))) return shuffleWithObstacles(board);
  const tileCount = occupiedCoords(board).length;
  const minimumDistance = tileCount >= 20 ? 3 : tileCount >= 10 ? 2 : 1;
  const deadline = performance.now() + SHUFFLE_BUDGET_MS;
  const counts = pairCounts(board);
  const constrainedSlots = tryBuildPeelSolution(board, minimumDistance, deadline);

  if (constrainedSlots) {
    const assignment = assignCharacters(constrainedSlots, counts, minimumDistance, deadline);
    if (assignment) {
      return boardFromSlots(board, constrainedSlots, assignment);
    }
  }

  const fallbackSlots = buildGuaranteedPeelSolution(board, minimumDistance);
  for (let relaxedDistance = minimumDistance; relaxedDistance >= 1; relaxedDistance -= 1) {
    const assignment = assignCharacters(
      fallbackSlots,
      counts,
      relaxedDistance,
      performance.now() + 80,
    );
    if (assignment) {
      return boardFromSlots(board, fallbackSlots, assignment);
    }
  }

  return boardFromSlots(board, fallbackSlots, simpleSlotAssignment(fallbackSlots, counts));
}

export function remainingTileCount(board: BoardMatrix): number {
  return board.reduce((total, row) => total + row.filter(isCharacterCell).length, 0);
}

/** 固定障碍下的相邻格最大匹配，为调整普通棋子占位提供确定的可消布局。 */
function adjacentLayout(board: BoardMatrix): SolutionSlot[] {
  const size = board.length;
  const matches = new Map<number, number>();
  const visit = (index: number, seen: Set<number>): boolean => {
    const row = Math.floor(index / size), col = index % size;
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const r = row + dr, c = col + dc;
      if (r < 0 || c < 0 || r >= size || c >= size || board[r][c] === DOUBAO_OBSTACLE) continue;
      const next = r * size + c;
      if (seen.has(next)) continue;
      seen.add(next);
      const previous = matches.get(next);
      if (previous === undefined || visit(previous, seen)) { matches.set(next, index); return true; }
    }
    return false;
  };
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    if ((row + col) % 2 === 0 && board[row][col] !== DOUBAO_OBSTACLE) visit(row * size + col, new Set());
  }
  return [...matches].map(([a, b]) => ({ first: { row: Math.floor(a / size), col: a % size }, second: { row: Math.floor(b / size), col: b % size } }));
}

function shuffleWithObstacles(board: BoardMatrix): BoardMatrix {
  const counts = pairCounts(board);
  const sameSlots = tryBuildPeelSolution(board, 1, performance.now() + SHUFFLE_BUDGET_MS);
  const slots = sameSlots ?? shuffleArray(adjacentLayout(board)).slice(0, remainingTileCount(board) / 2);
  if (slots.length * 2 !== remainingTileCount(board)) throw new Error("固定障碍下棋盘空间不足");
  return boardFromSlots(board, slots, simpleSlotAssignment(slots, counts));
}

/** 投放只增加障碍：先证明当前角色可依序清空，再确认未来洗牌有固定障碍布局。 */
export function placeBossObstacles(board: BoardMatrix, random = Math.random): BoardMatrix {
  const result = board.map((row) => [...row]);
  const existing = result.flat().filter((cell) => cell === DOUBAO_OBSTACLE).length;
  const candidates: Coord[] = [];
  for (let row = 0; row < result.length; row++) for (let col = 0; col < result.length; col++) {
    if (result[row][col] === null) candidates.push({ row, col });
  }
  let needed = MAX_BOSS_OBSTACLES - existing;
  while (needed > 0 && candidates.length) {
    const [coord] = candidates.splice(Math.floor(random() * candidates.length), 1);
    result[coord.row][coord.col] = DOUBAO_OBSTACLE;
    const work = result.map((row) => [...row]);
    let pair: AvailablePair | null;
    while ((pair = findAvailablePair(work))) {
      work[pair.first.row][pair.first.col] = null;
      work[pair.second.row][pair.second.col] = null;
    }
    if (remainingTileCount(work) === 0 && adjacentLayout(result).length * 2 >= remainingTileCount(result)) needed--;
    else result[coord.row][coord.col] = null;
  }
  return result;
}
