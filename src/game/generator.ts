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

import {
  DIFFICULTIES,
  DIFFICULTY_BANDS,
  type Difficulty,
  type Puzzle,
} from "./types";
import { countSolutions, enumerateSolutions } from "./solver";
import { rateBoard } from "./logicSolver";
import { PLANT_IDS, REGION_COLORS } from "./palette";

/**
 * All generator randomness flows through `rand` so `generatePuzzle` can swap in
 * a seeded PRNG: same seed (and code version) → byte-identical puzzle,
 * including colours and plant skins. Defaults to Math.random when unseeded.
 */
let rand: () => number = Math.random;

/** Small, fast, cross-platform-deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
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

/**
 * Flood-grow `size` orthogonally-connected regions from the solution cells.
 * Regions in `frozen` never grow past their seed cell, yielding singleton
 * clusters (an obvious free placement — used to soften easy boards).
 */
function growRegions(
  size: number,
  solution: number[],
  frozen: ReadonlySet<number> = new Set(),
): number[][] {
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
      if (!frozen.has(i) && frontier[i].size > 0) {
        live.push(i);
        totalEdges += frontier[i].size;
      }
    }
    if (live.length === 0) break; // grid is connected; shouldn't happen

    let pick = Math.floor(rand() * totalEdges);
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

/**
 * Reshape regions in place until the solution is unique. Returns success.
 * Regions in `protect` never receive cells, so frozen singletons stay size 1
 * (they can never *lose* their only cell: it is their solution-owner cell,
 * which the repair below never relocates).
 */
function makeUnique(
  regions: number[][],
  size: number,
  solution: number[],
  protect: ReadonlySet<number> = new Set(),
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
        const nid = regions[nr][nc];
        if (nid !== rid && !protect.has(nid)) neighbourRegions.push(nid);
      }
      if (neighbourRegions.length === 0) continue;

      regions[r][c] =
        neighbourRegions[Math.floor(rand() * neighbourRegions.length)];
      moved = true;
      break;
    }
    if (!moved) return false; // stuck — caller regenerates from scratch
  }
  return countSolutions(regions, size, 2) === 1;
}

/**
 * Build one board with a guaranteed *unique* solution (solution + connected regions, repaired
 * to uniqueness). Returns null if this attempt got stuck. This is the raw, un-graded board;
 * `generatePuzzle` layers a logic-solvability + difficulty gate on top. Exposed for tests.
 *
 * `singletons` (default 0) forces that many clusters to stay at exactly 1 cell —
 * an obvious "the plant must go here" foothold used to soften easy boards.
 */
export function generateUniqueBoard(
  size: number,
  singletons = 0,
): { regions: number[][]; solution: number[] } | null {
  const solution = randomSolution(size);
  if (!solution) return null;
  const frozen = new Set<number>();
  while (frozen.size < singletons) {
    frozen.add(Math.floor(rand() * size));
  }
  const regions = growRegions(size, solution, frozen);
  if (regions.some((row) => row.includes(-1))) return null; // growth starved
  if (!makeUnique(regions, size, solution, frozen)) return null;
  if (countSolutions(regions, size, 2) !== 1) return null;
  for (const rid of frozen) {
    // Guaranteed by construction; cheap belt-and-braces for the contract.
    let count = 0;
    for (const row of regions) for (const id of row) if (id === rid) count++;
    if (count !== 1) return null;
  }
  return { regions, solution };
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** Perceptual-ish colour distance ("redmean" weighted RGB). */
function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db,
  );
}

/**
 * Assign palette colours so *touching* clusters are maximally distinguishable:
 * most-bordered regions are coloured first, each taking the free colour whose
 * minimum distance to its already-coloured neighbours is largest. A random
 * shuffle keeps boards varied; non-adjacent regions may still get similar
 * colours, which is harmless.
 */
function assignRegionColors(regions: number[][], size: number): string[] {
  const adj: Set<number>[] = Array.from({ length: size }, () => new Set());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const a = regions[r][c];
      for (const [rr, cc] of [
        [r + 1, c],
        [r, c + 1],
      ]) {
        if (rr >= size || cc >= size) continue;
        const b = regions[rr][cc];
        if (b !== a) {
          adj[a].add(b);
          adj[b].add(a);
        }
      }
    }
  }

  const pool = shuffle(REGION_COLORS);
  const order = [...Array(size).keys()].sort(
    (x, y) => adj[y].size - adj[x].size,
  );
  const colors = new Array<string>(size);
  const used = new Set<number>();
  for (const region of order) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      let score = Number.MAX_VALUE; // no coloured neighbours yet → any free colour
      for (const n of adj[region]) {
        if (colors[n] !== undefined) {
          score = Math.min(score, colorDistance(pool[i], colors[n]));
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    used.add(bestIdx);
    colors[region] = pool[bestIdx];
  }
  return colors;
}

function assemble(
  size: number,
  regions: number[][],
  solution: number[],
  difficulty: Difficulty,
  tier: 1 | 2 | 3,
): Puzzle {
  return {
    size,
    regions,
    solution,
    plants: shuffle(PLANT_IDS).slice(0, size),
    colors: assignRegionColors(regions, size),
    difficulty,
    tier,
  };
}

/**
 * Generate a board for the given difficulty. Every returned board is solvable by pure logic
 * (no guessing) — a strictly stronger guarantee than the old "unique solution" — and, when
 * possible, sits in the difficulty's deduction-tier band. If the exact band can't be hit within
 * the attempt budget, falls back to the solvable board whose tier is closest to the band, so it
 * never throws on a transient miss and never ships a guess-required board.
 *
 * With a `seed`, generation is fully deterministic (used by the level table in levels.ts).
 */
export function generatePuzzle(difficulty: Difficulty, seed?: number): Puzzle {
  if (seed != null) {
    rand = mulberry32(seed);
    try {
      return generatePuzzle(difficulty);
    } finally {
      rand = Math.random;
    }
  }
  const size = DIFFICULTIES[difficulty].size;
  const { minTier, maxTier } = DIFFICULTY_BANDS[difficulty];
  const maxAttempts = size >= 9 ? 1500 : 600;
  // Easy boards always include a 1-cell cluster: a free, obvious first plant.
  const singletons = difficulty === "easy" ? 1 : 0;

  let fallback: { puzzle: Puzzle; distance: number } | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const board = generateUniqueBoard(size, singletons);
    if (!board) continue;
    const { regions, solution } = board;

    // Truth-guarded rating: reject anything that needs guessing or that tripped the soundness
    // audit (a rule wrongly eliminating the true cell). Either way the board never ships.
    const rating = rateBoard(regions, size, solution);
    if (!rating.solved || rating.unsound || rating.tier == null) continue;
    const tier = rating.tier;

    if (tier >= minTier && tier <= maxTier)
      return assemble(size, regions, solution, difficulty, tier);

    const distance = tier < minTier ? minTier - tier : tier - maxTier;
    if (!fallback || distance < fallback.distance)
      fallback = {
        puzzle: assemble(size, regions, solution, difficulty, tier),
        distance,
      };
  }

  if (fallback) return fallback.puzzle; // solvable, off-target tier — never a guess board
  throw new Error(`Could not generate a logic-solvable ${difficulty} puzzle`);
}
