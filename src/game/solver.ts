// Backtracking solver for the Plantdoku constraints.
//
// Constraints for a valid placement (one marker per row):
//   * one marker per column        -> usedCols
//   * one marker per region         -> usedRegions
//   * no two markers adjacent (8-dir). With one marker per row & column the
//     only way two markers can touch is diagonally between *consecutive* rows,
//     i.e. |col(r) - col(r-1)| === 1. So we forbid |c - prevCol| < 2.

export function countSolutions(
  regions: number[][],
  size: number,
  limit = Infinity,
): number {
  const usedCols = new Array(size).fill(false);
  const usedRegions = new Array(size).fill(false);
  let count = 0;

  const rec = (row: number, prevCol: number): void => {
    if (count >= limit) return;
    if (row === size) {
      count++;
      return;
    }
    for (let c = 0; c < size; c++) {
      if (usedCols[c]) continue;
      if (row > 0 && Math.abs(c - prevCol) < 2) continue;
      const rg = regions[row][c];
      if (usedRegions[rg]) continue;
      usedCols[c] = true;
      usedRegions[rg] = true;
      rec(row + 1, c);
      usedCols[c] = false;
      usedRegions[rg] = false;
      if (count >= limit) return;
    }
  };

  rec(0, -2);
  return count;
}

/** Enumerate up to `limit` distinct solutions (each as column-per-row). */
export function enumerateSolutions(
  regions: number[][],
  size: number,
  limit: number,
): number[][] {
  const usedCols = new Array(size).fill(false);
  const usedRegions = new Array(size).fill(false);
  const sol = new Array(size).fill(-1);
  const out: number[][] = [];

  const rec = (row: number, prevCol: number): void => {
    if (out.length >= limit) return;
    if (row === size) {
      out.push(sol.slice());
      return;
    }
    for (let c = 0; c < size; c++) {
      if (usedCols[c]) continue;
      if (row > 0 && Math.abs(c - prevCol) < 2) continue;
      const rg = regions[row][c];
      if (usedRegions[rg]) continue;
      usedCols[c] = true;
      usedRegions[rg] = true;
      sol[row] = c;
      rec(row + 1, c);
      usedCols[c] = false;
      usedRegions[rg] = false;
      if (out.length >= limit) return;
    }
  };

  rec(0, -2);
  return out;
}

/** Return the column-per-row solution, or null if unsolvable. */
export function findSolution(
  regions: number[][],
  size: number,
): number[] | null {
  const usedCols = new Array(size).fill(false);
  const usedRegions = new Array(size).fill(false);
  const sol = new Array(size).fill(-1);

  const rec = (row: number, prevCol: number): boolean => {
    if (row === size) return true;
    for (let c = 0; c < size; c++) {
      if (usedCols[c]) continue;
      if (row > 0 && Math.abs(c - prevCol) < 2) continue;
      const rg = regions[row][c];
      if (usedRegions[rg]) continue;
      usedCols[c] = true;
      usedRegions[rg] = true;
      sol[row] = c;
      if (rec(row + 1, c)) return true;
      usedCols[c] = false;
      usedRegions[rg] = false;
      sol[row] = -1;
    }
    return false;
  };

  return rec(0, -2) ? sol.slice() : null;
}
