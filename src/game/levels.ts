// The level table: a curated difficulty ramp with deterministic, seed-based
// generation — every player gets the identical board for level N. Seeds were
// picked offline by scripts/pick_level_seeds.ts (in-band tier, fast generation,
// reproducibility verified); rerun it to mint future level batches.
//
// Pure data + types only — headless-safe (imported by tests under plain Node).

import type { Difficulty } from "./types";

export interface LevelDef {
  difficulty: Difficulty;
  seed: number;
}

// Curve: ramp with breathers — easy warm-up (L1–8), medium with an easy
// breather at L12, a hard spike at L20 with medium breathers at L21/L25,
// hard finale (L26–30). Batch 2 (L31–60) is for veterans: hard-leaning with
// medium breathers thinning out (L31–33 medium re-entry, breathers at
// L36/L40/L45/L50/L55, hard finale L56–60).
export const LEVELS: LevelDef[] = [
  { difficulty: "easy", seed: 1000 }, // L1 6×6 tier 1
  { difficulty: "easy", seed: 2000 }, // L2 6×6 tier 1
  { difficulty: "easy", seed: 3000 }, // L3 6×6 tier 2
  { difficulty: "easy", seed: 4000 }, // L4 6×6 tier 1
  { difficulty: "easy", seed: 5000 }, // L5 6×6 tier 2
  { difficulty: "easy", seed: 6000 }, // L6 6×6 tier 2
  { difficulty: "easy", seed: 7000 }, // L7 6×6 tier 2
  { difficulty: "easy", seed: 8000 }, // L8 6×6 tier 2
  { difficulty: "medium", seed: 9000 }, // L9 8×8 tier 3
  { difficulty: "medium", seed: 10000 }, // L10 8×8 tier 2
  { difficulty: "medium", seed: 11000 }, // L11 8×8 tier 3
  { difficulty: "easy", seed: 12000 }, // L12 6×6 tier 1 (breather)
  { difficulty: "medium", seed: 13000 }, // L13 8×8 tier 2
  { difficulty: "medium", seed: 14000 }, // L14 8×8 tier 3
  { difficulty: "medium", seed: 15000 }, // L15 8×8 tier 2
  { difficulty: "medium", seed: 16000 }, // L16 8×8 tier 2
  { difficulty: "medium", seed: 17000 }, // L17 8×8 tier 2
  { difficulty: "medium", seed: 18000 }, // L18 8×8 tier 2
  { difficulty: "medium", seed: 19000 }, // L19 8×8 tier 3
  { difficulty: "hard", seed: 20000 }, // L20 9×9 tier 3 (spike)
  { difficulty: "medium", seed: 21000 }, // L21 8×8 tier 3 (breather)
  { difficulty: "hard", seed: 22000 }, // L22 9×9 tier 3
  { difficulty: "hard", seed: 23000 }, // L23 9×9 tier 3
  { difficulty: "hard", seed: 24000 }, // L24 9×9 tier 3
  { difficulty: "medium", seed: 25000 }, // L25 8×8 tier 3 (breather)
  { difficulty: "hard", seed: 26000 }, // L26 9×9 tier 3
  { difficulty: "hard", seed: 27000 }, // L27 9×9 tier 3
  { difficulty: "hard", seed: 28000 }, // L28 9×9 tier 3
  { difficulty: "hard", seed: 29000 }, // L29 9×9 tier 3
  { difficulty: "hard", seed: 30000 }, // L30 9×9 tier 3 (finale)
  { difficulty: "medium", seed: 31000 }, // L31 8×8 tier 2 (batch-2 re-entry)
  { difficulty: "medium", seed: 32000 }, // L32 8×8 tier 3
  { difficulty: "medium", seed: 33000 }, // L33 8×8 tier 3
  { difficulty: "hard", seed: 34000 }, // L34 9×9 tier 3
  { difficulty: "hard", seed: 35000 }, // L35 9×9 tier 3
  { difficulty: "medium", seed: 36000 }, // L36 8×8 tier 2 (breather)
  { difficulty: "hard", seed: 37000 }, // L37 9×9 tier 3
  { difficulty: "hard", seed: 38000 }, // L38 9×9 tier 3
  { difficulty: "hard", seed: 39000 }, // L39 9×9 tier 3
  { difficulty: "medium", seed: 40000 }, // L40 8×8 tier 2 (breather)
  { difficulty: "hard", seed: 41000 }, // L41 9×9 tier 3
  { difficulty: "hard", seed: 42000 }, // L42 9×9 tier 3
  { difficulty: "hard", seed: 43000 }, // L43 9×9 tier 3
  { difficulty: "hard", seed: 44000 }, // L44 9×9 tier 3
  { difficulty: "medium", seed: 45000 }, // L45 8×8 tier 2 (breather)
  { difficulty: "hard", seed: 46000 }, // L46 9×9 tier 3
  { difficulty: "hard", seed: 47000 }, // L47 9×9 tier 3
  { difficulty: "hard", seed: 48000 }, // L48 9×9 tier 3
  { difficulty: "hard", seed: 49000 }, // L49 9×9 tier 3
  { difficulty: "medium", seed: 50000 }, // L50 8×8 tier 3 (breather)
  { difficulty: "hard", seed: 51000 }, // L51 9×9 tier 3
  { difficulty: "hard", seed: 52000 }, // L52 9×9 tier 3
  { difficulty: "hard", seed: 53001 }, // L53 9×9 tier 3
  { difficulty: "hard", seed: 54000 }, // L54 9×9 tier 3
  { difficulty: "medium", seed: 55000 }, // L55 8×8 tier 2 (breather)
  { difficulty: "hard", seed: 56000 }, // L56 9×9 tier 3
  { difficulty: "hard", seed: 57001 }, // L57 9×9 tier 3
  { difficulty: "hard", seed: 58000 }, // L58 9×9 tier 3
  { difficulty: "hard", seed: 59001 }, // L59 9×9 tier 3
  { difficulty: "hard", seed: 60000 }, // L60 9×9 tier 3 (finale)
];

export const LEVEL_COUNT = LEVELS.length;

/** 1-based level lookup. */
export function getLevel(n: number): LevelDef {
  const def = LEVELS[n - 1];
  if (!def) throw new Error(`No such level: ${n}`);
  return def;
}
