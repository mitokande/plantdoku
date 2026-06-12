// Human-style constraint-propagation solver for the Plantdoku (Queens-style) rules.
//
// Pure TypeScript, framework-free (NO react-native / require('*.png') imports) so it runs
// under plain Node for `npm test`. Two jobs:
//   (a) prove a board is solvable by pure logic — i.e. NO guessing/backtracking — which is a
//       strictly stronger guarantee than "unique solution" (uniqueness != fairness), and
//   (b) grade difficulty by the hardest deduction *tier* the solve required.
//
// Constraints: exactly one marker per row, per column, per region; and no two markers within
// Chebyshev distance 1 (8-adjacency). One-per-row/column already forbids any orthogonal touch,
// so the only surviving touch is the diagonal between consecutive rows.
//
// Technique ladder (each tier only tried when all lower tiers stall):
//   Tier 1 — singles: a row/column/region with exactly one candidate is forced; place it and
//            eliminate its row, column, region and 8 neighbours.
//   Tier 2 — confinement: a region whose candidates all lie on one line consumes that line
//            (clear off-region cells on it); dually, a line whose candidates all lie in one
//            region consumes that region (clear off-line cells of it).
//   Tier 3 — subsets: k source units whose candidate footprint covers exactly k targets form a
//            bijection (pigeonhole), so those k targets are used up — clear non-source
//            candidates on them. Run over region<->row, region<->col, row<->col incidences.
//
// Soundness: every rule above was adversarially verified to never eliminate a cell that belongs
// to the unique solution. As a defensive guard against an implementation bug, rateBoard accepts
// the known `truth` solution; if any elimination removes a truth cell it flags `unsound`, and the
// generator rejects such boards outright — so a bug can only cost yield, never ship a bad board.

import type { Coord } from "./types";

export type SolveTier = 1 | 2 | 3;

/**
 * One deduction the ladder made, with enough structure to explain it to a
 * human (the in-game teaching hints replay these). Recording is optional and
 * must never change solver behaviour.
 */
export type DeductionStep =
  | { kind: "single"; unit: "row" | "col" | "region"; index: number; cell: Coord }
  | { kind: "confine"; region: number; line: "row" | "col"; index: number; eliminated: Coord[] }
  | { kind: "claim"; line: "row" | "col"; index: number; region: number; eliminated: Coord[] }
  | {
      kind: "subset";
      source: "row" | "col" | "region";
      target: "row" | "col" | "region";
      sources: number[];
      targets: number[];
      eliminated: Coord[];
    };

export interface Rating {
  /** Placed a marker in every row using only the deduction ladder (no guessing). */
  solved: boolean;
  /** Hardest technique tier the solve needed; null when the board could not be solved. */
  tier: SolveTier | null;
  /** Weighted difficulty score (higher = harder); -1 when unsolved. */
  score: number;
  /** How many times each technique fired (single/confine/subset). */
  counts: Record<string, number>;
  /** True if a rule eliminated a true-solution cell — an implementation-bug guard. */
  unsound: boolean;
}

const NB8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** All k-combinations of `arr` (k small; arrays here are <= board size). */
function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - acc.length); i++) {
      acc.push(arr[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

const MAX_SUBSET_K = 4;

/**
 * Run the deduction ladder on a board. With `truth` supplied, self-audits that no rule ever
 * eliminates a true-solution cell (sets `unsound`). Pure: never mutates its inputs.
 */
export function rateBoard(
  regions: number[][],
  size: number,
  truth?: number[],
  record?: (step: DeductionStep) => void,
): Rating {
  const cand: boolean[][] = Array.from({ length: size }, () =>
    new Array(size).fill(true),
  );
  const rowDone = new Array(size).fill(false);
  const colDone = new Array(size).fill(false);
  const regDone = new Array(size).fill(false);
  const counts: Record<string, number> = { single: 0, confine: 0, subset: 0 };
  let placedCount = 0;
  let unsound = false;

  const inB = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size;

  // Eliminate a candidate; returns true if it had been live. Flags unsound if it was a truth cell.
  const elim = (r: number, c: number): boolean => {
    if (!cand[r][c]) return false;
    cand[r][c] = false;
    if (truth && truth[r] === c) unsound = true;
    return true;
  };

  // Place a forced marker at (r,c) and propagate its eliminations. The placed cell itself is
  // cleared directly (it IS the marker, not a wrong elimination) so it never trips the audit.
  const place = (r: number, c: number) => {
    placedCount++;
    rowDone[r] = true;
    colDone[c] = true;
    const g = regions[r][c];
    regDone[g] = true;
    cand[r][c] = false;
    for (let k = 0; k < size; k++) {
      elim(r, k);
      elim(k, c);
    }
    for (let rr = 0; rr < size; rr++)
      for (let cc = 0; cc < size; cc++)
        if (regions[rr][cc] === g) elim(rr, cc);
    for (const [dr, dc] of NB8) {
      const nr = r + dr;
      const nc = c + dc;
      if (inB(nr, nc)) elim(nr, nc);
    }
  };

  // Tier 1: any row/column/region with exactly one remaining candidate is forced.
  const trySingles = (): boolean => {
    let any = false;
    for (let r = 0; r < size; r++) {
      if (rowDone[r]) continue;
      let cnt = 0;
      let col = -1;
      for (let c = 0; c < size; c++) if (cand[r][c]) (cnt++, (col = c));
      if (cnt === 1) {
        record?.({ kind: "single", unit: "row", index: r, cell: [r, col] });
        place(r, col);
        counts.single++;
        any = true;
      }
    }
    for (let c = 0; c < size; c++) {
      if (colDone[c]) continue;
      let cnt = 0;
      let row = -1;
      for (let r = 0; r < size; r++) if (cand[r][c]) (cnt++, (row = r));
      if (cnt === 1) {
        record?.({ kind: "single", unit: "col", index: c, cell: [row, c] });
        place(row, c);
        counts.single++;
        any = true;
      }
    }
    for (let g = 0; g < size; g++) {
      if (regDone[g]) continue;
      let cnt = 0;
      let cr = -1;
      let cc = -1;
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (regions[r][c] === g && cand[r][c]) (cnt++, (cr = r), (cc = c));
      if (cnt === 1) {
        record?.({ kind: "single", unit: "region", index: g, cell: [cr, cc] });
        place(cr, cc);
        counts.single++;
        any = true;
      }
    }
    return any;
  };

  // Tier 2: region<->line confinement (a.k.a. pointing pairs / claiming).
  const tryConfinement = (): boolean => {
    let any = false;
    // Region confined to a single row/column -> that line is the region's; clear off-region cells.
    for (let g = 0; g < size; g++) {
      if (regDone[g]) continue;
      let r0 = -1;
      let c0 = -1;
      let oneRow = true;
      let oneCol = true;
      let some = false;
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
          if (regions[r][c] !== g || !cand[r][c]) continue;
          if (!some) ((r0 = r), (c0 = c), (some = true));
          else {
            if (r !== r0) oneRow = false;
            if (c !== c0) oneCol = false;
          }
        }
      if (!some) continue;
      if (oneRow) {
        const got: Coord[] = [];
        for (let c = 0; c < size; c++)
          if (regions[r0][c] !== g && elim(r0, c)) (any = true), got.push([r0, c]);
        if (got.length)
          record?.({ kind: "confine", region: g, line: "row", index: r0, eliminated: got });
      }
      if (oneCol) {
        const got: Coord[] = [];
        for (let r = 0; r < size; r++)
          if (regions[r][c0] !== g && elim(r, c0)) (any = true), got.push([r, c0]);
        if (got.length)
          record?.({ kind: "confine", region: g, line: "col", index: c0, eliminated: got });
      }
    }
    // Row confined to a single region -> that region is the row's; clear off-row cells of it.
    for (let r = 0; r < size; r++) {
      if (rowDone[r]) continue;
      let g = -1;
      let one = true;
      let some = false;
      for (let c = 0; c < size; c++) {
        if (!cand[r][c]) continue;
        if (!some) ((g = regions[r][c]), (some = true));
        else if (regions[r][c] !== g) one = false;
      }
      if (some && one) {
        const got: Coord[] = [];
        for (let rr = 0; rr < size; rr++)
          for (let cc = 0; cc < size; cc++)
            if (rr !== r && regions[rr][cc] === g && elim(rr, cc))
              (any = true), got.push([rr, cc]);
        if (got.length)
          record?.({ kind: "claim", line: "row", index: r, region: g, eliminated: got });
      }
    }
    // Column confined to a single region.
    for (let c = 0; c < size; c++) {
      if (colDone[c]) continue;
      let g = -1;
      let one = true;
      let some = false;
      for (let r = 0; r < size; r++) {
        if (!cand[r][c]) continue;
        if (!some) ((g = regions[r][c]), (some = true));
        else if (regions[r][c] !== g) one = false;
      }
      if (some && one) {
        const got: Coord[] = [];
        for (let rr = 0; rr < size; rr++)
          for (let cc = 0; cc < size; cc++)
            if (cc !== c && regions[rr][cc] === g && elim(rr, cc))
              (any = true), got.push([rr, cc]);
        if (got.length)
          record?.({ kind: "claim", line: "col", index: c, region: g, eliminated: got });
      }
    }
    return any;
  };

  // One subset "flavour": sources (units) map to a target id per candidate cell. If k sources
  // cover exactly k distinct targets, those targets are bijected to the sources -> clear any
  // candidate on those targets whose source is outside the subset.
  const subsetFlavour = (
    sourceId: (r: number, c: number) => number,
    targetId: (r: number, c: number) => number,
    sourceDone: boolean[],
    sourceKind: "row" | "col" | "region",
    targetKind: "row" | "col" | "region",
  ): boolean => {
    const targetsBySource = new Map<number, Set<number>>();
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (!cand[r][c]) continue;
        const s = sourceId(r, c);
        if (sourceDone[s]) continue;
        let set = targetsBySource.get(s);
        if (!set) targetsBySource.set(s, (set = new Set()));
        set.add(targetId(r, c));
      }
    const sources = [...targetsBySource.entries()].map(([id, t]) => ({
      id,
      targets: [...t],
    }));
    let any = false;
    for (let k = 2; k <= Math.min(MAX_SUBSET_K, sources.length - 1); k++) {
      for (const combo of combinations(sources, k)) {
        const union = new Set<number>();
        for (const s of combo) for (const t of s.targets) union.add(t);
        if (union.size !== k) continue;
        const inSubset = new Set(combo.map((s) => s.id));
        const got: Coord[] = [];
        for (let r = 0; r < size; r++)
          for (let c = 0; c < size; c++) {
            if (!cand[r][c]) continue;
            if (union.has(targetId(r, c)) && !inSubset.has(sourceId(r, c)))
              if (elim(r, c)) (any = true), got.push([r, c]);
          }
        if (got.length)
          record?.({
            kind: "subset",
            source: sourceKind,
            target: targetKind,
            sources: combo.map((s) => s.id),
            targets: [...union],
            eliminated: got,
          });
      }
    }
    return any;
  };

  // Tier 3: subsets across the productive incidences.
  const trySubsets = (): boolean => {
    const reg = (r: number, c: number) => regions[r][c];
    const row = (r: number, _c: number) => r;
    const col = (_r: number, c: number) => c;
    let any = false;
    any = subsetFlavour(reg, row, regDone, "region", "row") || any; // k regions -> k rows
    any = subsetFlavour(reg, col, regDone, "region", "col") || any; // k regions -> k cols
    any = subsetFlavour(row, col, rowDone, "row", "col") || any; // k rows -> k cols
    any = subsetFlavour(col, row, colDone, "col", "row") || any; // k cols -> k rows
    any = subsetFlavour(row, reg, rowDone, "row", "region") || any; // k rows -> k regions
    any = subsetFlavour(col, reg, colDone, "col", "region") || any; // k cols -> k regions
    return any;
  };

  let hardest = 0;
  while (placedCount < size) {
    if (trySingles()) {
      hardest = Math.max(hardest, 1);
      continue;
    }
    if (tryConfinement()) {
      hardest = Math.max(hardest, 2);
      continue;
    }
    if (trySubsets()) {
      hardest = Math.max(hardest, 3);
      continue;
    }
    break; // stalled — the board needs guessing from here
  }

  const solved = placedCount === size;
  const tier = solved ? ((hardest || 1) as SolveTier) : null;
  const score = solved
    ? hardest * 100 + counts.confine + 3 * counts.subset
    : -1;
  return { solved, tier, score, counts, unsound };
}
