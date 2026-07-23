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

**Hearts / fail**: the player gets **3 hearts** per board (all modes). Planting
on a cell that isn't its `solution[r]` cell costs a heart and the board shakes —
and the plant **is not kept**: the cell becomes a **red ✕** instead (state
`"marked"` + membership in the board's `mistakes` set, which `Cell.tsx` draws as
a steady red wash + an oversized `dangerDark` ✕). So a wrong guess reads as
"eliminated", not as a plant sitting in a bad spot, and only correct plants are
ever on the board. Consequences: `mistakes` is now **explicit reducer state**
(not derived from the grid) and travels with each undo `Snapshot`; it is pruned
by `liveMistakes` whenever the cell stops being ✕-marked (tap/erase/reset clears
the red with the mark); re-planting a red-✕ cell is a **no-op**, so one slip
can't drain two hearts; and `solved` is just "board full" (`wrongCells` stays
empty by construction but still feeds `isSolved` as a guard). Losing the last
heart sets `failed`: the board locks, the timer stops, and `FailOverlay` offers
**Try again** (`useGame.retry()` rebuilds the same board with hearts/timer
reset) or Menu. Undo never refunds a spent heart (so it can't be used to probe
cells). Hearts render in `Hearts.tsx` (header row, pops when one breaks);
`MAX_HEARTS` lives in `useGame.ts`.

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

**Hint**: one tap places the next plant — the reducer's `HINT` action
(`useGame.ts`) scans rows for the first one whose `solution[r]` cell isn't
already `"placed"` and plants it, overwriting whatever ✕ was there (nothing can
conflict with it: every plant on the board is correct — see Hearts / fail — so
the old `placeClearingConflicts` helper is gone). One undoable step,
never a mistake, no message or highlight — just the plant appearing. Counts
toward `hintsUsed` (gates the "no hints" star, see Stars below).

**No auto-complete**: the last plant is placed by the player like every other
one (a "Finish" button + staged sweep existed briefly and was removed — no
`AUTO_COMPLETE` action, `canAutoComplete`, `FinishFab`, or `auto_completed`
event; don't re-add without asking).

**Stars** (`src/game/stars.ts`): level mode only — ★ solved, +★ no hints,
+★ under par (par by size+tier). Best per level persists as JSON under
`plantdoku:stars`; win overlay shows the rating (+ what 3★ needs), menu Play
button shows the total. Every Hint press counts as a hint used (`hintsUsed`
in reducer state; survives RESET, cleared on new boards).
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

**Resume in-progress board**: leaving a board (or the app dying) no longer
throws the solve away. `useGame` keeps a `ResumeSnapshot` — puzzle, grid, red-✕
set, elapsed seconds, hearts, hints — persisted under `plantdoku:resume` as
**one slot per mode** (`{level?, daily?, endless?}`), so starting today's daily
can't quietly bin a half-solved level; each new board only supersedes its own
mode's slot. The undo stack is deliberately *not* persisted (a resumed board
starts with a clean history). Writes happen on every move but are **debounced
500ms** (a drag is one write); `saveResume()` flushes immediately and is called
when the player leaves the board (`GameScreen`'s `leave()`) and when the app
backgrounds (`App.tsx` `AppState` listener), which is what keeps the saved
clock honest. A slot is dropped when its board is solved, failed, or wiped
blank by Reset; `parseSlots`/`validSnapshot` also drop anything stale on load
(old `v`, wrong board shape, a *complete* board — which would re-fire the win
path — or yesterday's daily). Home shows a **Continue card** above PLAY for the
most recently touched slot (`newestSlot`, hence `updatedAt`); PLAY itself
resumes the level slot when it matches the level it would start, and the Daily
tab's CTA becomes "Continue today's puzzle" — so no primary button is a trap.
Endless chips always start a fresh board (the Continue card is the way back
into a saved endless run). Resuming mid-tutorial is safe: the stage machine
re-derives from the board and cascades to the furthest completed stage.

## Tech stack

- **Expo SDK 54** (managed) + **TypeScript**, React Native **0.81.5**, React **19.1.0**.
  - NOTE: the project was originally scaffolded on SDK 56 and then **downgraded
    to 54** via `npx expo install --fix`. Keep deps aligned to SDK 54 — use
    `npx expo install <pkg>` (not bare `npm install`) for any RN/Expo package.
- State: plain React `useReducer` hook (`src/state/useGame.ts`). No Redux.
- Persistence: `@react-native-async-storage/async-storage` (best times).
- Feedback: `expo-haptics` (loaded lazily, skipped on web).
- Visuals: `expo-linear-gradient` (gameplay-screen background).
- Analytics: **PostHog** (`posthog-react-native`) behind a thin facade in
  `src/analytics/` — see below.
- Web support is installed (`react-native-web`, `react-dom`, `@expo/metro-runtime`)
  so the app also runs in a browser and can be smoke-tested headlessly.

## Analytics (`src/analytics/`)

All product analytics go through `analytics` (the only export of
`src/analytics/index.ts`) — a typed facade over a single PostHog client.
Call `analytics.track(name, props)` / `analytics.screen(name)`; never import
`posthog-react-native` elsewhere. The client is built once at module load from
`EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` (copy `.env.example` →
`.env`); **with no key, or on web, every call is a safe no-op** (so dev builds
and the headless web smoke-test run without a project). `EventName` is a closed
union — add new events there to keep the taxonomy in one place. App lifecycle
(Installed/Opened/Backgrounded) is auto-captured by the SDK.

Events are fired from `useGame.ts` (the lifecycle funnel: `game_started`,
`level_completed`/`daily_completed`/`endless_completed`, `board_failed`,
`board_abandoned`/`board_resumed`, `mistake_made`, `hint_requested`,
`card_unlocked`, `undo_used`/`board_reset`/`board_retried`,
`onboarding_completed`, `data_flushed` — which also calls `analytics.reset()`),
`GameScreen.tsx` (`tutorial_step`) and `App.tsx` (`screen_viewed` per
tab/game). Keep analytics **out of `src/game/*`** so the headless Node tests
stay framework-free (the facade imports RN; `useGame` already does).

Two of these exist purely to answer product questions the funnel couldn't
before, and both are worth keeping intact:

- **`tutorial_step`** — one event per tutorial stage *reached*, with the
  stage's stable `name` (`plant` · `no_touch` · `row` · `column` · `colour` ·
  `free_play`, from `TUTORIAL_STEPS`). The tutorial is forced on first play, so
  a drop here is a lost install; `onboarding_completed` closes the funnel.
  Stage 4 self-skips on boards with no one-cell-left cluster, which reads as a
  gap, not a drop. Renaming a stage breaks the funnel's history.
- **`board_abandoned`** — the player left an unfinished board (`GameScreen`'s
  `leave()` → `game.abandonBoard()`, which covers the header Menu button and
  Android back; it no-ops on a won/lost board). Carries `progress` (% of plants
  placed), `seconds`, `hints` and `hearts_left`, so rage-quits are separable
  from "put the phone down". Paired with `board_resumed` it also measures
  whether the resume feature actually gets used.

## Audio (`src/audio/`)

All sound effects go through `audio` (the only export of `src/audio/index.ts`)
— a typed facade over **expo-audio**, mirroring the analytics facade and the
haptics pattern. Call `audio.play(name)`; never import `expo-audio` elsewhere.
`SoundName` is a closed union (`place` · `mark` · `mistake` · `win` · `fail` ·
`button`). One reusable `AudioPlayer` per clip is created lazily and cached;
`play` does `seekTo(0)` then `play()` so a cue can retrigger rapidly. **On web,
before init, or when muted, every call is a safe no-op** (so the headless web
smoke-test runs without audio), and all failures are swallowed — audio can
never break gameplay. Clips are bundled from `assets/audio/*.wav` via static
`require`s; regenerate them with `python3 scripts/make_sfx.py` (stdlib-only
synthesis — swap in designed clips anytime, just keep the filenames).

Mute is owned by `useGame` (single source of truth, like the other prefs): it
persists `plantdoku:sound` ("0" = muted, default on), pushes the flag to
`audio.setMuted`, and exposes `soundOn` / `setSoundOn`. `flushData` wipes the
key (back to on). The toggle lives in `SettingsOverlay`. Cues fire from
`GameScreen` (place/mistake on a placement by solution-cell check, `mark` on
tap-✕, `win`/`fail` on the solved/failed edges) and the shared `Button`
(`button` click). Keep audio **out of `src/game/*`** so the Node tests stay
framework-free (same rule as analytics).

## Commands

```bash
npm install
npm start            # Expo dev server (Expo Go / simulators)
npm run web          # run in a browser
npm test             # headless game-core tests (tsx src/game/runTests.ts)
npm run typecheck    # tsc --noEmit
# Regenerate sprites from the source sheet:
SHEET=/path/to/sheet.png python3 scripts/slice_sprites.py
python3 scripts/make_sfx.py    # regenerate the placeholder SFX (assets/audio/)
```

## Interaction model (current)

Handled by a single board-level `PanResponder` in `src/components/Board.tsx`:

- **Tap** a cell → toggle an **✕** "no" note (tap again to clear).
- **Swipe / drag** across cells → paint **✕** marks quickly. If the drag
  **starts on an ✕-marked cell**, the whole drag **erases** ✕ marks instead
  (mode is fixed at drag start; plants are never affected either way).
- **Double-tap** a cell → try to place a **plant** (the cluster's plant,
  revealed on placement). On a wrong cell nothing is planted — it becomes a red
  ✕ and costs a heart (see Hearts / fail).
  A placement **never auto-✕s anything** else — no cluster remainder, no touching
  cells. Every elimination is the player's to mark (a `markDeadCells` helper
  in the `PLACE` case did this briefly and was removed; don't re-add without
  asking).
- **Hold** a cell still (no drag) for `HOLD_MS` (450ms) → place a plant there too,
  a third, independent way in — it races the tap/double-tap logic rather than
  replacing it.

Discrimination logic: movement past `DRAG_THRESHOLD` (10px) becomes a drag
(paint). Otherwise two **independent** timers separate single-tap (toggle ✕)
from double-tap (place). The double-tap is decided at the second **touch-down**
(in `onPanResponderGrant`): same cell as the last tap, within `DOUBLE_MS` (260ms)
of its lift. Measuring lift→touch-down — not lift→second-lift — excludes the
second tap's press duration, so the window stays forgiving without bleeding into
the ✕ delay (this is what fixed double-taps feeling "hard"). `SINGLE_MS` (90ms)
is how long a *lone* tap waits before its ✕ (and its haptic/audio) commits —
the dead-air on an isolated mark, kept low for snappy marking. Keep `SINGLE_MS ≤
DOUBLE_MS` — a double-tap whose second touch-down lands after `SINGLE_MS` briefly
flashes a ✕ before the plant (quicker ones stay clean, leaving no stray ✕). To
keep the deferred ✕ from feeling laggy, a still-pending single tap is also
**committed immediately when the next touch lands on a different cell** (it can
no longer become a double tap), so rapid marking responds instantly; only an
isolated tap waits out `SINGLE_MS`. The hold timer is a third, independent
gesture: armed on every touch-down, cleared on release or once the touch
crosses `DRAG_THRESHOLD` (long-press requires staying put). Once it fires
(`holdFired`), further move events on that touch are ignored — so it can't
also paint a trail of ✕ marks — and release becomes a no-op.

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

First-ever play of Level 1 runs a 6-stage **spotlight tutorial** on the real
board (state machine in `GameScreen.tsx`, `TUTORIAL_STEPS`) built on
learn-by-doing: **every stage asks for one simple player action** — there are
no read-only "Next" screens (the only button is the final "Let's go!").
`TutorialOverlay.tsx` blacks out the whole screen except a rectangular
spotlight "hole": four touch-swallowing scrim rects around it (the hole is an
absence of views, so touches there fall through to the Board) — header, rules
card, controls and Help are covered and unreachable while it's up. Stages:
forced double-tap on the easy board's guaranteed **singleton cluster** (hole
= that cell; pulsing ring via `Board`'s `highlight` + bouncing 👆 — the only
stage with a visible `holeRing`, suppressed on the multi-cell stages where
the per-cell `hintCells` outlines / highlight ring already show what
matters) → the no-touch stage (hole = 3×3 block, clamped): mark-✕ the 8
cells around the plant → mark-✕ the rest of its
**row** (hole = row strip) → its **column** → the
**colour-rule payoff** (`tutColor`): those very marks can leave another
cluster with exactly ONE open cell, so the colour rule *forces* a plant
there — a sound deduction the player can see (the cluster's other cells sit
visibly ✕'d inside the spotlight; hole = the cluster's `bbox()`, pulsing
ring on the open cell, second double-tap placement). `tutColor` picks the
biggest multi-cell cluster reduced to one open cell and verifies that cell
against the true solution, so a logic slip can only skip the stage — never
teach a lie; if no such cluster exists the stage self-skips (stage 3
completion jumps straight to the finish card). The current L1 seed (1000)
does offer one — a 4-cell cluster narrowed to one spot — re-check if L1's
seed or the generator changes. Mark stages advance the moment their whole
target set is ✕'d, the colour stage on its placement, each with a success
haptic as the reward beat; a small **checklist** of chips (No
touch/Row/Column/Color) in the coach card ticks off as stages complete.
Step copy is 1-2 short directive lines (hybrid-casual: act, don't read).
The scrim only blocks touch-*downs* — a drag granted inside the hole keeps
delivering moves outside it — so the `GameScreen` handlers gate too
(`canMarkAt`: paint/erase/tap only on the stage's target set, never a plant
since tapping a placed cell uproots it; place only stage 0's forced cell or
stage 4's deduced cell). Hole geometry = `boardMetrics`/`BOARD_FRAME`
(exported by `Board.tsx`) + `onLayout` on the board wrapper. The solve
clock is frozen during the
tutorial (`useGame.setTimerPaused`, a ref-gate on the TICK interval) so the
walkthrough can't cost the L1 under-par star. Completion persists
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
- A rejected guess is a **red ✕ cell**: steady `theme.danger` wash + a larger
  `theme.dangerDark` ✕ (no pulse — these persist, so a breathing tile would be
  noise). Nothing else on the board is ever tinted red.
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
                 RESTORE (resume), timer, unlocked level + per-level best +
                 onboarded + soundOn + resume slots (AsyncStorage)
src/audio/index.ts     SFX facade over expo-audio (play(SoundName), mute) —
                 RN ONLY, no-op on web (do not import in core)
src/components/
  Board.tsx      n×n grid + PanResponder gestures (the gesture brain) + highlight ring
  Cell.tsx       display-only cell (colour, ✕, placed plant + ring)
  GameScreen.tsx header (Level N, Help ?), stats, board, controls, win overlay;
                 haptics; first-play tutorial state machine
  HomeScreen.tsx Home tab: Continue card (resume slot), pulsing PLAY,
                 card-collection showcase panel, endless card (level-15 lock)
  CardsScreen.tsx Cards tab: full collection grid (locked = silhouette + ★ cost)
  DailyScreen.tsx Daily tab: today's puzzle CTA, streak, solve-history list
  BottomNav.tsx  hand-rolled 3-tab bar (Home/Cards/Daily, dot = daily not done)
  TutorialOverlay.tsx  spotlight blackout + coach card (first-play tutorial)
  HelpOverlay.tsx  "How to play" card
  SettingsOverlay.tsx settings modal: SFX toggle (useGame.soundOn/setSoundOn) +
                 flush game data (inline confirm; uses useGame.flushData —
                 wipes all AsyncStorage keys, back to L1)
  Button.tsx (solid/ghost/danger), WinOverlay.tsx (Next level / coming soon),
  FailOverlay.tsx (out-of-hearts game over: Try again / Menu),
  Hearts.tsx (lives row), Confetti.tsx
src/theme.ts, src/format.ts
App.tsx          tab shell: global HUD (★ wallet → Cards, 🔥 streak, ⚙) +
                 Home/Cards/Daily pages + BottomNav; `playing` swaps in a
                 full-screen GameScreen (no HUD/nav); Android back returns
                 to the Home tab first; resume-aware Play/Daily entry points
                 + AppState listener (reminder re-sync + resume flush)
scripts/slice_sprites.py     sprite-sheet slicer (PIL + SciPy)
scripts/pick_level_seeds.ts  offline seed picker for the level table
scripts/make_sfx.py          stdlib-only SFX synth -> assets/audio/*.wav
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
hearts + red-✕ mistakes, hint, undo/reset, timer + per-level best times,
win animation, 30-level seeded progression with unlock persistence, first-play
interactive tutorial + Help overlay. Runs on iOS/Android (Expo Go) and web.

## Conventions / gotchas

- Touch math: **locationX/locationY only** (see Interaction model).
- Keep `src/game/*` (except `plants.ts`) free of RN/asset imports so `npm test`
  works under Node.
- After editing `palette.ts` plant ids, keep `plants.ts` and the slicer in sync.
- Use `npx expo install` for Expo/RN packages to stay on SDK 54-compatible versions.
```
