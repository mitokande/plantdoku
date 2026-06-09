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
}
