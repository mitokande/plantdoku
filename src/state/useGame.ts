// Game state hook: board, tap-cycle, undo/reset/hint, timer, win + level
// progression (unlocked level + per-level stars persisted). Levels keep no best
// time; daily and endless still do.

import { useEffect, useReducer, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { analytics } from "../analytics";
import { audio } from "../audio";
import { notifications } from "../notifications";
import { nextCard, newlyUnlocked, type PlantCard } from "../game/cards";
import {
  DAILY_DIFFICULTY,
  dailySeed,
  isConsecutive,
  todayKey,
} from "../game/daily";
import {
  canAfford,
  COINS_PER_LEVEL,
  dailyCoins,
  endlessCoins,
  milestoneCoins,
  REVIVE_COST,
  STARTING_COINS,
} from "../game/economy";
import { generatePuzzle } from "../game/generator";
import { getLevel, LEVEL_COUNT } from "../game/levels";
import { starsFor } from "../game/stars";
import { cellKey, isSolved } from "../game/validator";
import type { CellState, Coord, Difficulty, Puzzle } from "../game/types";

// Hearts (lives): planting on a cell that isn't its solution cell costs one;
// losing all of them fails the board (locks it until the player retries).
const MAX_HEARTS = 3;

/** One undo step: the board plus the red-✕ set that went with it. */
interface Snapshot {
  states: CellState[][];
  mistakes: Set<string>;
}

interface GameState {
  mode: "level" | "daily" | "endless";
  level: number; // 0 outside level mode
  dailyKey: string | null; // the date the daily board was started for
  endlessDifficulty: Difficulty | null; // set in endless mode
  puzzle: Puzzle;
  /** The one species this board is planted with — see `boardPlant`. Frozen at
   *  board creation, NOT derived per render: the solve that finishes the board
   *  may cross the very milestone it was picked from, and the grid is still on
   *  screen behind the win flourish. */
  plant: string;
  states: CellState[][];
  history: Snapshot[];
  // Cells the player tried to plant on and got wrong: the plant is rejected
  // and the cell is ✕-marked *red* instead (state "marked" + this set).
  mistakes: Set<string>;
  placedCount: number;
  seconds: number;
  started: boolean;
  solved: boolean;
  hearts: number; // lives left; 0 -> failed
  failed: boolean; // ran out of hearts on this board
  hintsUsed: number; // hint requests this board (any kind); gates the 2nd star
}

/** An in-progress board persisted to storage so leaving (or an app kill)
 *  doesn't throw the solve away. `v` guards against schema drift: a snapshot
 *  from an older shape is ignored rather than restored half-read. The undo
 *  stack is deliberately not persisted — a resumed board starts with a clean
 *  history (cheap, and undoing across an app restart isn't expected). */
// v2: Puzzle.plants[] (one species per region) became one species per board,
// chosen from the collection (`plant`), so a v1 snapshot would restore a board
// with no sprite to draw.
const RESUME_VERSION = 2;

export interface ResumeSnapshot {
  v: number;
  mode: GameState["mode"];
  level: number;
  dailyKey: string | null;
  endlessDifficulty: Difficulty | null;
  puzzle: Puzzle;
  plant: string;
  states: CellState[][];
  mistakes: string[];
  seconds: number;
  hearts: number;
  hintsUsed: number;
  updatedAt: number; // ms epoch — picks the newest board for the Home card
}

/** One slot per mode, so starting today's daily can't quietly bin a
 *  half-solved level (each mode supersedes only its own saved board). */
type ResumeSlots = Partial<Record<GameState["mode"], ResumeSnapshot>>;

// The board-creating actions carry `plant` because picking it needs the star
// total, which lives outside the reducer (see `boardPlant`). Omitted → the
// puzzle's own seeded pick.
type Action =
  | { type: "NEW_GAME"; level: number; plant?: string }
  | { type: "NEW_DAILY"; plant?: string }
  | { type: "NEW_ENDLESS"; difficulty: Difficulty; plant?: string }
  | { type: "RESTORE"; snap: ResumeSnapshot } // resume a persisted board
  | { type: "PAINT"; r: number; c: number } // swipe/drag → mark ✕
  | { type: "ERASE"; r: number; c: number } // swipe/drag from an ✕ → unmark
  | { type: "PLACE"; r: number; c: number } // double tap → place plant
  | { type: "TAP"; r: number; c: number } // single tap → toggle ✕ / clear
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "HINT" } // place the next row's solution cell, clearing conflicts
  | { type: "RETRY" } // after a fail: rebuild the same board, hearts/timer reset
  | { type: "REVIVE" } // paid: +1 heart, board kept exactly as it was
  | { type: "TICK" };

const UNLOCKED_KEY = "plantdoku:unlocked";
const ONBOARDED_KEY = "plantdoku:onboarded";
// Levels no longer keep a best time — the board showed it only on replays,
// which turned a re-solve into a time trial against yourself (see GameScreen's
// status row). Stars are the level's record now. This key is retained solely so
// `flushData` still clears the rows left behind on installs that predate the
// removal; nothing writes it.
const legacyLevelBestKey = (level: number) => `plantdoku:best:level:${level}`;
const DAILY_STREAK_KEY = "plantdoku:daily:streak";
const DAILY_LAST_KEY = "plantdoku:daily:last"; // date key of last completed daily
const DAILY_LOG_KEY = "plantdoku:daily:log"; // JSON {dateKey: bestSeconds}
const ENDLESS_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const endlessBestKey = (d: Difficulty) => `plantdoku:best:endless:${d}`;
const STARS_KEY = "plantdoku:stars"; // JSON {level: bestStars 1..3}
const RESUME_KEY = "plantdoku:resume"; // JSON ResumeSnapshot of a live board
const SOUND_KEY = "plantdoku:sound"; // "0" when SFX are muted (default: on)
const NOTIF_KEY = "plantdoku:notifications"; // "0" when reminders off (default: on)
const COINS_KEY = "plantdoku:coins"; // integer balance (see game/economy.ts)

const emptyGrid = (size: number): CellState[][] =>
  Array.from({ length: size }, () => new Array<CellState>(size).fill("empty"));

const cloneGrid = (g: CellState[][]): CellState[][] => g.map((row) => row.slice());

function placedCoords(states: CellState[][]): Coord[] {
  const out: Coord[] = [];
  states.forEach((row, r) =>
    row.forEach((s, c) => {
      if (s === "placed") out.push([r, c]);
    }),
  );
  return out;
}

/** Placed cells that aren't on their row's solution cell. Always empty in
 *  practice — a wrong plant is never kept — but it keeps `solved` keyed off
 *  the board itself rather than trusting that invariant. */
function wrongCells(grid: CellState[][], solution: number[]): Set<string> {
  const bad = new Set<string>();
  grid.forEach((row, r) =>
    row.forEach((s, c) => {
      if (s === "placed" && solution[r] !== c) bad.add(cellKey(r, c));
    }),
  );
  return bad;
}

/** Drop red-✕ flags whose cell is no longer ✕-marked (erased, tapped off,
 *  reset), so clearing the mark clears the red with it. */
function liveMistakes(grid: CellState[][], mistakes: Set<string>): Set<string> {
  const live = new Set<string>();
  for (const key of mistakes) {
    const [r, c] = key.split(",").map(Number);
    if (grid[r]?.[c] === "marked") live.add(key);
  }
  return live;
}

/** Push the current board onto the undo stack and recompute solved / placed
 *  count for `grid`. `mistakes` defaults to carrying the current set forward. */
function settle(
  state: GameState,
  grid: CellState[][],
  started: boolean,
  mistakes: Set<string> = state.mistakes,
): GameState {
  const placed = placedCoords(grid);
  // Only correct plants are ever kept, so a full board is the unique solution.
  const solved = isSolved(
    placed.length,
    state.puzzle.size,
    wrongCells(grid, state.puzzle.solution).size,
  );
  return {
    ...state,
    states: grid,
    history: [...state.history, { states: state.states, mistakes: state.mistakes }],
    mistakes: liveMistakes(grid, mistakes),
    placedCount: placed.length,
    solved,
    started,
  };
}

function blankState(
  mode: GameState["mode"],
  level: number,
  dailyKey: string | null,
  endlessDifficulty: Difficulty | null,
  puzzle: Puzzle,
  plant = puzzle.plant,
): GameState {
  return {
    mode,
    level,
    dailyKey,
    endlessDifficulty,
    puzzle,
    plant,
    states: emptyGrid(puzzle.size),
    history: [],
    mistakes: new Set(),
    placedCount: 0,
    seconds: 0,
    started: false,
    solved: false,
    hearts: MAX_HEARTS,
    failed: false,
    hintsUsed: 0,
  };
}

function freshState(level: number, plant?: string): GameState {
  const { difficulty, seed } = getLevel(level);
  return blankState(
    "level",
    level,
    null,
    null,
    generatePuzzle(difficulty, seed),
    plant,
  );
}

function freshDailyState(plant?: string): GameState {
  const key = todayKey();
  const puzzle = generatePuzzle(DAILY_DIFFICULTY, dailySeed(key));
  return blankState("daily", 0, key, null, puzzle, plant);
}

function freshEndlessState(difficulty: Difficulty, plant?: string): GameState {
  // Unseeded -> a fresh random board every time.
  return blankState(
    "endless",
    0,
    null,
    difficulty,
    generatePuzzle(difficulty),
    plant,
  );
}

/**
 * The species a new board is planted with: **the card the player is working
 * toward** (`nextCard`), so the board they are solving, the win flourish and
 * the "<Card> unlocked!" hero are all the same plant when the solve crosses
 * that milestone. Returns undefined once the collection is complete — there is
 * no next card, so the board falls back to the puzzle's own seeded pick, which
 * keeps some variety instead of pinning every post-152★ game to one legendary.
 *
 * Player state, hence here and not in the (pure, seed-deterministic) generator.
 */
function boardPlant(totalStars: number): string | undefined {
  return nextCard(totalStars)?.plantId;
}

/** Serialise the live board for the resume slot (null when there's nothing
 *  worth saving: untouched, wiped back to blank by Reset, already won, or
 *  already lost). */
function toSnapshot(state: GameState): ResumeSnapshot | null {
  if (!state.started || state.solved || state.failed) return null;
  if (state.states.every((row) => row.every((s) => s === "empty"))) return null;
  return {
    v: RESUME_VERSION,
    mode: state.mode,
    level: state.level,
    dailyKey: state.dailyKey,
    endlessDifficulty: state.endlessDifficulty,
    puzzle: state.puzzle,
    plant: state.plant,
    states: state.states,
    mistakes: [...state.mistakes],
    seconds: state.seconds,
    hearts: state.hearts,
    hintsUsed: state.hintsUsed,
    updatedAt: Date.now(),
  };
}

/** Sanity-check a stored snapshot. Anything off (old schema, wrong board
 *  shape, a finished or lost board, yesterday's daily) is dropped rather than
 *  restored — a bad resume is worse than no resume. */
function validSnapshot(snap: ResumeSnapshot | undefined): boolean {
  if (!snap || snap.v !== RESUME_VERSION || !snap.puzzle) return false;
  if (typeof snap.plant !== "string") return false;
  const { size, solution, regions } = snap.puzzle;
  if (!Array.isArray(solution) || solution.length !== size) return false;
  if (!Array.isArray(regions) || regions.length !== size) return false;
  if (!Array.isArray(snap.states) || snap.states.length !== size) return false;
  if (snap.states.some((row) => !Array.isArray(row) || row.length !== size))
    return false;
  if (!(snap.hearts > 0) || !(snap.hearts <= MAX_HEARTS)) return false;
  // A complete board would re-fire the win path (stars, unlocks, cards) on
  // restore, so only a genuinely mid-solve board is resumable.
  if (placedCoords(snap.states).length >= size) return false;
  if (snap.mode === "level" && (snap.level < 1 || snap.level > LEVEL_COUNT))
    return false;
  // Yesterday's daily is a different puzzle now — let it go.
  if (snap.mode === "daily" && snap.dailyKey !== todayKey()) return false;
  if (snap.mode === "endless" && !snap.endlessDifficulty) return false;
  return true;
}

/** Read the stored slot map, keeping only the entries that still check out. */
function parseSlots(raw: string): ResumeSlots {
  let parsed: ResumeSlots;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const out: ResumeSlots = {};
  for (const mode of ["level", "daily", "endless"] as const) {
    const snap = parsed[mode];
    if (validSnapshot(snap) && snap?.mode === mode) out[mode] = snap;
  }
  return out;
}

/** The UI-facing shape of a saved board (the Continue card's contents). */
function resumeSummary(snap: ResumeSnapshot | null | undefined) {
  if (!snap) return null;
  return {
    mode: snap.mode,
    level: snap.level,
    dailyKey: snap.dailyKey,
    difficulty: snap.endlessDifficulty,
    placed: placedCoords(snap.states).length,
    size: snap.puzzle.size,
    seconds: snap.seconds,
    hearts: snap.hearts,
  };
}

/** The most recently touched saved board — what "Continue" means on Home. */
function newestSlot(slots: ResumeSlots): ResumeSnapshot | null {
  return (
    Object.values(slots).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    )[0] ?? null
  );
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return freshState(action.level, action.plant);

    case "NEW_DAILY":
      return freshDailyState(action.plant);

    case "NEW_ENDLESS":
      return freshEndlessState(action.difficulty, action.plant);

    // Resume a persisted board: the clock picks up where it stopped, hearts
    // and hints carry over, the undo stack starts empty (not persisted).
    case "RESTORE": {
      const { snap } = action;
      const base = blankState(
        snap.mode,
        snap.level,
        snap.dailyKey,
        snap.endlessDifficulty,
        snap.puzzle,
        snap.plant,
      );
      return {
        ...base,
        states: snap.states,
        mistakes: liveMistakes(snap.states, new Set(snap.mistakes)),
        placedCount: placedCoords(snap.states).length,
        seconds: snap.seconds,
        started: true,
        hearts: snap.hearts,
        hintsUsed: snap.hintsUsed,
      };
    }

    case "TICK":
      return state.started && !state.solved && !state.failed
        ? { ...state, seconds: state.seconds + 1 }
        : state;

    // Swipe/drag: paint an ✕ on an empty cell (never overwrites a plant).
    case "PAINT": {
      if (state.solved || state.failed) return state;
      const { r, c } = action;
      if (state.states[r][c] !== "empty") return state;
      const grid = cloneGrid(state.states);
      grid[r][c] = "marked";
      return settle(state, grid, true);
    }

    // Swipe/drag starting on an ✕: unmark ✕ cells (never touches plants).
    case "ERASE": {
      if (state.solved || state.failed) return state;
      const { r, c } = action;
      if (state.states[r][c] !== "marked") return state;
      const grid = cloneGrid(state.states);
      grid[r][c] = "empty";
      return settle(state, grid, true);
    }

    // Double tap: try to plant (replaces an ✕; idempotent if already placed).
    // A wrong cell doesn't keep the plant — the cell turns into a *red* ✕
    // (it's now known-bad) and costs a heart; the last heart fails the board.
    // Re-tapping a red ✕ is a no-op, so one slip can't drain hearts twice.
    // A placement never ✕s anything else for the player — every other
    // elimination (cluster, row, column, no-touch) is theirs to mark.
    case "PLACE": {
      if (state.solved || state.failed) return state;
      const { r, c } = action;
      if (state.states[r][c] === "placed") return state;
      if (state.mistakes.has(cellKey(r, c))) return state;
      const grid = cloneGrid(state.states);
      if (state.puzzle.solution[r] === c) {
        grid[r][c] = "placed";
        return settle(state, grid, true);
      }
      grid[r][c] = "marked";
      const next = settle(
        state,
        grid,
        true,
        new Set(state.mistakes).add(cellKey(r, c)),
      );
      const hearts = state.hearts - 1;
      return { ...next, hearts, failed: hearts <= 0 };
    }

    // Single tap: toggle ✕ on an empty cell, otherwise clear the cell.
    case "TAP": {
      if (state.solved || state.failed) return state;
      const { r, c } = action;
      const cur = state.states[r][c];
      const grid = cloneGrid(state.states);
      grid[r][c] = cur === "empty" ? "marked" : "empty";
      return settle(state, grid, true);
    }

    case "UNDO": {
      // Undo never refunds a spent heart (so it can't be used to probe cells).
      if (state.failed || state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      const placed = placedCoords(prev.states);
      return {
        ...state,
        states: prev.states,
        history: state.history.slice(0, -1),
        mistakes: prev.mistakes,
        placedCount: placed.length,
        solved: isSolved(
          placed.length,
          state.puzzle.size,
          wrongCells(prev.states, state.puzzle.solution).size,
        ),
      };
    }

    case "RESET":
      return {
        ...settle(state, emptyGrid(state.puzzle.size), state.started, new Set()),
        history: [],
      };

    // Paid revive (see game/economy.ts): the exact opposite of RETRY — one
    // heart back and *nothing else touched*, because continuing the solve you
    // were losing is the entire thing being bought. The coins are debited by
    // the `revive()` wrapper; the reducer owns no currency.
    //
    // `history: []` is load-bearing, not tidiness. UNDO is guarded by
    // `state.failed`, so clearing `failed` re-arms it — and `mistakes` rides
    // inside each `Snapshot`, so an undo would step back past the fatal
    // placement and erase the red ✕ the player just paid 500 coins to survive.
    // RESTORE starts with a clean stack for the same reason.
    //
    // The fatal cell stays "marked" and stays in `mistakes`, which PLACE
    // already no-ops on — so the freshly bought heart can't be spent re-tapping
    // the cell that took the last one.
    case "REVIVE":
      if (!state.failed) return state;
      return { ...state, hearts: 1, failed: false, history: [] };

    // After a fail: same puzzle (and same plant), blank board, hearts + timer
    // reset.
    case "RETRY":
      return blankState(
        state.mode,
        state.level,
        state.dailyKey,
        state.endlessDifficulty,
        state.puzzle,
        state.plant,
      );

    // Places the first still-open row's true solution cell (overwriting an ✕
    // there, red or not — placed plants are all correct, so nothing can
    // conflict with it).
    case "HINT": {
      if (state.solved || state.failed) return state;
      const { solution, size } = state.puzzle;
      let target = -1;
      for (let r = 0; r < size; r++) {
        if (state.states[r][solution[r]] !== "placed") {
          target = r;
          break;
        }
      }
      if (target === -1) return state;
      const grid = cloneGrid(state.states);
      grid[target][solution[target]] = "placed";
      const next = settle(state, grid, true);
      return { ...next, hintsUsed: state.hintsUsed + 1 };
    }

    default:
      return state;
  }
}

export function useGame(initialLevel = 1) {
  const [state, dispatch] = useReducer(reducer, initialLevel, freshState);
  // Highest level the player may attempt (LEVEL_COUNT + 1 = all complete).
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  // Whether the first-play tutorial has been completed (or dismissed).
  const [onboarded, setOnboarded] = useState(false);
  // Sound-effects toggle (defaults on; persisted as "0" when muted).
  const [soundOn, setSoundOnState] = useState(true);
  // Local-reminder toggle (defaults on as a preference; actual delivery is
  // still gated by the OS permission, requested when the player enables it).
  const [notifsOn, setNotifsOnState] = useState(true);
  // Daily-puzzle progress: current streak, last completed date, time log.
  const [daily, setDaily] = useState<{
    streak: number;
    last: string | null;
    log: Record<string, number>;
  }>({ streak: 0, last: null, log: {} });
  // Endless-mode best times, one per difficulty.
  const [endlessBests, setEndlessBests] = useState<
    Partial<Record<Difficulty, number>>
  >({});
  // Best star rating per level (1..3).
  const [starsByLevel, setStarsByLevel] = useState<Record<number, number>>({});
  // Stars earned by the solve currently on screen (level mode only).
  const [solveStars, setSolveStars] = useState<number | null>(null);
  // Plant cards whose star milestone was crossed by the solve on screen.
  const [newCards, setNewCards] = useState<PlantCard[]>([]);
  // Coin balance (see game/economy.ts) and the coins paid by the solve on
  // screen, so the win overlay can show "+20".
  const [coins, setCoins] = useState(STARTING_COINS);
  const [coinsEarned, setCoinsEarned] = useState(0);
  // Set when the solve on screen reached a chest level, so the win card can
  // celebrate it separately from the ordinary per-level payout.
  const [milestone, setMilestone] = useState<{
    level: number;
    coins: number;
  } | null>(null);
  // Mirrors `coins` for the callbacks and effects below (same reason as
  // `stateRef`/`slotsRef`): a solve award and a revive spend can land in the
  // same tick, and reading stale state would silently mint or eat coins.
  const coinsRef = useRef(coins);
  // Saved mid-solve boards, one per mode (drives the Home "Continue" card).
  const [slots, setSlots] = useState<ResumeSlots>({});

  // Load saved progression + best times once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const keys = [
        UNLOCKED_KEY,
        ONBOARDED_KEY,
        DAILY_STREAK_KEY,
        DAILY_LAST_KEY,
        DAILY_LOG_KEY,
        STARS_KEY,
        RESUME_KEY,
        SOUND_KEY,
        NOTIF_KEY,
        COINS_KEY,
        ...ENDLESS_DIFFICULTIES.map(endlessBestKey),
      ];
      const pairs = await AsyncStorage.multiGet(keys);
      if (!alive) return;
      const eb: Partial<Record<Difficulty, number>> = {};
      let streak = 0;
      let last: string | null = null;
      let log: Record<string, number> = {};
      for (const [key, v] of pairs) {
        if (v == null) continue;
        const endless = ENDLESS_DIFFICULTIES.find((d) => key === endlessBestKey(d));
        if (endless) {
          eb[endless] = parseInt(v, 10);
        } else if (key === UNLOCKED_KEY) {
          setUnlockedLevel(Math.min(parseInt(v, 10), LEVEL_COUNT + 1));
        } else if (key === ONBOARDED_KEY) {
          setOnboarded(true);
        } else if (key === DAILY_STREAK_KEY) {
          streak = parseInt(v, 10) || 0;
        } else if (key === DAILY_LAST_KEY) {
          last = v;
        } else if (key === DAILY_LOG_KEY) {
          try {
            log = JSON.parse(v);
          } catch {}
        } else if (key === STARS_KEY) {
          try {
            setStarsByLevel(JSON.parse(v));
          } catch {}
        } else if (key === RESUME_KEY) {
          const parsed = parseSlots(v);
          setSlots(parsed);
          // Snapshots we refuse to restore (stale daily, old schema) would
          // otherwise sit in storage forever.
          if (Object.keys(parsed).length === 0) {
            AsyncStorage.removeItem(RESUME_KEY).catch(() => {});
          } else {
            AsyncStorage.setItem(RESUME_KEY, JSON.stringify(parsed)).catch(() => {});
          }
        } else if (key === SOUND_KEY) {
          const on = v !== "0";
          setSoundOnState(on);
          audio.setMuted(!on);
        } else if (key === NOTIF_KEY) {
          setNotifsOnState(v !== "0");
        } else if (key === COINS_KEY) {
          // A corrupt/absent value must not poison the balance with NaN —
          // canAfford guards it too, but the HUD would render "NaN".
          const n = parseInt(v, 10);
          const bal = Number.isFinite(n) && n >= 0 ? n : STARTING_COINS;
          setCoins(bal);
          coinsRef.current = bal;
        }
      }
      setEndlessBests(eb);
      setDaily({ streak, last, log });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // --- Coins ---------------------------------------------------------------
  // Both helpers go through `coinsRef` rather than `coins`, so the balance is
  // always computed from the freshest value (see the ref's comment above), and
  // write straight through to storage like every other scalar here.
  const setBalance = (next: number) => {
    const bal = Math.max(0, Math.round(next));
    coinsRef.current = bal;
    setCoins(bal);
    AsyncStorage.setItem(COINS_KEY, String(bal)).catch(() => {});
    return bal;
  };

  /** Pay out `n` coins. Returns the new balance. */
  const awardCoins = (n: number, reason: string) => {
    if (!(n > 0)) return coinsRef.current;
    const bal = setBalance(coinsRef.current + n);
    analytics.track("coins_earned", { amount: n, reason, balance: bal });
    return bal;
  };

  /** Debit `n` coins if affordable. Returns false (and changes nothing) if not. */
  const spendCoins = (n: number, reason: string) => {
    if (!canAfford(coinsRef.current, n)) return false;
    const bal = setBalance(coinsRef.current - n);
    analytics.track("coins_spent", { amount: n, reason, balance: bal });
    return true;
  };

  // --- Resume slot ---------------------------------------------------------
  // The live board is written to storage on every move (moves are far rarer
  // than ticks, so this stays cheap) and, via `saveResume`, when the player
  // leaves the board or the app goes to the background — which is what keeps
  // the elapsed time from lagging behind a long think. Solving or failing
  // clears the slot: there's nothing left to come back to.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Mirrors `slots` for the callbacks below, which must read the freshest map
  // without waiting for a re-render (two saves can land in one tick).
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // In-memory state updates immediately; the disk write is debounced so a
  // drag painting a dozen ✕s is one write, not a dozen. Anything that must
  // survive right now (leaving the board, backgrounding, starting a new game)
  // passes `immediate` — and backgrounding always follows a move, so the
  // worst case for a hard kill is losing the last half-second of marks.
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Writes whatever is in `slotsRef` — reading the ref (not a captured value)
  // is what lets the debounce timer and the unmount flush stay correct.
  const persistSlots = () => {
    flushTimer.current = null;
    const cur = slotsRef.current;
    if (Object.keys(cur).length === 0) {
      AsyncStorage.removeItem(RESUME_KEY).catch(() => {});
    } else {
      AsyncStorage.setItem(RESUME_KEY, JSON.stringify(cur)).catch(() => {});
    }
  };

  // Never drop a pending write on teardown.
  useEffect(() => () => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      persistSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only
  }, []);

  const writeSlots = (next: ResumeSlots, immediate = false) => {
    slotsRef.current = next;
    setSlots(next);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    if (immediate) persistSlots();
    else flushTimer.current = setTimeout(persistSlots, 500);
  };

  /** Store (or, with null, drop) the saved board for one mode. */
  const putSlot = (
    mode: GameState["mode"],
    snap: ResumeSnapshot | null,
    immediate = false,
  ) => {
    const cur = slotsRef.current;
    if (!snap && !cur[mode]) return; // nothing to clear — skip the write
    const next = { ...cur };
    if (snap) next[mode] = snap;
    else delete next[mode];
    writeSlots(next, immediate);
  };

  // Capture the board as it stands right now (used on exit / backgrounding).
  const saveResume = () => {
    const snap = toSnapshot(stateRef.current);
    if (snap) putSlot(snap.mode, snap, true);
  };

  useEffect(() => {
    const snap = toSnapshot(state);
    // `started` only flips on the first move, so a fresh board writes nothing
    // until it's actually been touched. Once it has, a board that stops being
    // resumable — won, lost, or wiped blank by Reset — clears its slot.
    if (snap) putSlot(snap.mode, snap);
    else if (state.started) putSlot(state.mode, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- board moves only; `seconds` deliberately excluded (see saveResume)
  }, [state.states, state.mistakes, state.hearts, state.hintsUsed, state.solved, state.failed, state.puzzle]);

  // Tick the timer once per second while a solve is in progress. The pause
  // flag (a ref so the interval never restarts) freezes the clock while the
  // first-play tutorial holds the board, so the forced walkthrough doesn't
  // eat into Level 1's par time.
  const timerPaused = useRef(false);
  const running = state.started && !state.solved && !state.failed;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!timerPaused.current) dispatch({ type: "TICK" });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // On the rising edge of "solved": record best time + unlock the next level
  // (level mode), or extend the streak + log the time (daily mode).
  const wasSolved = useRef(false);
  const [newBest, setNewBest] = useState(false);
  useEffect(() => {
    if (!state.solved) {
      setNewBest(false);
    } else if (!wasSolved.current) {
      const { mode, level, seconds, dailyKey, endlessDifficulty } = state;
      if (mode === "endless" && endlessDifficulty) {
        const prev = endlessBests[endlessDifficulty];
        const improved = prev == null || seconds < prev;
        setNewBest(improved);
        if (improved) {
          setEndlessBests((b) => ({ ...b, [endlessDifficulty]: seconds }));
          AsyncStorage.setItem(
            endlessBestKey(endlessDifficulty),
            String(seconds),
          ).catch(() => {});
        }
        // Endless has no first-clear notion, so every solve pays — this is the
        // mode's first actual reward, and the ongoing half of the faucet.
        const paid = endlessCoins(endlessDifficulty);
        awardCoins(paid, "endless");
        setCoinsEarned(paid);
        analytics.track("endless_completed", {
          mode: "endless",
          difficulty: endlessDifficulty,
          size: state.puzzle.size,
          tier: state.puzzle.tier,
          seconds,
          hints: state.hintsUsed,
          hearts_left: state.hearts,
          new_best: improved,
        });
      } else if (mode === "daily" && dailyKey) {
        const prev = daily.log[dailyKey];
        const improved = prev == null || seconds < prev;
        setNewBest(improved);
        // The streak advances only on the first completion of a date; replays
        // can still improve the logged time.
        const firstToday = daily.last !== dailyKey;
        const streak = firstToday
          ? isConsecutive(daily.last, dailyKey)
            ? daily.streak + 1
            : 1
          : daily.streak;
        const log = improved ? { ...daily.log, [dailyKey]: seconds } : daily.log;
        setDaily({ streak, last: dailyKey, log });
        // Coins follow the streak's own rule: only the first solve of a date
        // pays, so replaying today can't be farmed.
        const paid = firstToday ? dailyCoins(streak) : 0;
        awardCoins(paid, "daily");
        setCoinsEarned(paid);
        AsyncStorage.multiSet([
          [DAILY_STREAK_KEY, String(streak)],
          [DAILY_LAST_KEY, dailyKey],
          [DAILY_LOG_KEY, JSON.stringify(log)],
        ]).catch(() => {});
        analytics.track("daily_completed", {
          mode: "daily",
          size: state.puzzle.size,
          tier: state.puzzle.tier,
          seconds,
          streak,
          hints: state.hintsUsed,
          hearts_left: state.hearts,
          new_best: improved,
          replay: !firstToday,
        });
      } else {
        // Level mode keeps no best time — stars are the record. `seconds` still
        // rides along on the event and still decides the under-par star.
        const stars = starsFor(
          seconds,
          state.hintsUsed,
          state.puzzle.size,
          state.puzzle.tier,
        );
        setSolveStars(stars);
        const prevBest = starsByLevel[level] ?? 0;
        analytics.track("level_completed", {
          mode: "level",
          level,
          difficulty: getLevel(level).difficulty,
          size: state.puzzle.size,
          tier: state.puzzle.tier,
          seconds,
          hints: state.hintsUsed,
          hearts_left: state.hearts,
          stars,
        });
        if (stars > prevBest) {
          const next = { ...starsByLevel, [level]: stars };
          setStarsByLevel(next);
          AsyncStorage.setItem(STARS_KEY, JSON.stringify(next)).catch(() => {});
          // A better rating raises the star total — see if it crossed any
          // card milestones (the win overlay celebrates these).
          const prevTotal = Object.values(starsByLevel).reduce(
            (a, b) => a + b,
            0,
          );
          const newTotal = prevTotal + stars - prevBest;
          const unlocked = newlyUnlocked(prevTotal, newTotal);
          setNewCards(unlocked);
          for (const card of unlocked) {
            analytics.track("card_unlocked", {
              card_id: card.plantId,
              rarity: card.rarity,
              total_stars: newTotal,
            });
          }
        }
        // `level === unlockedLevel` *is* the first-clear test, so coins ride
        // the same gate the unlock does: replaying a cleared level pays
        // nothing, which is what stops level 1 being a coin mine.
        if (level === unlockedLevel) {
          awardCoins(COINS_PER_LEVEL, "level");
          setCoinsEarned(COINS_PER_LEVEL);
          const next = level + 1; // may be LEVEL_COUNT + 1 = "all complete"
          // The chest on the Home path pays when its level is *reached* — i.e.
          // now, as `next` becomes playable — which is the same moment the path
          // stops drawing it. Clearing level 9 collects the level-10 chest.
          const bonus = next <= LEVEL_COUNT ? milestoneCoins(next) : 0;
          if (bonus > 0) {
            awardCoins(bonus, "milestone");
            setMilestone({ level: next, coins: bonus });
            analytics.track("milestone_reached", { level: next, coins: bonus });
          } else {
            setMilestone(null);
          }
          setUnlockedLevel(next);
          AsyncStorage.setItem(UNLOCKED_KEY, String(next)).catch(() => {});
        } else {
          setCoinsEarned(0);
          setMilestone(null);
        }
      }
    }
    if (!state.solved) {
      setSolveStars(null);
      setNewCards([]);
      setCoinsEarned(0);
      setMilestone(null);
    }
    wasSolved.current = state.solved;
  }, [state.solved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Difficulty of the board currently on screen, for analytics context.
  const boardDifficulty = (): Difficulty =>
    state.mode === "level"
      ? getLevel(state.level).difficulty
      : state.mode === "endless" && state.endlessDifficulty
        ? state.endlessDifficulty
        : DAILY_DIFFICULTY;

  // On the rising edge of "failed": the board ran out of hearts (game over).
  const wasFailed = useRef(false);
  useEffect(() => {
    if (state.failed && !wasFailed.current) {
      analytics.track("board_failed", {
        mode: state.mode,
        level: state.level || undefined,
        difficulty: boardDifficulty(),
        size: state.puzzle.size,
        tier: state.puzzle.tier,
        placed: state.placedCount,
        seconds: state.seconds,
        hints: state.hintsUsed,
      });
    }
    wasFailed.current = state.failed;
  }, [state.failed]); // eslint-disable-line react-hooks/exhaustive-deps

  // A drop in hearts means a plant was placed on a wrong cell. (New boards
  // reset hearts up to MAX, which never triggers this.)
  const prevHearts = useRef(state.hearts);
  useEffect(() => {
    if (state.hearts < prevHearts.current) {
      analytics.track("mistake_made", {
        mode: state.mode,
        level: state.level || undefined,
        difficulty: boardDifficulty(),
        hearts_left: state.hearts,
      });
    }
    prevHearts.current = state.hearts;
  }, [state.hearts]); // eslint-disable-line react-hooks/exhaustive-deps

  // A streak only counts while it is alive: last completion today or yesterday.
  const tk = todayKey();
  const dailyDoneToday = daily.last === tk;
  const dailyStreak =
    daily.last && (dailyDoneToday || isConsecutive(daily.last, tk))
      ? daily.streak
      : 0;

  const totalStars = Object.values(starsByLevel).reduce((a, b) => a + b, 0);

  // The snapshot the local reminders are scheduled from. Rebuilt each render so
  // both the sync effect and the exposed `syncReminders` use current progress.
  const reminderPlan = () => {
    const nc = nextCard(totalStars);
    return {
      enabled: notifsOn,
      dailyDoneToday,
      streak: dailyStreak,
      starsToNextCard: nc ? nc.stars - totalStars : undefined,
    };
  };

  // Reschedule the reminder set whenever an input to it changes: the toggle,
  // solving today's daily, the streak length, or crossing a star total (which
  // moves the "next card" hook). `sync` cancels + reschedules and no-ops without
  // OS permission, so this is always safe. (App.tsx also re-syncs on every
  // foreground so the re-engage timers only fire during real absences.)
  useEffect(() => {
    void notifications.sync(reminderPlan());
    if (notifsOn) void notifications.registerForPush();
  }, [notifsOn, dailyDoneToday, dailyStreak, totalStars]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    running,
    maxHearts: MAX_HEARTS,
    newBest,
    unlockedLevel,
    allComplete: unlockedLevel > LEVEL_COUNT,
    hasNextLevel: state.mode === "level" && state.level < LEVEL_COUNT,
    // Daily and endless only — level mode has no best time (see
    // `legacyLevelBestKey`).
    bestSeconds:
      state.mode === "daily"
        ? state.dailyKey
          ? daily.log[state.dailyKey]
          : undefined
        : state.mode === "endless"
          ? state.endlessDifficulty
            ? endlessBests[state.endlessDifficulty]
            : undefined
          : undefined,
    dailyDoneToday,
    dailyStreak,
    dailyLog: daily.log,
    starsByLevel,
    totalStars,
    solveStars,
    newCards,
    // Coin balance, what the solve on screen paid, and the revive price — the
    // UI never imports the economy constants itself.
    coins,
    coinsEarned,
    milestone,
    reviveCost: REVIVE_COST,
    canRevive: canAfford(coins, REVIVE_COST),
    canUndo: state.history.length > 0,
    undoDepth: state.history.length,
    hintsUsed: state.hintsUsed,
    // The most recent saved board, as the Home "Continue" card needs it.
    resume: resumeSummary(newestSlot(slots)),
    // Per-mode summaries, so Play / the Daily tab can pick their own board up
    // instead of starting over on top of it.
    resumeSlots: {
      level: resumeSummary(slots.level),
      daily: resumeSummary(slots.daily),
      endless: resumeSummary(slots.endless),
    },
    // Pick a saved board back up (clock, hearts and hints included).
    // Defaults to the most recent one — the Continue card's board.
    resumeGame: (mode?: GameState["mode"]) => {
      const snap = mode ? slots[mode] : newestSlot(slots);
      if (!snap) return;
      analytics.track("board_resumed", {
        mode: snap.mode,
        level: snap.level || undefined,
        placed: placedCoords(snap.states).length,
        size: snap.puzzle.size,
        seconds: snap.seconds,
      });
      dispatch({ type: "RESTORE", snap });
    },
    // Persist the board as it stands. Called when the player leaves it and
    // when the app backgrounds, so the saved clock matches what they saw.
    saveResume,
    // Leaving an unfinished board — the retention event the funnel is missing.
    // (Called by GameScreen on its way out; no-ops on a won/lost board.)
    abandonBoard: () => {
      const s = stateRef.current;
      if (!s.started || s.solved || s.failed) return;
      saveResume();
      analytics.track("board_abandoned", {
        mode: s.mode,
        level: s.level || undefined,
        difficulty: boardDifficulty(),
        size: s.puzzle.size,
        tier: s.puzzle.tier,
        placed: s.placedCount,
        progress: Math.round((s.placedCount / s.puzzle.size) * 100),
        seconds: s.seconds,
        hints: s.hintsUsed,
        hearts_left: s.hearts,
      });
    },
    onboarded,
    soundOn,
    setSoundOn: (on: boolean) => {
      setSoundOnState(on);
      audio.setMuted(!on);
      AsyncStorage.setItem(SOUND_KEY, on ? "1" : "0").catch(() => {});
    },
    notifsOn,
    // Flip the reminder preference. Turning on requests OS permission first;
    // if the player denies it, the toggle falls back off (reminders can't be
    // delivered). The sync effect handles (re)scheduling on the state change.
    setNotifsOn: async (on: boolean) => {
      if (on) {
        const status = await notifications.getPermissionStatus();
        let granted = status === "granted";
        if (status === "undetermined") {
          granted = await notifications.requestPermission();
          analytics.track("notification_permission", { granted });
        }
        if (!granted) {
          setNotifsOnState(false);
          AsyncStorage.setItem(NOTIF_KEY, "0").catch(() => {});
          return;
        }
      }
      setNotifsOnState(on);
      AsyncStorage.setItem(NOTIF_KEY, on ? "1" : "0").catch(() => {});
      analytics.track(on ? "notifications_enabled" : "notifications_disabled");
    },
    // Re-derive + reschedule reminders from current progress. App.tsx calls
    // this when the app returns to the foreground so the re-engage timers reset.
    syncReminders: () => void notifications.sync(reminderPlan()),
    completeOnboarding: () => {
      analytics.track("onboarding_completed");
      setOnboarded(true);
      AsyncStorage.setItem(ONBOARDED_KEY, "1").catch(() => {});
    },
    // Freeze/unfreeze the solve clock (tutorial only — see the TICK interval).
    setTimerPaused: (paused: boolean) => {
      timerPaused.current = paused;
    },
    // Wipe all persisted data (progress, best times, tutorial flag) and
    // restart from level 1 as a brand-new player.
    flushData: () => {
      const keys = [
        UNLOCKED_KEY,
        ONBOARDED_KEY,
        DAILY_STREAK_KEY,
        DAILY_LAST_KEY,
        DAILY_LOG_KEY,
        STARS_KEY,
        RESUME_KEY,
        SOUND_KEY,
        NOTIF_KEY,
        COINS_KEY,
        ...ENDLESS_DIFFICULTIES.map(endlessBestKey),
        // Not written any more; cleared so a flush still tidies old installs.
        ...Array.from({ length: LEVEL_COUNT }, (_, i) => legacyLevelBestKey(i + 1)),
      ];
      analytics.track("data_flushed");
      // Sever the analytics person so the fresh-start player is a new identity.
      analytics.reset();
      AsyncStorage.multiRemove(keys).catch(() => {});
      setUnlockedLevel(1);
      setEndlessBests({});
      setStarsByLevel({});
      setCoins(STARTING_COINS);
      coinsRef.current = STARTING_COINS;
      setCoinsEarned(0);
      setOnboarded(false);
      setSoundOnState(true);
      audio.setMuted(false);
      setNotifsOnState(true);
      notifications.cancelAll();
      setDaily({ streak: 0, last: null, log: {} });
      writeSlots({}, true);
      // Star total is 0 again, so the board goes back to the first card's plant
      // (passed literally: the state update above isn't visible here yet).
      dispatch({ type: "NEW_GAME", level: 1, plant: boardPlant(0) });
    },
    // Starting a new board supersedes the saved board *of that mode* only.
    newGame: (level: number) => {
      analytics.track("game_started", {
        mode: "level",
        level,
        difficulty: getLevel(level).difficulty,
      });
      putSlot("level", null, true);
      dispatch({ type: "NEW_GAME", level, plant: boardPlant(totalStars) });
    },
    newDaily: () => {
      analytics.track("game_started", {
        mode: "daily",
        difficulty: DAILY_DIFFICULTY,
      });
      putSlot("daily", null, true);
      dispatch({ type: "NEW_DAILY", plant: boardPlant(totalStars) });
    },
    newEndless: (difficulty: Difficulty) => {
      analytics.track("game_started", { mode: "endless", difficulty });
      putSlot("endless", null, true);
      dispatch({
        type: "NEW_ENDLESS",
        difficulty,
        plant: boardPlant(totalStars),
      });
    },
    paint: (r: number, c: number) => dispatch({ type: "PAINT", r, c }),
    erase: (r: number, c: number) => dispatch({ type: "ERASE", r, c }),
    place: (r: number, c: number) => dispatch({ type: "PLACE", r, c }),
    tap: (r: number, c: number) => dispatch({ type: "TAP", r, c }),
    undo: () => {
      if (state.history.length > 0 && !state.failed) {
        analytics.track("undo_used", {
          mode: state.mode,
          level: state.level || undefined,
        });
      }
      dispatch({ type: "UNDO" });
    },
    reset: () => {
      analytics.track("board_reset", {
        mode: state.mode,
        level: state.level || undefined,
      });
      dispatch({ type: "RESET" });
    },
    retry: () => {
      analytics.track("board_retried", {
        mode: state.mode,
        level: state.level || undefined,
        difficulty: boardDifficulty(),
      });
      dispatch({ type: "RETRY" });
    },
    // Buy the board back: debit the coins, then hand one heart to the reducer
    // (which keeps every plant, ✕ and second exactly as they were). The spend
    // happens first and gates the dispatch, so a failed payment can never
    // revive for free. Returns false when the player can't afford it, so the
    // UI can no-op instead of guessing at the balance itself.
    revive: () => {
      if (!stateRef.current.failed) return false;
      if (!spendCoins(REVIVE_COST, "revive")) return false;
      const s = stateRef.current;
      analytics.track("revive_used", {
        mode: s.mode,
        level: s.level || undefined,
        difficulty: boardDifficulty(),
        seconds: s.seconds,
        progress: Math.round((100 * s.placedCount) / s.puzzle.size),
        cost: REVIVE_COST,
        balance_after: coinsRef.current,
      });
      dispatch({ type: "REVIVE" });
      return true;
    },
    // Places the next row's plant directly (one undoable step).
    requestHint: () => {
      if (state.solved || state.failed) return;
      analytics.track("hint_requested", {
        mode: state.mode,
        level: state.level || undefined,
      });
      dispatch({ type: "HINT" });
    },
  };
}

export type Game = ReturnType<typeof useGame>;
