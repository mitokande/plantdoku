# 🌱 Plantdoku

A plant-themed logic puzzle for mobile, built with **React Native (Expo + TypeScript)**.

It's the LinkedIn **"Queens"** puzzle (a Star Battle variant) reskinned with plants.
The board is an _n×n_ grid split into _n_ coloured **clusters**, each owned by one
plant type. Place one plant marker so that there is:

- exactly **one per row**,
- exactly **one per column**,
- exactly **one per cluster** (plant type), and
- **no two markers touching** — not even diagonally.

Every generated board has exactly **one** solution.

## Play

```bash
npm install
npm start          # then press i / a, or scan the QR with Expo Go
# or:
npm run web        # play in a browser
npm run ios
npm run android
```

**Controls**

- **Tap** a cell to mark an ✕ "no" note (tap it again to clear).
- **Swipe / drag** across cells to paint ✕ marks quickly.
- **Double-tap** a cell to place a plant.

Rule violations highlight in red as you play. Use **Hint** to reveal one correct
cell, **Undo** / **Reset** to backtrack, and the timer tracks your best time per
difficulty (Easy 6×6 · Medium 8×8 · Hard 9×9).

## How it works

The game core is pure, framework-free TypeScript so it can be tested under plain
Node:

| File | Role |
| --- | --- |
| `src/game/generator.ts` | Builds a board with a **guaranteed unique** solution |
| `src/game/solver.ts` | Backtracking solver — `countSolutions`, `findSolution`, `enumerateSolutions` |
| `src/game/validator.ts` | Live conflict detection + win check |
| `src/game/palette.ts` | Plant ids + region colours (shared, headless-safe) |
| `src/game/plants.ts` | Maps plant ids → bundled sprites (RN only) |
| `src/state/useGame.ts` | Reducer hook: board, tap-cycle, undo/reset/hint, timer, best times |

**Generation.** With one marker per row & column, two markers can only ever touch
diagonally between consecutive rows, so the no-adjacency rule reduces to
`|col(r) − col(r+1)| ≥ 2`. The generator:

1. places a random valid solution (a permutation satisfying that constraint),
2. flood-grows _n_ connected clusters, one seeded on each solution cell, then
3. **repairs to uniqueness**: while another solution exists, it moves one of that
   alternate's non-owner cells into a neighbouring cluster — the intended
   solution only ever sits on cluster "owner" cells, so it stays valid while the
   alternate loses its one-per-cluster property and dies.

This yields unique boards in a few milliseconds for every supported size.

## Tests

```bash
npm test    # generates many puzzles per size and asserts uniqueness,
            # connected regions, and validator agreement
```

## Sprite assets

The 17 plant sprites in `assets/plants/` are sliced from the original sprite
sheet by `scripts/slice_sprites.py` (Python + Pillow + SciPy). It knocks out the
dark background with a flood fill, then extracts each plant as a connected
component (so neighbours never bleed into a crop). To regenerate:

```bash
SHEET=/path/to/sheet.png python3 scripts/slice_sprites.py
```
