// Core types for the Plantdoku puzzle (LinkedIn "Queens" style, plant-themed).

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: Record<
  Difficulty,
  { size: number; label: string }
> = {
  easy: { size: 6, label: "Easy" },
  medium: { size: 8, label: "Medium" },
  hard: { size: 9, label: "Hard" },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

/**
 * Inclusive deduction-tier band each difficulty accepts (see logicSolver SolveTier:
 * 1 = singles only, 2 = +confinement, 3 = +subsets). Combined with grid size this turns
 * difficulty into a real, ordered property instead of size alone, and — since only
 * logic-solvable boards have a tier at all — guarantees every board is solvable without
 * guessing. Bands were tuned against the generator's measured tier yield per size.
 */
export const DIFFICULTY_BANDS: Record<
  Difficulty,
  { minTier: 1 | 2 | 3; maxTier: 1 | 2 | 3 }
> = {
  easy: { minTier: 1, maxTier: 2 }, // 6x6, singles + confinement
  medium: { minTier: 2, maxTier: 3 }, // 8x8, needs confinement, may need subsets
  hard: { minTier: 3, maxTier: 3 }, // 9x9, must need subsets
};

/** Per-cell interaction state. */
export type CellState = "empty" | "marked" | "placed";

export type Coord = [number, number];

export interface Puzzle {
  size: number;
  /** regions[r][c] = region id in 0..size-1 (also indexes plants/colors). */
  regions: number[][];
  /** solution[r] = column of the marker in row r (the unique solution). */
  solution: number[];
  /** plants[regionId] = plant id string (matches a file in assets/plants). */
  plants: string[];
  /** colors[regionId] = hex tint for that region's cells. */
  colors: string[];
  /** The difficulty this board was generated for. */
  difficulty?: Difficulty;
  /** Hardest deduction tier required to solve it by logic (1..3). */
  tier?: 1 | 2 | 3;
}
