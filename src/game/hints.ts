// Teaching hints: instead of revealing a solution cell, surface the NEXT
// human-style deduction the player is missing, with an explanation and the
// cells it concerns. Built on the logic solver's recorded deduction steps —
// every level/daily board is logic-solvable, so the replayed chain always
// reaches the full solution regardless of what the player has done so far
// (wrong player marks can't poison it: the chain is derived from the board
// alone).
//
// Pure data + logic only — headless-safe (imported by tests under plain Node).

import { rateBoard, type DeductionStep } from "./logicSolver";
import type { CellState, Coord, Puzzle } from "./types";

export interface Hint {
  /** "place": double-tap `cell`. "mark": ✕ every cell in `cells`. */
  action: "place" | "mark";
  cell: Coord | null;
  cells: Coord[];
  message: string;
}

const UNIT_NAME = { row: "row", col: "column", region: "cluster" } as const;
const UNIT_PLURAL = { row: "rows", col: "columns", region: "clusters" } as const;

function singleMessage(step: Extract<DeductionStep, { kind: "single" }>): string {
  if (step.unit === "region")
    return "The highlighted cluster has only one cell left where its plant can go — double-tap to plant it.";
  return `${step.unit === "row" ? "Row" : "Column"} ${step.index + 1} has only one cell left where a plant can go — double-tap to plant it.`;
}

function stepToHint(step: DeductionStep, pending: Coord[]): Hint {
  switch (step.kind) {
    case "single":
      return {
        action: "place",
        cell: step.cell,
        cells: [step.cell],
        message: singleMessage(step),
      };
    case "confine": {
      const line = `${UNIT_NAME[step.line]} ${step.index + 1}`;
      return {
        action: "mark",
        cell: null,
        cells: pending,
        message: `One cluster fits only inside ${line}, so it owns that ${UNIT_NAME[step.line]}'s plant — mark ✕ on the highlighted cells.`,
      };
    }
    case "claim": {
      const line = `${UNIT_NAME[step.line]} ${step.index + 1}`;
      return {
        action: "mark",
        cell: null,
        cells: pending,
        message: `${step.line === "row" ? "Row" : "Column"} ${step.index + 1}'s plant must come from a single cluster, so that cluster can't reach outside ${line} — mark ✕ on the highlighted cells.`,
      };
    }
    case "subset": {
      const k = step.sources.length;
      return {
        action: "mark",
        cell: null,
        cells: pending,
        message: `${k} ${UNIT_PLURAL[step.source]} fit exactly into ${k} ${UNIT_PLURAL[step.target]}, using them up — nothing else can go there. Mark ✕ on the highlighted cells.`,
      };
    }
  }
}

/**
 * The first deduction in the board's logic chain whose conclusion is not yet
 * on the player's grid, or null if the chain has nothing new to teach (then
 * fall back to revealing a solution cell).
 */
export function nextHint(puzzle: Puzzle, states: CellState[][]): Hint | null {
  const steps: DeductionStep[] = [];
  rateBoard(puzzle.regions, puzzle.size, undefined, (s) => steps.push(s));

  for (const step of steps) {
    if (step.kind === "single") {
      const [r, c] = step.cell;
      if (states[r][c] !== "placed") return stepToHint(step, [step.cell]);
    } else {
      const pending = step.eliminated.filter(([r, c]) => states[r][c] === "empty");
      if (pending.length > 0) return stepToHint(step, pending);
    }
  }
  return null;
}
