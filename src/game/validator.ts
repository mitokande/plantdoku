// Conflict detection for the player's current placements.

import type { Coord } from "./types";

export const cellKey = (r: number, c: number): string => `${r},${c}`;

/**
 * Given the list of currently *placed* markers, return the set of cell keys
 * that violate a rule (same row, same column, same region, or 8-adjacency).
 * Player count is tiny (<= board size) so a pairwise scan is fine.
 */
export function findConflicts(
  placed: Coord[],
  regions: number[][],
): Set<string> {
  const bad = new Set<string>();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [r1, c1] = placed[i];
      const [r2, c2] = placed[j];
      const sameRow = r1 === r2;
      const sameCol = c1 === c2;
      const sameRegion = regions[r1][c1] === regions[r2][c2];
      const adjacent = Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
      if (sameRow || sameCol || sameRegion || adjacent) {
        bad.add(cellKey(r1, c1));
        bad.add(cellKey(r2, c2));
      }
    }
  }
  return bad;
}

/** Solved when every region has exactly one marker and nothing conflicts. */
export function isSolved(
  placedCount: number,
  size: number,
  conflictCount: number,
): boolean {
  return placedCount === size && conflictCount === 0;
}
