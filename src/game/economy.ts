// Coin economy: every tunable number in the game's currency lives here.
//
// Pure data + logic only — headless-safe (no RN / asset imports), same rule as
// stars.ts and cards.ts, so `npm test` keeps running under plain Node.
//
// Why a second currency at all: stars can't be one. They are simultaneously a
// per-level skill *record* and the card-unlock currency, and they are finite
// (60 levels x 3 = 180), so spending them would erase the rating and the faucet
// would run dry. Coins are the repeatably-earnable half, and they exist to be
// spent on exactly one thing — buying back a board you were about to lose.
//
// The faucet is deliberately first-clear-only for levels (a replay pays
// nothing, so grinding level 1 can't mint coins) with daily and endless as the
// ongoing income — which is also the first real reward endless has ever paid.

import type { Difficulty } from "./types";

/** Cost of one revive: +1 heart, board untouched. */
export const REVIVE_COST = 500;

/** First clear of a level. Replays pay nothing — see the faucet note above. */
export const COINS_PER_LEVEL = 20;

/** Base payout for the first solve of a given day's daily. */
export const COINS_PER_DAILY = 20;

/**
 * What a new (or freshly flushed) player starts with.
 *
 * NOTE this is the knob to turn if the revive reads as unreachable. At 20 a
 * level, a player can first afford a revive around level 25, while most fails
 * land in the medium band (L9-20) — so the button is unaffordable roughly when
 * it is first wanted. `FailOverlay` renders that state as progress (`340/500`)
 * rather than as a dead control, but a starting grant is the direct fix.
 */
export const STARTING_COINS = 0;

/** Endless payout by board size — the mode's first actual reward. */
const ENDLESS_COINS: Record<Difficulty, number> = {
  easy: 10,
  medium: 15,
  hard: 20,
};

/** Streak bonus is capped so a long streak can't out-earn everything else. */
const DAILY_STREAK_CAP = 10;
const DAILY_STREAK_BONUS = 2;

/**
 * Daily payout, including the streak bonus. `streak` is the streak *after*
 * today's solve (so day one pays the base plus one step).
 */
export function dailyCoins(streak: number): number {
  const kept = Math.max(0, Math.min(Math.floor(streak), DAILY_STREAK_CAP));
  return COINS_PER_DAILY + kept * DAILY_STREAK_BONUS;
}

/** Endless payout for a solved board. */
export function endlessCoins(difficulty: Difficulty): number {
  return ENDLESS_COINS[difficulty];
}

/** Whether a balance covers a price. Guards NaN from a corrupt stored value. */
export function canAfford(coins: number, cost: number): boolean {
  return Number.isFinite(coins) && coins >= cost;
}
