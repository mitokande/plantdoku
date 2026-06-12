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

Difficulties: **Easy 6×6 · Medium 8×8 · Hard 9×9** — each also gated by deduction
tier (see Generator), so every board is solvable by pure logic, no guessing.

**Progression is level-based** (no difficulty picker): 60 curated levels in
`src/game/levels.ts`, each `{difficulty, seed}` — generation is **seeded and
deterministic**, so every player gets the identical board for level N. Curve:
ramp with breathers (L1–8 easy, L9–19 medium with an easy breather at L12,
L20+ hard with medium breathers at L21/L25, finale L26–30), then a veteran
batch L31–60 (hard-leaning, medium breathers at L36/L40/L45/L50/L55).
Completing the highest unlocked level unlocks the next; after L60 the menu
shows "more levels coming soon". Seeds are minted offline by
`scripts/pick_level_seeds.ts` (`npx tsx`) from its CURVE array, which verifies
tier-band fit + reproducibility — levels are seed-scanned per index, so
appending to CURVE never changes earlier levels (the script prints the whole
LEVELS literal; diff L1–N against the shipped table before pasting).
**Endless mode**: menu card with Easy/Medium/Hard chips → unseeded random
board (`useGame.newEndless(difficulty)`, mode "endless"); win overlay offers
"New board"; per-difficulty best times persist (`plantdoku:best:endless:*`).
Locked until the player reaches level 15 (`ENDLESS_UNLOCK_LEVEL` in
`HomeScreen.tsx` — the card renders dimmed with a 🔒 until then).

**Teaching hints** (`src/game/hints.ts`): the Hint button explains the next
deduction instead of revealing a cell. `rateBoard` takes an optional step
recorder (must never change solver behaviour); `nextHint(puzzle, states)`
replays the recorded chain and returns the first step whose conclusion is
missing from the player's grid — `{action: "place"|"mark", cell, cells,
message}`. First Hint press shows the message (gold card replaces the hint
pill) + highlights cells (pulse ring for place, static outlines for mark);
the button becomes "Apply" which commits the conclusion as one undoable step.
Falls back to the legacy reveal-a-cell HINT when the chain has nothing new.
Tested by walking hints from an empty grid to a full solve on all 60 levels.

**Stars** (`src/game/stars.ts`): level mode only — ★ solved, +★ no hints,
+★ under par (par by size+tier). Best per level persists as JSON under
`plantdoku:stars`; win overlay shows the rating (+ what 3★ needs), menu Play
button shows the total. Any hint request (even just viewing) counts as a hint
used (`hintsUsed` in reducer state; survives RESET, cleared on new boards).
NOTE: changing the generator algorithm changes what every seed produces;
re-pick seeds if generator behaviour changes.

**Plant cards** (`src/game/cards.ts`, pure/headless-safe): collection meta on
top of stars — all 17 plants are collectible cards (name, rarity, flavor)
unlocked at total-star milestones (first at 1★, last legendary at 152★ of the
180★ max; thresholds strictly increasing, covered by runTests). No new
currency or storage: the collection is derived from `plantdoku:stars`, so
flushData resets it for free. `useGame` exposes `newCards` (milestones crossed
by the solve on screen — computed on the rising edge of solved when a level's
best stars improve); win overlay pops a "NEW CARD" reveal (or shows "N★ more
until your next card"). The meta is foregrounded hybrid-casual style: Home
has a gold-bordered showcase panel under Play (latest unlocks + next card as
a "?" silhouette + progress bar to its milestone) and the Cards tab
(`CardsScreen.tsx`) shows the full grid (locked cards are tinted silhouettes
with their ★ requirement; tapping any tile opens a trading-card inspect modal
— big sprite, rarity, flavor text, or the ★-to-go for locked cards).

**Daily puzzle** (`src/game/daily.ts`, pure/headless-safe): one shared medium
8×8 board per calendar date — seed = FNV-1a of the salted local date key, so
all players get the same board with no backend. Rolls over at local midnight.
Completing a daily extends a streak (consecutive days; replays don't re-count
but can improve the logged time); streak/last-date/time-log persist in
AsyncStorage (`plantdoku:daily:*`, wiped by flushData). `useGame` exposes
`mode` ("level" | "daily"), `newDaily()`, `dailyDoneToday`, `dailyStreak`,
`dailyLog`; the Daily tab (`DailyScreen.tsx`) hosts today's puzzle, the
streak and a solve-history list, win overlay swaps BEST→STREAK and Next→Share
(native share sheet). The date→seed mapping is a public contract pinned by a golden
test in runTests — do not change `dailySeed` (and see the generator NOTE
above: generator changes also change daily boards across app versions).

## Tech stack

- **Expo SDK 54** (managed) + **TypeScript**, React Native **0.81.5**, React **19.1.0**.
  - NOTE: the project was originally scaffolded on SDK 56 and then **downgraded
    to 54** via `npx expo install --fix`. Keep deps aligned to SDK 54 — use
    `npx expo install <pkg>` (not bare `npm install`) for any RN/Expo package.
- State: plain React `useReducer` hook (`src/state/useGame.ts`). No Redux.
- Persistence: `@react-native-async-storage/async-storage` (best times).
- Feedback: `expo-haptics` (loaded lazily, skipped on web).
- Visuals: `expo-linear-gradient` (gameplay-screen background).
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
- **Swipe / drag** across cells → paint **✕** marks quickly. If the drag
  **starts on an ✕-marked cell**, the whole drag **erases** ✕ marks instead
  (mode is fixed at drag start; plants are never affected either way).
- **Double-tap** a cell → place a **plant** (the cluster's plant, revealed on placement).

Discrimination logic: movement past `DRAG_THRESHOLD` (10px) becomes a drag
(paint). Otherwise a `DOUBLE_MS` (260ms) window separates single-tap (toggle ✕,
fired on a timer) from double-tap (place) — so a double-tap never leaves a stray
✕ behind.

**Cell → touch mapping**: the **grant** uses `nativeEvent.locationX/locationY`
(relative to the board frame, which is the touch target via
`pointerEvents="box-only"`); **moves** use grant point + `gestureState.dx/dy`.
Do NOT read `locationX/Y` on move events — once the finger leaves the board the
event target is whatever view it is over, so those local coordinates wrap back
into the grid (marking cells on the far side). And do NOT switch to
`pageX/pageY` + `measureInWindow` — that caused a vertical offset on real
devices because the status-bar / safe-area inset differs between the two
coordinate systems.

### Onboarding

First-ever play of Level 1 runs a 4-step interactive tutorial on the real board
(state machine in `GameScreen.tsx`, `TUTORIAL_STEPS`): goal text → forced
placement on the easy board's guaranteed **singleton cluster** (pulsing gold
ring via `Board`'s `highlight` prop; input locked to that one double-tap) →
mark-✕ teach (place blocked, advances at 3 ✕s) → free-play dismiss. The coach
card is `TutorialBubble.tsx` (replaces the hint pill while active);
Undo/Hint/Reset are disabled until the last step. Completion persists
`plantdoku:onboarded` (exposed by `useGame` as `onboarded` /
`completeOnboarding()`). A **"Help ?"** header button opens `HelpOverlay.tsx`
(rules + gestures) anytime.

## Visual decisions

- Cells are **rounded "stone" tiles** with a small gap between them (the
  board's wooden frame shows through), a faint static bevel (top highlight /
  bottom shade) echoing the chunky 3D buttons, and a **faint embossed glyph**
  of the cluster's plant (the sprite tinted to a darker shade of the cell
  colour at low opacity). The full-colour sprite still renders **only when
  `state === "placed"`** (no gold ring anymore); ✕-marked cells get a light
  dim scrim so eliminated cells recede.
- **No bold cluster borders.** Clusters read by colour + glyph; tile gaps are
  uniform everywhere.
- The board sits in a **wooden frame** (`theme.wood*` browns: dark border,
  light inner "carved" ring — no texture assets), and `GameScreen` lays the
  whole screen on a vertical `expo-linear-gradient` (lighter glade behind the
  board, darker top/bottom). Undo/Hint buttons carry gold info badges
  (undoable-move count / hints used).
- Region tints (`palette.ts` `REGION_COLORS`) are **muted botanical** tones —
  earthy, low-saturation garden colours, light enough for the dark ✕ mark and
  sprites to stay readable.
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
  levels.ts      LEVELS: 30 curated {difficulty, seed} + getLevel — pure data
  daily.ts       daily puzzle: date key -> seed (FNV-1a, golden-pinned) + streak
                 date math — pure data, headless-safe
  hints.ts       nextHint: first recorded solver deduction missing from the
                 player's grid, with a human explanation — headless-safe
  stars.ts       par times (size+tier) + starsFor — headless-safe
  cards.ts       plant-card collection: 17 cards + star milestones, unlock
                 helpers — headless-safe
  palette.ts     PLANT_IDS (17) + REGION_COLORS — pure data, headless-safe
  plants.ts      id -> require(png) sprite map — RN ONLY (do not import in core)
  generator.ts   generatePuzzle(difficulty, seed?) -> logic-solvable, tier-gated
                 Puzzle; seeded = deterministic (mulberry32 behind all randomness)
  solver.ts      countSolutions / enumerateSolutions / findSolution (backtracking)
  logicSolver.ts rateBoard -> {solved, tier 1..3, unsound} human-style propagation
  validator.ts   findConflicts (row/col/cluster/adjacency) + isSolved
  runTests.ts    headless correctness tests (npm test)
src/state/useGame.ts   reducer hook: PAINT/ERASE/PLACE/TAP, undo/reset/hint,
                 timer, unlocked level + per-level best + onboarded (AsyncStorage)
src/components/
  Board.tsx      n×n grid + PanResponder gestures (the gesture brain) + highlight ring
  Cell.tsx       display-only cell (colour, ✕, placed plant + ring)
  GameScreen.tsx header (Level N, Help ?), stats, board, controls, win overlay;
                 haptics; first-play tutorial state machine
  HomeScreen.tsx Home tab: pulsing PLAY, card-collection showcase panel,
                 endless card (with the level-15 lock)
  CardsScreen.tsx Cards tab: full collection grid (locked = silhouette + ★ cost)
  DailyScreen.tsx Daily tab: today's puzzle CTA, streak, solve-history list
  BottomNav.tsx  hand-rolled 3-tab bar (Home/Cards/Daily, dot = daily not done)
  TutorialBubble.tsx  tutorial coach card · HelpOverlay.tsx  "How to play" card
  SettingsOverlay.tsx settings modal: flush game data (inline confirm; uses
                 useGame.flushData — wipes all AsyncStorage keys, back to L1)
  Button.tsx (solid/ghost/danger), WinOverlay.tsx (Next level / coming soon),
  Confetti.tsx
src/theme.ts, src/format.ts
App.tsx          tab shell: global HUD (★ wallet → Cards, 🔥 streak, ⚙) +
                 Home/Cards/Daily pages + BottomNav; `playing` swaps in a
                 full-screen GameScreen (no HUD/nav); Android back returns
                 to the Home tab first
scripts/slice_sprites.py     sprite-sheet slicer (PIL + SciPy)
scripts/pick_level_seeds.ts  offline seed picker for the level table
```

### Generator (the crux — guarantees a *logic-solvable* board)

`generatePuzzle(difficulty)` returns a board that is solvable by **pure logic, no
guessing** — a strictly stronger guarantee than "unique solution" (uniqueness ≠
fairness: ~70% of merely-unique boards actually require guessing). With one marker
per row & column, two markers can only touch diagonally between consecutive rows,
so no-adjacency reduces to `|col(r) − col(r+1)| ≥ 2`. Steps:

1. random valid solution (permutation satisfying that constraint),
2. flood-grow `size` connected clusters, one seeded per solution cell
   (growth weighted uniformly over the frontier). **Easy boards freeze one
   random cluster at its 1-cell seed** — a guaranteed singleton cluster as an
   obvious first placement (the uniqueness repair in step 3 is told never to
   move cells into it),
3. **repair to uniqueness**: while another solution exists, move one of that
   alternate's **non-owner** cells into a neighbouring cluster. The intended
   solution only sits on cluster "owner" cells, so it stays valid while the
   alternate loses its one-per-cluster property and dies. (`generateUniqueBoard`
   does steps 1–3; it is exported for tests.)
4. **rate + gate** (`logicSolver.ts` `rateBoard`): run a human-style propagation
   solver (singles → confinement → subsets). Reject the board unless it is fully
   solved by logic **and** its hardest tier falls in the difficulty's
   `DIFFICULTY_BANDS` window (easy 6×6 = tier 1–2, medium 8×8 = tier 2–3, hard 9×9
   = tier 3). A truth-guarded run rejects any board where a rule eliminated the
   true cell, so a solver bug can only cost yield, never ship a bad board.

Difficulty is now an **ordered** property (size + deduction depth), not size alone.
Logic-solvable yield is ~27–38%, so gating costs retries: latency is ~1ms easy,
~6ms medium, ~50ms median hard (p95 ~190ms, rare ~400ms tail). The outer loop
keeps a closest-to-band solvable board as a fallback so it never throws.

## Sprite assets

`scripts/slice_sprites.py` slices the source sheet (1254×1254, 17 plants: rows of
4/4/4/5) into transparent PNGs in `assets/plants/`. It flood-fills the dark
background to transparent, then extracts each plant as a **connected component**
(via `scipy.ndimage.label`) so neighbouring sprites never bleed into a crop. The
17 ids in `palette.ts` must match the output filenames.

## Verification approach (no device needed)

1. `npm test` — generates puzzles/difficulty (asserts unique solution, connected
   clusters, one solution cell per cluster, validator agreement, **logic-solvable
   + in tier band**), then audits the logic solver over 600 raw boards/size
   asserting **0 unsound** (no rule ever eliminates a true-solution cell).
2. `npm run typecheck`.
3. `npx expo export -p web` (or `-p android`) — full Metro bundle resolves all
   imports + the 17 assets.
4. For visual/interaction checks, the web build was driven with headless
   Chromium (Playwright) to screenshot the menu, board, gestures, and win
   screen, asserting zero page errors. (Playwright lives outside the repo.)

## Status

Feature-complete and verified: generator + unique solutions, gesture model,
live conflict highlighting, hint, undo/reset, timer + per-level best times,
win animation, 30-level seeded progression with unlock persistence, first-play
interactive tutorial + Help overlay. Runs on iOS/Android (Expo Go) and web.

## Conventions / gotchas

- Touch math: **locationX/locationY only** (see Interaction model).
- Keep `src/game/*` (except `plants.ts`) free of RN/asset imports so `npm test`
  works under Node.
- After editing `palette.ts` plant ids, keep `plants.ts` and the slicer in sync.
- Use `npx expo install` for Expo/RN packages to stay on SDK 54-compatible versions.
```
