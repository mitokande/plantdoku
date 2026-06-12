// Daily puzzle: every player worldwide gets the identical board for a given
// calendar date, with zero backend — the date string is hashed into a seed for
// the deterministic generator. The day rolls over at *local* midnight
// (Wordle-style).
//
// Pure data + logic only — headless-safe (imported by tests under plain Node).
//
// NOTE: like the level table, daily boards depend on the generator algorithm:
// if generator behaviour changes between app versions, players on different
// versions will see different boards for the same date.

import type { Difficulty } from "./types";

/** One fixed size keeps the daily ritual predictable and comparable. */
export const DAILY_DIFFICULTY: Difficulty = "medium";

/** Daily #1 = this date (UTC arithmetic so DST can't skip/duplicate a number). */
const EPOCH_UTC = Date.UTC(2026, 5, 1); // 2026-06-01

/** Local-calendar date key, e.g. "2026-06-11". */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** 1-based daily number shown to players ("Daily #11") and used in shares. */
export function dailyNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH_UTC) / 86_400_000) + 1;
}

/** FNV-1a 32-bit over a salted date key -> generator seed. Must never change:
 *  it defines which board every player sees on a given date. */
export function dailySeed(key: string): number {
  const str = `plantdoku-daily-${key}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** True when `prev` is the calendar day immediately before `key` (streak math). */
export function isConsecutive(prev: string | null, key: string): boolean {
  if (!prev) return false;
  return dailyNumber(key) - dailyNumber(prev) === 1;
}
