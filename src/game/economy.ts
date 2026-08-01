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

/**
 * Every Nth level is a gold "chest" node on the Home path, and reaching one
 * pays a bonus. This lives here rather than in `HomeScreen.tsx` so the chest
 * the player is *shown* and the chest that actually *pays* can never drift
 * apart — the screen imports this constant.
 */
export const MILESTONE_EVERY = 10;
export const MILESTONE_COINS = 100;
/** A chest pays hints as well as coins — see the hint stock below. */
export const MILESTONE_HINTS = 2;

/** Whether `level` carries a chest. */
export function isMilestoneLevel(level: number): boolean {
  return level > 0 && level % MILESTONE_EVERY === 0;
}

/**
 * The chest bonus for *reaching* `level` — i.e. paid when that level becomes
 * playable, which is the moment the path stops drawing its chest. Tying it to
 * unlocking rather than to clearing is what keeps the two in step: the chest
 * disappears exactly when it is collected, and it matches the callout's own
 * wording ("Reach level 10 ...").
 */
export function milestoneCoins(level: number): number {
  return isMilestoneLevel(level) ? MILESTONE_COINS : 0;
}

/** The hint half of the same chest, paid on the same edge. */
export function milestoneHints(level: number): number {
  return isMilestoneLevel(level) ? MILESTONE_HINTS : 0;
}

// --- Hints ----------------------------------------------------------------
// The second consumable, and deliberately *not* priced in coins. Coins buy
// exactly one thing (a revive); giving them a second sink would make every
// coin decision a comparison, and the hint's price is meant to be attention,
// not currency. So the hint stock has its own faucet: a starting grant, the
// chest levels, and a rewarded ad when the player runs dry.
//
// Note hints stay free of the *star* economy either way: spending one still
// costs the "no hints" star, which is what keeps a stocked player from
// three-starring everything.

/** What a new (or freshly flushed) player starts with. */
export const STARTING_HINTS = 5;

/** What one completed rewarded ad pays. One ad, one hint. */
export const HINTS_PER_AD = 1;

/** Whether a hint can be spent at all. Guards NaN from a corrupt value. */
export function canHint(hints: number): boolean {
  return Number.isFinite(hints) && hints > 0;
}

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
