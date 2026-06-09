// Game state hook: board, tap-cycle, undo/reset/hint, timer, win + best times.

import { useEffect, useReducer, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { generatePuzzle } from "../game/generator";
import { findConflicts, isSolved } from "../game/validator";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type CellState,
  type Coord,
  type Difficulty,
  type Puzzle,
} from "../game/types";

interface GameState {
  difficulty: Difficulty;
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
  | { type: "NEW_GAME"; difficulty: Difficulty }
  | { type: "PAINT"; r: number; c: number } // swipe/drag → mark ✕
  | { type: "PLACE"; r: number; c: number } // double tap → place plant
  | { type: "TAP"; r: number; c: number } // single tap → toggle ✕ / clear
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "HINT" }
  | { type: "TICK" };

const bestKey = (d: Difficulty) => `plantdoku:best:${d}`;

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

function freshState(difficulty: Difficulty): GameState {
  const size = DIFFICULTIES[difficulty].size;
  return {
    difficulty,
    puzzle: generatePuzzle(size),
    states: emptyGrid(size),
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
      return freshState(action.difficulty);

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

export function useGame(initial: Difficulty = "easy") {
  const [state, dispatch] = useReducer(reducer, initial, freshState);
  const [bestTimes, setBestTimes] = useState<Partial<Record<Difficulty, number>>>(
    {},
  );

  // Load saved best times once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const pairs = await Promise.all(
        DIFFICULTY_ORDER.map(
          async (d) => [d, await AsyncStorage.getItem(bestKey(d))] as const,
        ),
      );
      if (!alive) return;
      const bt: Partial<Record<Difficulty, number>> = {};
      for (const [d, v] of pairs) if (v != null) bt[d] = parseInt(v, 10);
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

  // Record a new best time on the rising edge of "solved".
  const wasSolved = useRef(false);
  const [newBest, setNewBest] = useState(false);
  useEffect(() => {
    if (!state.solved) {
      setNewBest(false);
    } else if (!wasSolved.current) {
      const d = state.difficulty;
      const prev = bestTimes[d];
      const improved = prev == null || state.seconds < prev;
      setNewBest(improved);
      if (improved) {
        setBestTimes((b) => ({ ...b, [d]: state.seconds }));
        AsyncStorage.setItem(bestKey(d), String(state.seconds)).catch(() => {});
      }
    }
    wasSolved.current = state.solved;
  }, [state.solved]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    running,
    newBest,
    bestTimes,
    bestSeconds: bestTimes[state.difficulty],
    canUndo: state.history.length > 0,
    newGame: (d: Difficulty) => dispatch({ type: "NEW_GAME", difficulty: d }),
    paint: (r: number, c: number) => dispatch({ type: "PAINT", r, c }),
    place: (r: number, c: number) => dispatch({ type: "PLACE", r, c }),
    tap: (r: number, c: number) => dispatch({ type: "TAP", r, c }),
    undo: () => dispatch({ type: "UNDO" }),
    reset: () => dispatch({ type: "RESET" }),
    hint: () => dispatch({ type: "HINT" }),
  };
}

export type Game = ReturnType<typeof useGame>;
