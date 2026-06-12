// Per-level star ratings: ★ solved · ★★ no hints · ★★★ also under par time.
// Par is derived from board size + deduction tier (no per-seed playtesting).
//
// Pure data + logic only — headless-safe (imported by tests under plain Node).

import type { SolveTier } from "./logicSolver";

/** parSeconds[size][tier] — generous enough to be beatable on a good run. */
const PAR_SECONDS: Record<number, Record<SolveTier, number>> = {
  6: { 1: 90, 2: 120, 3: 150 },
  8: { 1: 180, 2: 240, 3: 300 },
  9: { 1: 300, 2: 360, 3: 450 },
};

export function parSeconds(size: number, tier: SolveTier | undefined): number {
  return PAR_SECONDS[size]?.[tier ?? 3] ?? 300;
}

/** Stars earned by a finished solve (1..3). */
export function starsFor(
  seconds: number,
  hintsUsed: number,
  size: number,
  tier: SolveTier | undefined,
): number {
  let stars = 1;
  if (hintsUsed === 0) stars++;
  if (seconds <= parSeconds(size, tier)) stars++;
  return stars;
}
