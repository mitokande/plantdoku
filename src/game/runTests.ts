// Headless correctness tests for the game core. Run with:
//   npx tsx src/game/runTests.ts
// Asserts every generated puzzle (a) has exactly one solution and well-formed regions, (b) is
// solvable by pure logic with no guessing and sits in its difficulty's deduction-tier band, and
// (c) that the logic solver is sound — it never eliminates a true-solution cell across thousands
// of boards (the audit that must be green before trusting tier-gated generation).

import { CARDS, newlyUnlocked, nextCard, unlockedCards } from "./cards";
import { DAILY_DIFFICULTY, dailyNumber, dailySeed, isConsecutive } from "./daily";
import { generatePuzzle, generateUniqueBoard } from "./generator";
import { nextHint } from "./hints";
import { LEVELS } from "./levels";
import { PLANT_IDS } from "./palette";
import { countSolutions, findSolution } from "./solver";
import { rateBoard } from "./logicSolver";
import { parSeconds, starsFor } from "./stars";
import { findConflicts, isSolved } from "./validator";
import {
  DIFFICULTIES,
  DIFFICULTY_BANDS,
  DIFFICULTY_ORDER,
  type CellState,
  type Coord,
} from "./types";

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

const t0 = Date.now();

// ---------------------------------------------------------------------------
// Part 1 — per-difficulty: structural validity + fairness (logic-solvable, in band).
// ---------------------------------------------------------------------------
const PER_DIFFICULTY = 30;
for (const difficulty of DIFFICULTY_ORDER) {
  const size = DIFFICULTIES[difficulty].size;
  const band = DIFFICULTY_BANDS[difficulty];
  console.log(
    `${difficulty} (${size}x${size}): generating ${PER_DIFFICULTY} puzzles...`,
  );
  let maxMs = 0;
  const tierHist: Record<number, number> = {};
  for (let n = 0; n < PER_DIFFICULTY; n++) {
    const g0 = Date.now();
    const p = generatePuzzle(difficulty);
    maxMs = Math.max(maxMs, Date.now() - g0);

    // 1. exactly one solution
    check(
      countSolutions(p.regions, size, Infinity) === 1,
      `${difficulty} #${n}: not a unique solution`,
    );

    // 2. stored solution is a valid permutation + adjacency-safe
    const cols = new Set(p.solution);
    check(cols.size === size, `${difficulty} #${n}: solution columns not unique`);
    for (let r = 1; r < size; r++) {
      check(
        Math.abs(p.solution[r] - p.solution[r - 1]) >= 2,
        `${difficulty} #${n}: adjacent rows too close`,
      );
    }

    // 3. one marker per region in the solution
    const regs = new Set(p.solution.map((c, r) => p.regions[r][c]));
    check(regs.size === size, `${difficulty} #${n}: solution not one-per-region`);

    // 4. region map well-formed: values 0..size-1 and connected
    const counts = new Array(size).fill(0);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const v = p.regions[r][c];
        check(v >= 0 && v < size, `${difficulty} #${n}: region id ${v} out of range`);
        counts[v]++;
      }
    check(counts.every((c) => c >= 1), `${difficulty} #${n}: empty region`);
    check(
      regionsConnected(p.regions, size),
      `${difficulty} #${n}: a region is disconnected`,
    );
    if (difficulty === "easy") {
      check(
        counts.some((c) => c === 1),
        `${difficulty} #${n}: no singleton cluster (easy boards must include one)`,
      );
    }

    // 5. solver's found solution matches (unique => identical)
    const found = findSolution(p.regions, size);
    check(
      !!found && found.every((c, r) => c === p.solution[r]),
      `${difficulty} #${n}: findSolution disagrees with stored solution`,
    );

    // 6. validator: placing the solution is conflict-free and solved
    const placed: Coord[] = p.solution.map((c, r) => [r, c]);
    const conflicts = findConflicts(placed, p.regions);
    check(conflicts.size === 0, `${difficulty} #${n}: validator flags the true solution`);
    check(
      isSolved(placed.length, size, conflicts.size),
      `${difficulty} #${n}: isSolved false on the true solution`,
    );

    // 7. sanity: an obviously-conflicting placement is flagged
    const bad: Coord[] = [
      [0, 0],
      [1, 1],
    ];
    check(
      findConflicts(bad, p.regions).size > 0,
      `${difficulty} #${n}: validator missed an adjacency conflict`,
    );

    // 8. FAIRNESS: solvable by pure logic, soundly, and within the difficulty band.
    const rating = rateBoard(p.regions, size, p.solution);
    check(rating.solved, `${difficulty} #${n}: board not solvable by pure logic (needs guessing)`);
    check(!rating.unsound, `${difficulty} #${n}: logic solver eliminated a true cell (unsound)`);
    check(
      p.tier != null && p.tier >= band.minTier && p.tier <= band.maxTier,
      `${difficulty} #${n}: tier ${p.tier} outside band [${band.minTier},${band.maxTier}]`,
    );
    if (p.tier != null) tierHist[p.tier] = (tierHist[p.tier] ?? 0) + 1;
  }
  console.log(
    `  ok (slowest generate: ${maxMs}ms, tiers: ${JSON.stringify(tierHist)})`,
  );
}

// ---------------------------------------------------------------------------
// Part 2 — level table: every shipped level must be deterministic (same seed →
// identical board), land inside its difficulty's tier band (i.e. the curated
// seed never hits the fallback path), and keep the easy singleton guarantee.
// ---------------------------------------------------------------------------
console.log(`levels: checking ${LEVELS.length} curated seeds...`);
LEVELS.forEach(({ difficulty, seed }, i) => {
  const level = i + 1;
  const band = DIFFICULTY_BANDS[difficulty];
  const p1 = generatePuzzle(difficulty, seed);
  const p2 = generatePuzzle(difficulty, seed);
  check(
    JSON.stringify(p1.regions) === JSON.stringify(p2.regions) &&
      JSON.stringify(p1.solution) === JSON.stringify(p2.solution) &&
      JSON.stringify(p1.colors) === JSON.stringify(p2.colors) &&
      JSON.stringify(p1.plants) === JSON.stringify(p2.plants),
    `level ${level}: seed ${seed} not deterministic`,
  );
  check(
    p1.tier != null && p1.tier >= band.minTier && p1.tier <= band.maxTier,
    `level ${level}: tier ${p1.tier} outside ${difficulty} band`,
  );
  if (difficulty === "easy") {
    const counts = new Array(p1.size).fill(0);
    for (const row of p1.regions) for (const id of row) counts[id]++;
    check(
      counts.some((c) => c === 1),
      `level ${level}: easy level has no singleton cluster`,
    );
  }
});
console.log("  ok");

// ---------------------------------------------------------------------------
// Part 2b — daily puzzle: the date->seed mapping is a public contract (it
// decides which board the whole world sees on a date), so it is pinned with
// golden values; the date arithmetic must survive month/year boundaries; and
// a daily board must be reproducible like any other seeded board.
// ---------------------------------------------------------------------------
console.log("daily: checking seed contract + date math...");
check(
  dailySeed("2026-06-11") === 0x9cd63d86,
  `dailySeed golden value changed: 0x${dailySeed("2026-06-11").toString(16)} — ` +
    "this would silently change every player's daily board",
);
check(dailyNumber("2026-06-01") === 1, "dailyNumber epoch should be #1");
check(
  dailyNumber("2026-07-01") - dailyNumber("2026-06-30") === 1,
  "dailyNumber must be continuous across month boundary",
);
check(
  isConsecutive("2026-12-31", "2027-01-01") && !isConsecutive("2026-06-09", "2026-06-11"),
  "isConsecutive year-boundary / gap handling wrong",
);
check(!isConsecutive(null, "2026-06-11"), "isConsecutive(null) must be false");
{
  const seed = dailySeed("2026-06-11");
  const d1 = generatePuzzle(DAILY_DIFFICULTY, seed);
  const d2 = generatePuzzle(DAILY_DIFFICULTY, seed);
  check(
    JSON.stringify(d1.regions) === JSON.stringify(d2.regions) &&
      JSON.stringify(d1.solution) === JSON.stringify(d2.solution),
    "daily board not reproducible for a fixed date",
  );
  check(countSolutions(d1.regions, d1.size, 2) === 1, "daily board not unique");
}
console.log("  ok");

// ---------------------------------------------------------------------------
// Part 2c — teaching hints: following nextHint from an empty grid must fully
// solve every shipped level, every place-hint must be a true solution cell,
// and no mark-hint may ever ✕ a solution cell. Also: stars math sanity.
// ---------------------------------------------------------------------------
console.log("hints: solving all levels by following hints...");
LEVELS.forEach(({ difficulty, seed }, i) => {
  const level = i + 1;
  const p = generatePuzzle(difficulty, seed);
  const states: CellState[][] = Array.from({ length: p.size }, () =>
    new Array(p.size).fill("empty"),
  );
  let placed = 0;
  let guard = p.size * p.size * 4;
  while (placed < p.size && guard-- > 0) {
    const hint = nextHint(p, states);
    if (!hint) {
      check(false, `level ${level}: hints stalled with ${placed}/${p.size} placed`);
      break;
    }
    if (hint.action === "place") {
      const [r, c] = hint.cell!;
      check(p.solution[r] === c, `level ${level}: place-hint at non-solution cell`);
      if (states[r][c] !== "placed") placed++;
      states[r][c] = "placed";
    } else {
      check(hint.cells.length > 0, `level ${level}: empty mark-hint`);
      for (const [r, c] of hint.cells) {
        check(p.solution[r] !== c, `level ${level}: mark-hint ✕ on a solution cell`);
        states[r][c] = "marked";
      }
    }
  }
  check(placed === p.size, `level ${level}: hint walk did not finish (${placed}/${p.size})`);
  check(nextHint(p, states) === null, `level ${level}: hint offered on a solved grid`);
});
check(parSeconds(6, 1) < parSeconds(9, 3), "par must grow with size/tier");
check(
  starsFor(1, 0, 6, 1) === 3 && starsFor(9999, 1, 6, 1) === 1 && starsFor(1, 1, 6, 1) === 2,
  "starsFor thresholds wrong",
);
console.log("  ok");

// ---------------------------------------------------------------------------
// Part 2d — plant cards: the collection must cover every plant id exactly
// once, milestones must be strictly increasing and reachable (first card from
// the very first solve, last card within the level table's max stars), and
// the unlock helpers must agree with the table.
// ---------------------------------------------------------------------------
console.log("cards: checking collection milestones...");
check(
  CARDS.length === PLANT_IDS.length &&
    new Set(CARDS.map((c) => c.plantId)).size === PLANT_IDS.length &&
    CARDS.every((c) => PLANT_IDS.includes(c.plantId)),
  "cards must cover every PLANT_ID exactly once",
);
for (let i = 1; i < CARDS.length; i++) {
  check(
    CARDS[i].stars > CARDS[i - 1].stars,
    `card thresholds not strictly increasing at #${i}`,
  );
}
check(CARDS[0].stars <= 3, "first card must be unlockable by solving level 1");
check(
  CARDS[CARDS.length - 1].stars <= LEVELS.length * 3,
  "last card requires more stars than the level table can award",
);
check(
  unlockedCards(0).length === 0 && nextCard(0) === CARDS[0],
  "fresh save: nothing unlocked, first card up next",
);
const maxStars = CARDS[CARDS.length - 1].stars;
check(
  unlockedCards(maxStars).length === CARDS.length && nextCard(maxStars) === null,
  "full collection at the last threshold",
);
check(
  newlyUnlocked(0, CARDS[0].stars).length === 1 &&
    newlyUnlocked(CARDS[0].stars, CARDS[0].stars).length === 0,
  "newlyUnlocked must report exactly the crossed thresholds",
);
console.log("  ok");

// ---------------------------------------------------------------------------
// Part 3 — soundness audit: the logic solver must NEVER eliminate a true-solution cell, across
// thousands of RAW boards (including the majority that need guessing). This is the safety gate
// that makes tier-based generation trustworthy. Also reports the logic-solvable yield per size.
// ---------------------------------------------------------------------------
const AUDIT_BOARDS = 600; // actual unique boards to audit per size
for (const size of [6, 8, 9]) {
  let solvedCount = 0;
  let unsoundCount = 0;
  let boards = 0;
  const tierHist: Record<string, number> = {};
  for (let attempt = 0; boards < AUDIT_BOARDS && attempt < AUDIT_BOARDS * 30; attempt++) {
    const board = generateUniqueBoard(size);
    if (!board) continue;
    boards++;
    const r = rateBoard(board.regions, size, board.solution);
    if (r.unsound) unsoundCount++;
    if (r.solved) solvedCount++;
    const key = r.solved ? `tier${r.tier}` : "FAIL";
    tierHist[key] = (tierHist[key] ?? 0) + 1;
  }
  check(
    unsoundCount === 0,
    `size ${size}: logic solver was UNSOUND on ${unsoundCount}/${boards} raw boards`,
  );
  const pct = boards ? ((100 * solvedCount) / boards).toFixed(1) : "0";
  console.log(
    `audit size ${size}: ${boards} raw boards, ${pct}% logic-solvable, 0 unsound, dist ${JSON.stringify(tierHist)}`,
  );
}

console.log(
  `\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"} in ${
    Date.now() - t0
  }ms`,
);
process.exit(failures === 0 ? 0 : 1);
