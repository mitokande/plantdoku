// Game state hook: board, tap-cycle, undo/reset/hint, timer, win + level
// progression (unlocked level + per-level best times persisted).

import { useEffect, useReducer, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { generatePuzzle } from "../game/generator";
import { getLevel, LEVEL_COUNT } from "../game/levels";
import { findConflicts, isSolved } from "../game/validator";
import type { CellState, Coord, Puzzle } from "../game/types";

interface GameState {
  level: number;
  puzzle: Puzzle;
  states: CellState[][];
  history: CellState[][][];
  conflicts: Set<string>;
  placedCount: number;
  seconds: number;
  started: boolean;
  solved: boolean;
}

type Action =
  | { type: "NEW_GAME"; level: number }
  | { type: "PAINT"; r: number; c: number } // swipe/drag → mark ✕
  | { type: "ERASE"; r: number; c: number } // swipe/drag from an ✕ → unmark
  | { type: "PLACE"; r: number; c: number } // double tap → place plant
  | { type: "TAP"; r: number; c: number } // single tap → toggle ✕ / clear
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "HINT" }
  | { type: "TICK" };

const UNLOCKED_KEY = "plantdoku:unlocked";
const ONBOARDED_KEY = "plantdoku:onboarded";
const bestKey = (level: number) => `plantdoku:best:level:${level}`;

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

/** Recompute conflicts / solved / placed count for a grid. */
function settle(state: GameState, grid: CellState[][], started: boolean): GameState {
  const placed = placedCoords(grid);
  const conflicts = findConflicts(placed, state.puzzle.regions);
  const solved = isSolved(placed.length, state.puzzle.size, conflicts.size);
  return {
    ...state,
    states: grid,
    history: [...state.history, state.states],
    conflicts,
    placedCount: placed.length,
    solved,
    started,
  };
}

function freshState(level: number): GameState {
  const { difficulty, seed } = getLevel(level);
  const puzzle = generatePuzzle(difficulty, seed);
  return {
    level,
    puzzle,
    states: emptyGrid(puzzle.size),
    history: [],
    conflicts: new Set(),
    placedCount: 0,
    seconds: 0,
    started: false,
    solved: false,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return freshState(action.level);

    case "TICK":
      return state.started && !state.solved
        ? { ...state, seconds: state.seconds + 1 }
        : state;

    // Swipe/drag: paint an ✕ on an empty cell (never overwrites a plant).
    case "PAINT": {
      if (state.solved) return state;
      const { r, c } = action;
      if (state.states[r][c] !== "empty") return state;
      const grid = cloneGrid(state.states);
      grid[r][c] = "marked";
      return settle(state, grid, true);
    }

    // Swipe/drag starting on an ✕: unmark ✕ cells (never touches plants).
    case "ERASE": {
      if (state.solved) return state;
      const { r, c } = action;
      if (state.states[r][c] !== "marked") return state;
      const grid = cloneGrid(state.states);
      grid[r][c] = "empty";
      return settle(state, grid, true);
    }

    // Double tap: place a plant (replaces an ✕; idempotent if already placed).
    case "PLACE": {
      if (state.solved) return state;
      const { r, c } = action;
      if (state.states[r][c] === "placed") return state;
      const grid = cloneGrid(state.states);
      grid[r][c] = "placed";
      return settle(state, grid, true);
    }

    // Single tap: toggle ✕ on an empty cell, otherwise clear the cell.
    case "TAP": {
      if (state.solved) return state;
      const { r, c } = action;
      const cur = state.states[r][c];
      const grid = cloneGrid(state.states);
      grid[r][c] = cur === "empty" ? "marked" : "empty";
      return settle(state, grid, true);
    }

    case "UNDO": {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      const placed = placedCoords(prev);
      const conflicts = findConflicts(placed, state.puzzle.regions);
      return {
        ...state,
        states: prev,
        history: state.history.slice(0, -1),
        conflicts,
        placedCount: placed.length,
        solved: isSolved(placed.length, state.puzzle.size, conflicts.size),
      };
    }

    case "RESET":
      return settle(state, emptyGrid(state.puzzle.size), state.started);

    case "HINT": {
      if (state.solved) return state;
      const { solution, regions, size } = state.puzzle;
      let target = -1;
      for (let r = 0; r < size; r++) {
        if (state.states[r][solution[r]] !== "placed") {
          target = r;
          break;
        }
      }
      if (target === -1) return state;
      const c = solution[target];
      const grid = cloneGrid(state.states);
      // Clear any placed markers that would conflict with the revealed cell.
      for (let rr = 0; rr < size; rr++) {
        for (let cc = 0; cc < size; cc++) {
          if (grid[rr][cc] !== "placed") continue;
          const sameRow = rr === target;
          const sameCol = cc === c;
          const sameRegion = regions[rr][cc] === regions[target][c];
          const adjacent = Math.abs(rr - target) <= 1 && Math.abs(cc - c) <= 1;
          if (sameRow || sameCol || sameRegion || adjacent) grid[rr][cc] = "empty";
        }
      }
      grid[target][c] = "placed";
      return settle(state, grid, true);
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

  // Load saved progression + best times once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const keys = [
        UNLOCKED_KEY,
        ONBOARDED_KEY,
        ...Array.from({ length: LEVEL_COUNT }, (_, i) => bestKey(i + 1)),
      ];
      const pairs = await AsyncStorage.multiGet(keys);
      if (!alive) return;
      const bt: Record<number, number> = {};
      for (const [key, v] of pairs) {
        if (v == null) continue;
        if (key === UNLOCKED_KEY) {
          setUnlockedLevel(Math.min(parseInt(v, 10), LEVEL_COUNT + 1));
        } else if (key === ONBOARDED_KEY) {
          setOnboarded(true);
        } else {
          bt[parseInt(key.slice(key.lastIndexOf(":") + 1), 10)] = parseInt(v, 10);
        }
      }
      setBestTimes(bt);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Tick the timer once per second while a solve is in progress.
  const running = state.started && !state.solved;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [running]);

  // On the rising edge of "solved": record best time + unlock the next level.
  const wasSolved = useRef(false);
  const [newBest, setNewBest] = useState(false);
  useEffect(() => {
    if (!state.solved) {
      setNewBest(false);
    } else if (!wasSolved.current) {
      const { level, seconds } = state;
      const prev = bestTimes[level];
      const improved = prev == null || seconds < prev;
      setNewBest(improved);
      if (improved) {
        setBestTimes((b) => ({ ...b, [level]: seconds }));
        AsyncStorage.setItem(bestKey(level), String(seconds)).catch(() => {});
      }
      if (level === unlockedLevel) {
        const next = level + 1; // may be LEVEL_COUNT + 1 = "all complete"
        setUnlockedLevel(next);
        AsyncStorage.setItem(UNLOCKED_KEY, String(next)).catch(() => {});
      }
    }
    wasSolved.current = state.solved;
  }, [state.solved]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    running,
    newBest,
    unlockedLevel,
    allComplete: unlockedLevel > LEVEL_COUNT,
    hasNextLevel: state.level < LEVEL_COUNT,
    bestSeconds: bestTimes[state.level],
    canUndo: state.history.length > 0,
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
        ...Array.from({ length: LEVEL_COUNT }, (_, i) => bestKey(i + 1)),
      ];
      AsyncStorage.multiRemove(keys).catch(() => {});
      setUnlockedLevel(1);
      setBestTimes({});
      setOnboarded(false);
      dispatch({ type: "NEW_GAME", level: 1 });
    },
    newGame: (level: number) => dispatch({ type: "NEW_GAME", level }),
    paint: (r: number, c: number) => dispatch({ type: "PAINT", r, c }),
    erase: (r: number, c: number) => dispatch({ type: "ERASE", r, c }),
    place: (r: number, c: number) => dispatch({ type: "PLACE", r, c }),
    tap: (r: number, c: number) => dispatch({ type: "TAP", r, c }),
    undo: () => dispatch({ type: "UNDO" }),
    reset: () => dispatch({ type: "RESET" }),
    hint: () => dispatch({ type: "HINT" }),
  };
}

export type Game = ReturnType<typeof useGame>;
