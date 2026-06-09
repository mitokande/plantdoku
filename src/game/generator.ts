// Puzzle generator: builds a board with a guaranteed *unique* solution.
//
//   1. Place a valid solution: a permutation (one marker per row & column)
//      with |perm[r] - perm[r+1]| >= 2 so no two markers are diagonally
//      adjacent. This is the only adjacency that can occur given one per
//      row/column, so it fully satisfies the no-touch rule.
//   2. Grow `size` connected regions, each seeded on one solution cell, until
//      every cell is claimed (growth is uniform over the region frontier, so
//      shapes are organic with varied sizes).
//   3. Repair to uniqueness: while another solution exists, move one of its
//      non-owner cells into a neighbouring region. The intended solution only
//      ever sits on region "owner" cells, so it stays valid, while the
//      alternate solution loses its one-per-region property and dies.

import type { Puzzle } from "./types";
import { countSolutions, enumerateSolutions } from "./solver";
import { PLANT_IDS, REGION_COLORS } from "./palette";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A permutation with no two consecutive rows within 1 column of each other. */
function randomSolution(size: number): number[] | null {
  const perm = new Array(size).fill(-1);
  const usedCols = new Array(size).fill(false);

  const rec = (row: number): boolean => {
    if (row === size) return true;
    for (const c of shuffle([...Array(size).keys()])) {
      if (usedCols[c]) continue;
      if (row > 0 && Math.abs(c - perm[row - 1]) < 2) continue;
      perm[row] = c;
      usedCols[c] = true;
      if (rec(row + 1)) return true;
      usedCols[c] = false;
      perm[row] = -1;
    }
    return false;
  };

  return rec(0) ? perm.slice() : null;
}

/** Flood-grow `size` orthogonally-connected regions from the solution cells. */
function growRegions(size: number, solution: number[]): number[][] {
  const regions = Array.from({ length: size }, () => new Array(size).fill(-1));
  const frontier: Set<number>[] = Array.from({ length: size }, () => new Set());
  const idx = (r: number, c: number) => r * size + c;
  const inBounds = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c < size;

  const seedNeighbours = (i: number, r: number, c: number) => {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && regions[nr][nc] === -1) {
        frontier[i].add(idx(nr, nc));
      }
    }
  };

  for (let i = 0; i < size; i++) {
    regions[i][solution[i]] = i;
    seedNeighbours(i, i, solution[i]);
  }

  let remaining = size * size - size;
  while (remaining > 0) {
    // Choose a region weighted by frontier size (uniform over frontier edges).
    const live: number[] = [];
    let totalEdges = 0;
    for (let i = 0; i < size; i++) {
      if (frontier[i].size > 0) {
        live.push(i);
        totalEdges += frontier[i].size;
      }
    }
    if (live.length === 0) break; // grid is connected; shouldn't happen

    let pick = Math.floor(Math.random() * totalEdges);
    let region = live[0];
    for (const i of live) {
      if (pick < frontier[i].size) {
        region = i;
        break;
      }
      pick -= frontier[i].size;
    }

    let chosen = -1;
    for (const cell of shuffle([...frontier[region]])) {
      const r = Math.floor(cell / size);
      const c = cell % size;
      if (regions[r][c] === -1) {
        chosen = cell;
        break;
      }
      frontier[region].delete(cell); // stale: claimed by another region
    }
    if (chosen === -1) continue;

    const r = Math.floor(chosen / size);
    const c = chosen % size;
    regions[r][c] = region;
    remaining--;
    frontier[region].delete(chosen);
    seedNeighbours(region, r, c);
  }

  return regions;
}

const eqSolution = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

/** True if region `rid` stays connected after removing cell index `exclude`. */
function connectedWithout(
  regions: number[][],
  size: number,
  rid: number,
  exclude: number,
): boolean {
  const cells: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (regions[r][c] === rid && i !== exclude) cells.push(i);
    }
  }
  if (cells.length === 0) return false;
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const cell = stack.pop()!;
    const r = Math.floor(cell / size);
    const c = cell % size;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const n = nr * size + nc;
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === cells.length;
}

/** Reshape regions in place until the solution is unique. Returns success. */
function makeUnique(
  regions: number[][],
  size: number,
  solution: number[],
): boolean {
  for (let iter = 0; iter < 500; iter++) {
    const sols = enumerateSolutions(regions, size, 2);
    if (sols.length <= 1) return true; // only the intended solution remains
    // The two distinct solutions can't both equal `solution`, so this finds an
    // alternate placement to eliminate.
    const other = sols.find((s) => !eqSolution(s, solution)) ?? sols[0];

    let moved = false;
    for (const r of shuffle([...Array(size).keys()])) {
      if (other[r] === solution[r]) continue; // owner cell — never move it
      const c = other[r];
      const rid = regions[r][c];
      if (!connectedWithout(regions, size, rid, r * size + c)) continue;

      const neighbourRegions: number[] = [];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (regions[nr][nc] !== rid) neighbourRegions.push(regions[nr][nc]);
      }
      if (neighbourRegions.length === 0) continue;

      regions[r][c] =
        neighbourRegions[Math.floor(Math.random() * neighbourRegions.length)];
      moved = true;
      break;
    }
    if (!moved) return false; // stuck — caller regenerates from scratch
  }
  return countSolutions(regions, size, 2) === 1;
}

export function generatePuzzle(size: number): Puzzle {
  for (let attempt = 0; attempt < 400; attempt++) {
    const solution = randomSolution(size);
    if (!solution) continue;
    const regions = growRegions(size, solution);
    if (makeUnique(regions, size, solution) &&
        countSolutions(regions, size, 2) === 1) {
      return {
        size,
        regions,
        solution,
        plants: shuffle(PLANT_IDS).slice(0, size),
        colors: shuffle(REGION_COLORS).slice(0, size),
      };
    }
  }
  throw new Error(`Could not generate a unique puzzle for size ${size}`);
}
