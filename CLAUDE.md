# CLAUDE.md — Plantdoku

Project context for Claude Code. Plantdoku is a plant-themed logic puzzle —
LinkedIn **"Queens"** (a Star Battle variant) reskinned with plant sprites.

## What the game is

An _n×n_ grid is partitioned into _n_ connected **clusters**, each owned by one
plant type / colour. The player places one plant marker so there is:

- exactly **one per row**,
- exactly **one per column**,
- exactly **one per cluster**, and
- **no two markers touching** — including diagonally.

Every generated board has exactly **one** solution.

Difficulties: **Easy 6×6 · Medium 8×8 · Hard 9×9**.

## Tech stack

- **Expo SDK 54** (managed) + **TypeScript**, React Native **0.81.5**, React **19.1.0**.
  - NOTE: the project was originally scaffolded on SDK 56 and then **downgraded
    to 54** via `npx expo install --fix`. Keep deps aligned to SDK 54 — use
    `npx expo install <pkg>` (not bare `npm install`) for any RN/Expo package.
- State: plain React `useReducer` hook (`src/state/useGame.ts`). No Redux.
- Persistence: `@react-native-async-storage/async-storage` (best times).
- Feedback: `expo-haptics` (loaded lazily, skipped on web).
- Web support is installed (`react-native-web`, `react-dom`, `@expo/metro-runtime`)
  so the app also runs in a browser and can be smoke-tested headlessly.

## Commands

```bash
npm install
npm start            # Expo dev server (Expo Go / simulators)
npm run web          # run in a browser
npm test             # headless game-core tests (tsx src/game/runTests.ts)
npm run typecheck    # tsc --noEmit
# Regenerate sprites from the source sheet:
SHEET=/path/to/sheet.png python3 scripts/slice_sprites.py
```

## Interaction model (current)

Handled by a single board-level `PanResponder` in `src/components/Board.tsx`:

- **Tap** a cell → toggle an **✕** "no" note (tap again to clear).
- **Swipe / drag** across cells → paint **✕** marks quickly.
- **Double-tap** a cell → place a **plant** (the cluster's plant, revealed on placement).

Discrimination logic: movement past `DRAG_THRESHOLD` (10px) becomes a drag
(paint). Otherwise a `DOUBLE_MS` (260ms) window separates single-tap (toggle ✕,
fired on a timer) from double-tap (place) — so a double-tap never leaves a stray
✕ behind.

**Cell → touch mapping uses `nativeEvent.locationX/locationY`** (relative to the
board frame, which is the touch target via `pointerEvents="box-only"`). Do NOT
switch back to `pageX/pageY` + `measureInWindow` — that caused a vertical offset
on real devices because the status-bar / safe-area inset differs between the two
coordinate systems.

## Visual decisions

- Cells show **only their cluster colour** by default — **no plant preview**.
  The plant `Image` (+ gold ring) renders **only when `state === "placed"`**.
- **No bold cluster borders.** Clusters read by colour + a faint 1px hairline
  grid (`Cell` draws a subtle right/bottom border only).
- Rule violations tint the offending cells red (`theme.dangerTile`).
- Win: custom `Confetti` (Animated, dependency-free) + result card with time /
  best / "New best".
- Theme: "garden at dusk" — deep green ground so pastel clusters pop
  (`src/theme.ts`).

## Architecture / file map

Game core is **pure TypeScript, framework-free**, so it runs under plain Node
(tests) — keep it free of `react-native` / `require('*.png')` imports.

```
src/game/
  types.ts       Difficulty, CellState, Puzzle, DIFFICULTIES (6/8/9)
  palette.ts     PLANT_IDS (17) + REGION_COLORS — pure data, headless-safe
  plants.ts      id -> require(png) sprite map — RN ONLY (do not import in core)
  generator.ts   generatePuzzle(size) -> unique-solution Puzzle
  solver.ts      countSolutions / enumerateSolutions / findSolution
  validator.ts   findConflicts (row/col/cluster/adjacency) + isSolved
  runTests.ts    headless correctness tests (npm test)
src/state/useGame.ts   reducer hook: PAINT/PLACE/TAP, undo/reset/hint, timer, best
src/components/
  Board.tsx      n×n grid + PanResponder gestures (the gesture brain)
  Cell.tsx       display-only cell (colour, ✕, placed plant + ring)
  GameScreen.tsx header, stats, board, controls, win overlay; wires haptics
  DifficultyMenu.tsx, Button.tsx, WinOverlay.tsx, Confetti.tsx
src/theme.ts, src/format.ts
App.tsx          menu <-> game screen switch
scripts/slice_sprites.py   sprite-sheet slicer (PIL + SciPy)
```

### Generator (the crux — guarantees a unique solution)

With one marker per row & column, two markers can only touch diagonally between
consecutive rows, so no-adjacency reduces to `|col(r) − col(r+1)| ≥ 2`. Steps:

1. random valid solution (permutation satisfying that constraint),
2. flood-grow `size` connected clusters, one seeded per solution cell
   (growth weighted uniformly over the frontier),
3. **repair to uniqueness**: while another solution exists, move one of that
   alternate's **non-owner** cells into a neighbouring cluster. The intended
   solution only sits on cluster "owner" cells, so it stays valid while the
   alternate loses its one-per-cluster property and dies.

Pure random growth almost never yields unique boards at 8–9; the repair step is
what makes it reliable (≈100% at 6/8, ≈99.5% at 9, generated in <60ms; the
outer loop retries on the rare miss).

## Sprite assets

`scripts/slice_sprites.py` slices the source sheet (1254×1254, 17 plants: rows of
4/4/4/5) into transparent PNGs in `assets/plants/`. It flood-fills the dark
background to transparent, then extracts each plant as a **connected component**
(via `scipy.ndimage.label`) so neighbouring sprites never bleed into a crop. The
17 ids in `palette.ts` must match the output filenames.

## Verification approach (no device needed)

1. `npm test` — generates many puzzles/size, asserts unique solution, connected
   clusters, one solution cell per cluster, validator agreement.
2. `npm run typecheck`.
3. `npx expo export -p web` (or `-p android`) — full Metro bundle resolves all
   imports + the 17 assets.
4. For visual/interaction checks, the web build was driven with headless
   Chromium (Playwright) to screenshot the menu, board, gestures, and win
   screen, asserting zero page errors. (Playwright lives outside the repo.)

## Status

Feature-complete and verified: generator + unique solutions, gesture model,
live conflict highlighting, hint, undo/reset, timer + best-time persistence,
win animation, difficulty menu. Runs on iOS/Android (Expo Go) and web.

## Conventions / gotchas

- Touch math: **locationX/locationY only** (see Interaction model).
- Keep `src/game/*` (except `plants.ts`) free of RN/asset imports so `npm test`
  works under Node.
- After editing `palette.ts` plant ids, keep `plants.ts` and the slicer in sync.
- Use `npx expo install` for Expo/RN packages to stay on SDK 54-compatible versions.
```
