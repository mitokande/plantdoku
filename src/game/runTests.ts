// Headless correctness tests for the game core. Run with:
//   npx tsx src/game/runTests.ts
// Asserts every generated puzzle has exactly one solution and well-formed
// regions, and that the validator agrees with the stored solution.

import { generatePuzzle } from "./generator";
import { countSolutions, findSolution } from "./solver";
import { findConflicts, isSolved } from "./validator";
import type { Coord } from "./types";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("  FAIL:", msg);
  }
}

function regionsConnected(regions: number[][], size: number): boolean {
  const seen = Array.from({ length: size }, () => new Array(size).fill(false));
  for (let target = 0; target < size; target++) {
    // find a seed cell of this region
    let seed: Coord | null = null;
    let total = 0;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (regions[r][c] === target) {
          total++;
          if (!seed) seed = [r, c];
        }
    if (!seed || total === 0) return false;
    // BFS within region
    const stack: Coord[] = [seed];
    seen[seed[0]][seed[1]] = true;
    let visited = 0;
    while (stack.length) {
      const [r, c] = stack.pop()!;
      visited++;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nr = r + dr;
        const nc = c + dc;
        if (
          nr >= 0 &&
          nr < size &&
          nc >= 0 &&
          nc < size &&
          !seen[nr][nc] &&
          regions[nr][nc] === target
        ) {
          seen[nr][nc] = true;
          stack.push([nr, nc]);
        }
      }
    }
    if (visited !== total) return false;
  }
  return true;
}

const SIZES = [6, 8, 9];
const PER_SIZE = 60;

const t0 = Date.now();
for (const size of SIZES) {
  console.log(`size ${size}: generating ${PER_SIZE} puzzles...`);
  let maxMs = 0;
  for (let n = 0; n < PER_SIZE; n++) {
    const g0 = Date.now();
    const p = generatePuzzle(size);
    maxMs = Math.max(maxMs, Date.now() - g0);

    // 1. exactly one solution
    check(
      countSolutions(p.regions, size, Infinity) === 1,
      `size ${size} #${n}: not a unique solution`,
    );

    // 2. stored solution is a valid permutation + adjacency-safe
    const cols = new Set(p.solution);
    check(cols.size === size, `size ${size} #${n}: solution columns not unique`);
    for (let r = 1; r < size; r++) {
      check(
        Math.abs(p.solution[r] - p.solution[r - 1]) >= 2,
        `size ${size} #${n}: adjacent rows too close`,
      );
    }

    // 3. one marker per region in the solution
    const regs = new Set(p.solution.map((c, r) => p.regions[r][c]));
    check(regs.size === size, `size ${size} #${n}: solution not one-per-region`);

    // 4. region map well-formed: values 0..size-1 and connected
    const counts = new Array(size).fill(0);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const v = p.regions[r][c];
        check(
          v >= 0 && v < size,
          `size ${size} #${n}: region id ${v} out of range`,
        );
        counts[v]++;
      }
    check(
      counts.every((c) => c >= 1),
      `size ${size} #${n}: empty region`,
    );
    check(
      regionsConnected(p.regions, size),
      `size ${size} #${n}: a region is disconnected`,
    );

    // 5. solver's found solution matches (unique => identical)
    const found = findSolution(p.regions, size);
    check(
      !!found && found.every((c, r) => c === p.solution[r]),
      `size ${size} #${n}: findSolution disagrees with stored solution`,
    );

    // 6. validator: placing the solution is conflict-free and solved
    const placed: Coord[] = p.solution.map((c, r) => [r, c]);
    const conflicts = findConflicts(placed, p.regions);
    check(
      conflicts.size === 0,
      `size ${size} #${n}: validator flags the true solution`,
    );
    check(
      isSolved(placed.length, size, conflicts.size),
      `size ${size} #${n}: isSolved false on the true solution`,
    );

    // 7. sanity: an obviously-conflicting placement is flagged
    if (size >= 2) {
      const bad: Coord[] = [
        [0, 0],
        [1, 1],
      ];
      check(
        findConflicts(bad, p.regions).size > 0,
        `size ${size} #${n}: validator missed an adjacency conflict`,
      );
    }
  }
  console.log(`  ok (slowest generate: ${maxMs}ms)`);
}

console.log(
  `\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"} in ${
    Date.now() - t0
  }ms`,
);
process.exit(failures === 0 ? 0 : 1);
