// Offline seed picker for the level table (src/game/levels.ts). Run with:
//   npx tsx scripts/pick_level_seeds.ts
//
// For each level it scans candidate seeds and keeps the first whose puzzle
// (a) lands inside the difficulty's tier band (i.e. no fallback board),
// (b) generates fast, and (c) is reproducible (two runs, identical board).
// Paste the printed LEVELS literal into src/game/levels.ts.

import { generatePuzzle } from "../src/game/generator";
import { DIFFICULTY_BANDS, type Difficulty } from "../src/game/types";

// Difficulty curve: ramp with breathers (9 easy / 12 medium / 9 hard), then a
// veteran batch (L31–60): hard-leaning with medium breathers thinning out.
// NOTE: levels are seed-scanned per index (level*1000+k), so APPENDING to the
// curve never changes earlier levels' seeds — verify L1–30 stay identical.
const CURVE: Difficulty[] = [
  ...Array<Difficulty>(8).fill("easy"), // L1–8   warm-up
  "medium", "medium", "medium",         // L9–11
  "easy",                               // L12    breather
  ...Array<Difficulty>(7).fill("medium"), // L13–19
  "hard",                               // L20    spike
  "medium",                             // L21    breather
  "hard", "hard", "hard",               // L22–24
  "medium",                             // L25    breather
  ...Array<Difficulty>(5).fill("hard"), // L26–30 finale
  "medium", "medium", "medium",         // L31–33 batch-2 re-entry
  "hard", "hard",                       // L34–35
  "medium",                             // L36    breather
  "hard", "hard", "hard",               // L37–39
  "medium",                             // L40    breather
  ...Array<Difficulty>(4).fill("hard"), // L41–44
  "medium",                             // L45    breather
  ...Array<Difficulty>(4).fill("hard"), // L46–49
  "medium",                             // L50    breather
  ...Array<Difficulty>(4).fill("hard"), // L51–54
  "medium",                             // L55    breather
  ...Array<Difficulty>(5).fill("hard"), // L56–60 finale
];

const MAX_GEN_MS = 150;

function sameBoard(
  a: { regions: number[][]; solution: number[] },
  b: { regions: number[][]; solution: number[] },
): boolean {
  return (
    JSON.stringify(a.regions) === JSON.stringify(b.regions) &&
    JSON.stringify(a.solution) === JSON.stringify(b.solution)
  );
}

const rows: string[] = [];
for (let level = 1; level <= CURVE.length; level++) {
  const difficulty = CURVE[level - 1];
  const band = DIFFICULTY_BANDS[difficulty];
  let found = false;
  for (let k = 0; k < 200 && !found; k++) {
    const seed = level * 1000 + k;
    const t0 = Date.now();
    const p = generatePuzzle(difficulty, seed);
    const ms = Date.now() - t0;
    if (p.tier == null || p.tier < band.minTier || p.tier > band.maxTier) continue;
    if (ms > MAX_GEN_MS) continue;
    const p2 = generatePuzzle(difficulty, seed);
    if (!sameBoard(p, p2)) {
      console.error(`level ${level} seed ${seed}: NOT deterministic — generator bug`);
      process.exit(1);
    }
    rows.push(
      `  { difficulty: "${difficulty}", seed: ${seed} }, // L${level} ${p.size}×${p.size} tier ${p.tier} (${ms}ms)`,
    );
    found = true;
  }
  if (!found) {
    console.error(`level ${level} (${difficulty}): no acceptable seed in range`);
    process.exit(1);
  }
}

console.log("export const LEVELS: LevelDef[] = [");
console.log(rows.join("\n"));
console.log("];");
