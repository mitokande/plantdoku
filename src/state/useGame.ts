// Game state hook: board, tap-cycle, undo/reset/hint, timer, win + level
// progression (unlocked level + per-level best times persisted).

import { useEffect, useReducer, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { newlyUnlocked, type PlantCard } from "../game/cards";
import {
  DAILY_DIFFICULTY,
  dailySeed,
  isConsecutive,
  todayKey,
} from "../game/daily";
import { generatePuzzle } from "../game/generator";
import { nextHint, type Hint } from "../game/hints";
import { getLevel, LEVEL_COUNT } from "../game/levels";
import { starsFor } from "../game/stars";
import { cellKey, isSolved } from "../game/validator";
import type { CellState, Coord, Difficulty, Puzzle } from "../game/types";

// Hearts (lives): placing a plant on a cell that isn't its solution cell costs
// one; losing all of them fails the board (locks it until the player retries).
const MAX_HEARTS = 3;

interface GameState {
  mode: "level" | "daily" | "endless";
  level: number; // 0 outside level mode
  dailyKey: string | null; // the date the daily board was started for
  endlessDifficulty: Difficulty | null; // set in endless mode
  puzzle: Puzzle;
  states: CellState[][];
  history: CellState[][][];
  mistakes: Set<string>; // placed cells that aren't on the solution cell
  placedCount: number;
  seconds: number;
  started: boolean;
  solved: boolean;
  hearts: number; // lives left; 0 -> failed
  failed: boolean; // ran out of hearts on this board
  hintsUsed: number; // hint requests this board (any kind); gates the 2nd star
}

type Action =
  | { type: "NEW_GAME"; level: number }
  | { type: "NEW_DAILY" }
  | { type: "NEW_ENDLESS"; difficulty: Difficulty }
  | { type: "PAINT"; r: number; c: number } // swipe/drag → mark ✕
  | { type: "ERASE"; r: number; c: number } // swipe/drag from an ✕ → unmark
  | { type: "PLACE"; r: number; c: number } // double tap → place plant
  | { type: "TAP"; r: number; c: number } // single tap → toggle ✕ / clear
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "HINT" } // legacy reveal-a-cell (fallback when no teaching hint)
  | { type: "COUNT_HINT" } // a hint was requested (stars bookkeeping only)
  | { type: "APPLY_HINT"; hint: Hint } // apply a teaching hint's conclusion
  | { type: "RETRY" } // after a fail: rebuild the same board, hearts/timer reset
  | { type: "TICK" };

const UNLOCKED_KEY = "plantdoku:unlocked";
const ONBOARDED_KEY = "plantdoku:onboarded";
const bestKey = (level: number) => `plantdoku:best:level:${level}`;
const DAILY_STREAK_KEY = "plantdoku:daily:streak";
const DAILY_LAST_KEY = "plantdoku:daily:last"; // date key of last completed daily
const DAILY_LOG_KEY = "plantdoku:daily:log"; // JSON {dateKey: bestSeconds}
const ENDLESS_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const endlessBestKey = (d: Difficulty) => `plantdoku:best:endless:${d}`;
const STARS_KEY = "plantdoku:stars"; // JSON {level: bestStars 1..3}

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

/** Placed cells that aren't on their row's solution cell (i.e. wrong guesses). */
function wrongCells(grid: CellState[][], solution: number[]): Set<string> {
  const bad = new Set<string>();
  grid.forEach((row, r) =>
    row.forEach((s, c) => {
      if (s === "placed" && solution[r] !== c) bad.add(cellKey(r, c));
    }),
  );
  return bad;
}

/** Recompute mistakes / solved / placed count for a grid. */
function settle(state: GameState, grid: CellState[][], started: boolean): GameState {
  const placed = placedCoords(grid);
  const mistakes = wrongCells(grid, state.puzzle.solution);
  // A full board with no wrong cells is necessarily the unique solution.
  const solved = isSolved(placed.length, state.puzzle.size, mistakes.size);
  return {
    ...state,
    states: grid,
    history: [...state.history, state.states],
    mistakes,
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
): GameState {
  return {
    mode,
    level,
    dailyKey,
    endlessDifficulty,
    puzzle,
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

function freshState(level: number): GameState {
  const { difficulty, seed } = getLevel(level);
  return blankState("level", level, null, null, generatePuzzle(difficulty, seed));
}

function freshDailyState(): GameState {
  const key = todayKey();
  const puzzle = generatePuzzle(DAILY_DIFFICULTY, dailySeed(key));
  return blankState("daily", 0, key, null, puzzle);
}

function freshEndlessState(difficulty: Difficulty): GameState {
  // Unseeded -> a fresh random board every time.
  return blankState("endless", 0, null, difficulty, generatePuzzle(difficulty));
}

/** Grid with (r,c) placed and any placed markers it would conflict with cleared. */
function placeClearingConflicts(
  state: GameState,
  r: number,
  c: number,
): CellState[][] {
  const { regions, size } = state.puzzle;
  const grid = cloneGrid(state.states);
  for (let rr = 0; rr < size; rr++) {
    for (let cc = 0; cc < size; cc++) {
      if (grid[rr][cc] !== "placed") continue;
      const sameRow = rr === r;
      const sameCol = cc === c;
      const sameRegion = regions[rr][cc] === regions[r][c];
      const adjacent = Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1;
      if (sameRow || sameCol || sameRegion || adjacent) grid[rr][cc] = "empty";
    }
  }
  grid[r][c] = "placed";
  return grid;
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return freshState(action.level);

    case "NEW_DAILY":
      return freshDailyState();

    case "NEW_ENDLESS":
      return freshEndlessState(action.difficulty);

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

    // Double tap: place a plant (replaces an ✕; idempotent if already placed).
    // A plant on the wrong cell stays put but flags red and costs a heart;
    // losing the last heart fails the board.
    case "PLACE": {
      if (state.solved || state.failed) return state;
      const { r, c } = action;
      if (state.states[r][c] === "placed") return state;
      const grid = cloneGrid(state.states);
      grid[r][c] = "placed";
      const next = settle(state, grid, true);
      if (state.puzzle.solution[r] === c) return next; // correct cell
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
      const placed = placedCoords(prev);
      const mistakes = wrongCells(prev, state.puzzle.solution);
      return {
        ...state,
        states: prev,
        history: state.history.slice(0, -1),
        mistakes,
        placedCount: placed.length,
        solved: isSolved(placed.length, state.puzzle.size, mistakes.size),
      };
    }

    case "RESET":
      return { ...settle(state, emptyGrid(state.puzzle.size), state.started), history: [] };

    // After a fail: same puzzle, blank board, hearts + timer reset.
    case "RETRY":
      return blankState(
        state.mode,
        state.level,
        state.dailyKey,
        state.endlessDifficulty,
        state.puzzle,
      );

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
      return settle(
        state,
        placeClearingConflicts(state, target, solution[target]),
        true,
      );
    }

    case "COUNT_HINT":
      return { ...state, hintsUsed: state.hintsUsed + 1 };

    // Apply a teaching hint's conclusion in one undoable step: place the
    // forced cell, or ✕ every cell the deduction eliminated.
    case "APPLY_HINT": {
      if (state.solved || state.failed) return state;
      const { hint } = action;
      if (hint.action === "place" && hint.cell) {
        return settle(
          state,
          placeClearingConflicts(state, hint.cell[0], hint.cell[1]),
          true,
        );
      }
      const grid = cloneGrid(state.states);
      let changed = false;
      for (const [r, c] of hint.cells) {
        if (grid[r][c] === "empty") {
          grid[r][c] = "marked";
          changed = true;
        }
      }
      return changed ? settle(state, grid, true) : state;
    }

    default:
      return state;
  }
}

export function useGame(initialLevel = 1) {
  const [state, dispatch] = useReducer(reducer, initialLevel, freshState);
  // Highest level the player may attempt (LEVEL_COUNT + 1 = all complete).
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [bestTimes, setBestTimes] = useState<Record<number, number>>({});
  // Whether the first-play tutorial has been completed (or dismissed).
  const [onboarded, setOnboarded] = useState(false);
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
  // The teaching hint currently shown on the board, if any.
  const [activeHint, setActiveHint] = useState<Hint | null>(null);
  // Stars earned by the solve currently on screen (level mode only).
  const [solveStars, setSolveStars] = useState<number | null>(null);
  // Plant cards whose star milestone was crossed by the solve on screen.
  const [newCards, setNewCards] = useState<PlantCard[]>([]);

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
        ...ENDLESS_DIFFICULTIES.map(endlessBestKey),
        ...Array.from({ length: LEVEL_COUNT }, (_, i) => bestKey(i + 1)),
      ];
      const pairs = await AsyncStorage.multiGet(keys);
      if (!alive) return;
      const bt: Record<number, number> = {};
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
        } else {
          bt[parseInt(key.slice(key.lastIndexOf(":") + 1), 10)] = parseInt(v, 10);
        }
      }
      setBestTimes(bt);
      setEndlessBests(eb);
      setDaily({ streak, last, log });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Tick the timer once per second while a solve is in progress.
  const running = state.started && !state.solved && !state.failed;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
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
        AsyncStorage.multiSet([
          [DAILY_STREAK_KEY, String(streak)],
          [DAILY_LAST_KEY, dailyKey],
          [DAILY_LOG_KEY, JSON.stringify(log)],
        ]).catch(() => {});
      } else {
        const prev = bestTimes[level];
        const improved = prev == null || seconds < prev;
        setNewBest(improved);
        if (improved) {
          setBestTimes((b) => ({ ...b, [level]: seconds }));
          AsyncStorage.setItem(bestKey(level), String(seconds)).catch(() => {});
        }
        const stars = starsFor(
          seconds,
          state.hintsUsed,
          state.puzzle.size,
          state.puzzle.tier,
        );
        setSolveStars(stars);
        const prevBest = starsByLevel[level] ?? 0;
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
          setNewCards(newlyUnlocked(prevTotal, prevTotal + stars - prevBest));
        }
        if (level === unlockedLevel) {
          const next = level + 1; // may be LEVEL_COUNT + 1 = "all complete"
          setUnlockedLevel(next);
          AsyncStorage.setItem(UNLOCKED_KEY, String(next)).catch(() => {});
        }
      }
    }
    if (!state.solved) {
      setSolveStars(null);
      setNewCards([]);
    }
    wasSolved.current = state.solved;
  }, [state.solved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any change to the grid invalidates the hint shown on it (applying the
  // hint changes the grid too, so this also cleans up after applyHint).
  useEffect(() => {
    setActiveHint(null);
  }, [state.states]);

  // A streak only counts while it is alive: last completion today or yesterday.
  const tk = todayKey();
  const dailyDoneToday = daily.last === tk;
  const dailyStreak =
    daily.last && (dailyDoneToday || isConsecutive(daily.last, tk))
      ? daily.streak
      : 0;

  return {
    ...state,
    running,
    maxHearts: MAX_HEARTS,
    newBest,
    unlockedLevel,
    allComplete: unlockedLevel > LEVEL_COUNT,
    hasNextLevel: state.mode === "level" && state.level < LEVEL_COUNT,
    bestSeconds:
      state.mode === "daily"
        ? state.dailyKey
          ? daily.log[state.dailyKey]
          : undefined
        : state.mode === "endless"
          ? state.endlessDifficulty
            ? endlessBests[state.endlessDifficulty]
            : undefined
          : bestTimes[state.level],
    dailyDoneToday,
    dailyStreak,
    dailyLog: daily.log,
    starsByLevel,
    totalStars: Object.values(starsByLevel).reduce((a, b) => a + b, 0),
    solveStars,
    newCards,
    activeHint,
    canUndo: state.history.length > 0,
    undoDepth: state.history.length,
    hintsUsed: state.hintsUsed,
    onboarded,
    completeOnboarding: () => {
      setOnboarded(true);
      AsyncStorage.setItem(ONBOARDED_KEY, "1").catch(() => {});
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
        ...ENDLESS_DIFFICULTIES.map(endlessBestKey),
        ...Array.from({ length: LEVEL_COUNT }, (_, i) => bestKey(i + 1)),
      ];
      AsyncStorage.multiRemove(keys).catch(() => {});
      setUnlockedLevel(1);
      setBestTimes({});
      setEndlessBests({});
      setStarsByLevel({});
      setOnboarded(false);
      setDaily({ streak: 0, last: null, log: {} });
      dispatch({ type: "NEW_GAME", level: 1 });
    },
    newGame: (level: number) => dispatch({ type: "NEW_GAME", level }),
    newDaily: () => dispatch({ type: "NEW_DAILY" }),
    newEndless: (difficulty: Difficulty) =>
      dispatch({ type: "NEW_ENDLESS", difficulty }),
    paint: (r: number, c: number) => dispatch({ type: "PAINT", r, c }),
    erase: (r: number, c: number) => dispatch({ type: "ERASE", r, c }),
    place: (r: number, c: number) => dispatch({ type: "PLACE", r, c }),
    tap: (r: number, c: number) => dispatch({ type: "TAP", r, c }),
    undo: () => dispatch({ type: "UNDO" }),
    reset: () => dispatch({ type: "RESET" }),
    retry: () => dispatch({ type: "RETRY" }),
    // First press: explain the next deduction (falls back to revealing a
    // solution cell if the chain has nothing new). Second press applies it.
    requestHint: () => {
      if (state.solved || state.failed) return;
      dispatch({ type: "COUNT_HINT" });
      const hint = nextHint(state.puzzle, state.states);
      if (hint) setActiveHint(hint);
      else dispatch({ type: "HINT" });
    },
    applyHint: () => {
      if (activeHint) dispatch({ type: "APPLY_HINT", hint: activeHint });
    },
    dismissHint: () => setActiveHint(null),
  };
}

export type Game = ReturnType<typeof useGame>;
