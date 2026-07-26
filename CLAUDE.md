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
a steady red wash + a `dangerDark` ✕). So a wrong guess reads as
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
`HomeScreen.tsx` — until then the card shows a lock, a faded garden behind it
and an `N / 15` progress bar, so it reads as something to work toward rather
than as dead UI).

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
re-pick seeds if generator behaviour changes. **Cosmetics are exempt**: region
colours and plant skins are drawn from a PRNG seeded by the finished board
(`boardHash` in `generator.ts`), not from the generator stream, so editing
`REGION_COLORS` or `PLANT_IDS` cannot move a puzzle. That coupling was real —
`shuffle(REGION_COLORS)` used to consume `length - 1` draws from the seeded
stream, so growing the palette from 12 to 15 colours silently rewrote 18 of the
60 curated levels — and it is what the exemption exists to prevent.

**Plant cards** (`src/game/cards.ts`, pure/headless-safe): collection meta on
top of stars — all 17 plants are collectible cards (name, rarity, flavor)
unlocked at total-star milestones (first at 1★, last legendary at 152★ of the
180★ max; thresholds strictly increasing, covered by runTests). No new
currency or storage: the collection is derived from `plantdoku:stars`, so
flushData resets it for free. `useGame` exposes `newCards` (milestones crossed
by the solve on screen — computed on the rising edge of solved when a level's
best stars improve); the win overlay makes the unlock its headline and flips the
card face-up (see Win sequence), or shows progress to the next one. The meta is
foregrounded hybrid-casual style: Home has a white showcase panel under the
primary button (latest unlocks + next card as a dashed "?" slot + progress bar
to its milestone) and the Cards tab
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
path — or yesterday's daily). Home's single primary button **becomes**
`Continue` for the most recently touched slot (`newestSlot`, hence `updatedAt`)
— see Home under Visual decisions — and `startLevel` still resumes the level
slot when it matches the level it would start, so the button is never a trap
even when the saved slot belongs to another mode. The Daily tab's CTA likewise
becomes "Continue today's puzzle".
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
npm run sprites:check          # audit assets/plants against the sprite spec
# Rebuild the plant sprites from the raw art (see Sprite assets):
python3 scripts/prep_sprites.py --in art/raw --fit area
SHEET=/path/to/sheet.png python3 scripts/slice_sprites.py   # sheet -> raw cuts
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

### Design system (`src/theme.ts`)

One place owns colour, radius, shadow, type and spacing — **use the tokens, do
not eyeball per-file values**, or the screens drift apart again (the reason this
section exists).

- **Colour by function, not decoration**: `accent` green = primary actions,
  progress, active selection · `text` dark forest green = type/icons · `gold` =
  stars, rewards, rarity (**never** a plain card border) · `bed*` = the
  board's tray only, `soil` = the Home wordmark's mound only · `danger` = mistakes and hearts only. `onAccent` /
  `onGold` / `onDanger` are the type colours on those fills (very dark greens
  and browns — never pure black).
- Surface hierarchy, lightest first: `panel` (white — cards *and* modal cards) >
  `bg` (the warm off-white page canvas) > `bgAlt` (things sunken *into* a card:
  chips, progress tracks, recessed slots) > `panelEdge` (the chunky 3D bottom
  edge). Note `bg` sits **above** `bgAlt`: a light theme gets its layers from a
  quiet near-white page with darker recesses, not from tinting everything green.
  `frame` stays deliberately dark and must not be lightened (it tints
  locked-card silhouettes — a shadow, not a wash). `mark`, the board's ✕ glyph,
  is the opposite: a **soft mid forest green**, deliberately not near-black —
  see the ✕ note under Board for why.
- `radius` is picked by role (`chip` 12 · `md` 16 · `btn` 20 · `lg` 24 card ·
  `modal` 32; `cell` is a *fraction* of tile size). `shadow` has exactly three
  presets — `card`, `raised` (primary button, tab bar), `modal` — all soft and
  vertical; no hard dark drops. `typography` is the type scale; `overline` is
  the only uppercase style and keeps its tracking modest, because uppercase +
  bold + wide tracking at once reads as shouting. `space(n)` is 8-point-ish
  (`space(2)`=8, `space(4)`=16, `space(6)`=24).
- Modal backdrops use the exported `scrim` (a soft green shade) rather than
  per-file `rgba(...)` literals; the tutorial's blackout scrim stays near-opaque
  dark on purpose. `app.json`
  (`userInterfaceStyle`/`backgroundColor`/splash/notification colour) and
  `App.tsx`'s `<StatusBar style="dark" />` are part of the theme — keep in sync.

### Board

- Cells are **rounded tiles** with a small gap between them (the bed's `bedGap`
  shows through), a faint static bevel echoing the chunky 3D buttons, and a
  **faint embossed glyph** of the cluster's plant. Each region colour carries
  **three states**, derived in `Cell.tsx` from the one base tint in
  `REGION_COLORS` (which is the *available* colour): `available` · `excluded`
  (only *softened* — ~0.82 saturation and a touch paler, replacing the old dark
  scrim) · `planted` (saturation boosted, bright inner rim, small drop shadow,
  full-colour sprite). **Do not drain `excluded`**: which cluster a ✕'d cell
  belongs to is information the player is still reasoning with, so the hue must
  survive the mark — the ✕ carries the eliminated state, the tile only steps
  back. A solved cell should be the most vivid, most physically
  raised thing on the board — that's the player's payoff.
- **No bold cluster borders.** Clusters read by colour + glyph; tile gaps are
  uniform everywhere.
- The ✕ is **quiet on purpose, and must stay that way.** Most cells on a solved
  board end up eliminated, so anything heavier turns the board into a field of
  dark crosses and the player's own placements stop being what you see first.
  Its quietness comes from the **thin stroke, soft colour and opacity, not from
  being small** — Ionicons' thinnest round-capped `close-outline` at ~0.55 of
  the tile, `theme.mark` soft green at 0.62 opacity, stamping on with a short
  scale from 0.8 plus a few degrees of rotation. Ranked loudness on a tile, and the
  ordering any future change has to preserve: **placed plant > embossed
  silhouette-plus-tile-colour > ✕**. A *mistake* ✕ is the one exception — solid
  `close`, larger, near-opaque, `dangerDark` — because there are only ever a
  few of them and they mean something different.
- The board sits in a **slim tray** (`theme.bed` face · `bedEdge` outer border ·
  `bedGap` in the tile gaps · `bedRim` carved highlight — no texture assets),
  kept thin (`FRAME`/`FRAME_BORDER` in `Board.tsx`) so it frames the puzzle
  rather than competing with it. The tray is a **low-chroma sage grey, a clear
  step darker than every tile**: the region palette is entirely light pastels, so
  a warm or saturated bed reads as one more cluster colour. The bar to clear is
  measurable — touching clusters are 55–85 redmean units apart (median 76), and
  the old warm-wood bed was only 58 from the nearest pastel, which is why peach
  and sand tiles bled into the frame. Current margins: `bed` 88 · `bedGap` 117 ·
  `bedEdge` 150 · `bedRim` 65. **Re-check these if the palette changes.**
  `GameScreen` lays the whole screen on a very faint vertical
  `expo-linear-gradient`.
- A rejected guess is a **red ✕ cell**: the tile becomes opaque
  `theme.dangerTile` (silhouette and ✕ both `dangerDark`) rather than taking a
  translucent red wash — red over a botanical green blends to muddy tan, not to
  "wrong". This is the one place a cluster's hue is sacrificed, and it's worth it
  because at most two mistake cells are ever on the board at once. No pulse:
  these persist, so a breathing tile would be noise. Nothing else on the board
  is ever tinted red.

### Board screen chrome

Each screen answers one question, and the board screen's is "where do I plant?"
— so everything else is compressed:

- Header is **back chevron · level name · round `?` button**. No capsule around
  the level (it isn't interactive) and no "Help ?" text.
- The three rules get the **full card only during the tutorial**; afterwards
  they're three chips (`One per line` / `One per color` / `No touching`) that
  expand to a one-line explanation on tap. The reclaimed vertical space goes to
  the board.
- The **clock is the headline number**; hearts are smaller, and `Best` only
  renders when there is one. A "mistakes left" caption sits under the hearts for
  a not-yet-onboarded player only — and the row has a fixed height so its
  arrival/departure never shifts the board.
- The gesture reminder pill is **onboarding copy, not a control**: it shows on a
  first-time player's board and lives in Help from then on. Its row keeps its
  height either way, so finishing the tutorial can't jolt the board up-screen.
- Controls are ranked **by footprint, not by contrast**: **Undo** and **Hint**
  are equal medium white buttons (gold info badges — undoable-move count / hints
  used — sitting inside their own button's width), and **Reset** is a smaller
  round white button *of the same family*, captioned "Reset". An earlier pass
  ranked it down by draining it to a borderless outline, which just made it look
  disabled — don't do that again; shrink the target, keep the contrast.
  Reset **arms on first press** (circle turns red, caption becomes "Tap again",
  falling back after 3.5s) whenever there is progress to destroy; a **long
  press** skips straight to the reset for players who already know the control,
  and a blank board needs no confirmation at all.

### Win sequence

- A **flourish beat first**, then the modal. `WinFlourish.tsx` dims the solved
  board (not fully — the finished grid should still read behind it) and blooms
  one plant huge in the middle with a gold halo and a 12-spark burst for
  `FLOURISH_MS` (1250ms); `GameScreen`'s `flourish` state gates `WinOverlay`
  until it ends, with a `setTimeout` backstopping the animation callback so a
  dropped callback can't strand the result card. The plant is the freshly
  unlocked card's if the solve earned one, else the last one planted — tracked
  in `lastPlanted` by both `place` and the `hint` wrapper, since a hint can be
  the finishing move.
- `WinOverlay` has **one headline**: `"<Card> unlocked!"` when the solve earned
  a card, else `"Solved!"` (the `Level N complete` tag is a small overline above
  it — it is not news to the player). Then the hero, which **flips** from
  face-down silhouette to the full-colour plant (a scaleX squash swaps the two
  stacked faces at the midpoint) with a rarity glow, and only *after* the flip
  the rarity + `N/17 collected` line. **Tapping the backdrop skips the reveal to
  its end** — a reward beat must never become a wait.
- Stars show as three glyphs, and when fewer than 3 were earned as an explicit
  goal list (`Puzzle solved` / `No hints used` / `Finish under M:SS`) so the
  rating reads as feedback, not as fine print. That list mirrors `starsFor`
  exactly (1 + no-hints + under-par), which is why `WinOverlay` takes
  `hintsUsed` rather than only the star count.
- One primary action (`Continue` / `New board` / `Share`) with a quiet
  `Next: Level N` line under it; **Menu** is a small text link, not a peer.

### Home

- **One primary action.** A saved board *is* the big green button (`Continue`,
  with `mode · N/M planted · time` on its face) — there is no separate Continue
  card competing with `Play` for the same tap. The single exception, and the
  only place a second entry point is allowed: when the saved board is a *daily
  or endless* run, a quiet text link below offers the level ladder, which would
  otherwise be unreachable from this screen.
- Branding sits **high** on the screen (not floating mid-column), and the
  wordmark's plants are a **planted bed** — overlapping sprites at staggered
  heights with a slight lean, standing in a `soil` mound — rather than a
  detached row of icons.
- The card-collection panel is a **plain white card with a soft shadow** (gold
  is for rewards, not for outlining ordinary panels) and gives its room to the
  card tiles themselves, with the next card as a dashed face-down slot.
- Locked Endless is **desirable, not just disabled**: the garden stays visible
  behind the lock and the card shows `N / 15` progress with a bar.

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
  Cell.tsx       display-only cell; derives the available/excluded/planted
                 tile tints from the one region colour
  GameScreen.tsx header (back · Level N · ?), collapsible rules, stats, board,
                 ranked controls, win overlay; haptics; first-play tutorial
  HomeScreen.tsx Home tab: planted-bed wordmark, ONE pulsing primary button
                 (Play or Continue), card-collection showcase panel, endless
                 card (level-15 lock)
  CardsScreen.tsx Cards tab: full collection grid (locked = silhouette + ★ cost)
  DailyScreen.tsx Daily tab: today's puzzle CTA, streak, solve-history list
  BottomNav.tsx  hand-rolled 3-tab bar (Home/Cards/Daily, dot = daily not done)
  TutorialOverlay.tsx  spotlight blackout + coach card (first-play tutorial)
  HelpOverlay.tsx  "How to play" card
  SettingsOverlay.tsx settings modal: SFX toggle (useGame.soundOn/setSoundOn) +
                 flush game data (inline confirm; uses useGame.flushData —
                 wipes all AsyncStorage keys, back to L1)
  Button.tsx (solid/ghost/danger + iconOnly/circle, optional long-press), WinFlourish.tsx (big plant
  bloom before the win modal), WinOverlay.tsx (card-flip reveal + Continue),
  FailOverlay.tsx (out-of-hearts game over: Try again / Menu),
  Hearts.tsx (lives row), Confetti.tsx
src/theme.ts     design tokens: colour · radius · shadow · typography · space
src/format.ts
App.tsx          tab shell: global HUD (★ wallet → Cards, 🔥 streak, ⚙) +
                 Home/Cards/Daily pages + BottomNav; `playing` swaps in a
                 full-screen GameScreen (no HUD/nav); Android back returns
                 to the Home tab first; resume-aware Play/Daily entry points
                 + AppState listener (reminder re-sync + resume flush)
scripts/gen_art.py           Gemini image-gen for the raw art (prompts + CLI)
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

> **Art status**: the plant set was rebuilt because the previous one copied
> *Plants vs. Zombies* character designs and trademarked names (Peashooter,
> Sunflower, Chomper, Cherry Bomb, Garlic — which were also the `palette.ts`
> ids and `cards.ts` card names). Those files are deleted; the 17 ids are now
> the owner's own AI-generated botanical set (`sprout` · `sunflower` · `daisy`
> · `clover` · `tulip` · `cactus` · `aloe` · `fern` · `toadstool` · `lavender`
> · `monstera` · `waterlily` · `bonsai` · `pitcher` · `frostbloom` ·
> `emberbud` · `nightspire`), ordered to match `CARDS`. All 17 are now real
> art — the last four placeholders (`sunflower`, `daisy`, `cactus`, `aloe`)
> were generated with `scripts/gen_art.py` and `npm run sprites:check` passes.
> **The app icon and splash are still the old infringing art.** Full plan,
> style spec and generation prompts: `docs/art-brief.md`.

Raw source art lives in `art/raw/<plant-id>.png` (the master files);
`assets/plants/` holds only the normalised 512² output the app bundles. Ids,
requires (`plants.ts`) and files must always land together — Metro resolves
`require` at bundle time, so a missing sprite breaks the build, not just a
render.

`scripts/prep_sprites.py` is the ingest pipeline for *any* source of art
(commission, licensed pack, AI batch, vector export): `--in <dir>` of
`<plant-id>.png` files → trim to the real silhouette → scale to a uniform
content box → centre on a **512×512** transparent canvas → optimise. `--fit
area` normalises visual *mass* rather than bounding boxes (mixes spindly and
solid plants without one looking undersized). Sources that arrive on a flat
backdrop instead of transparency (an AI batch, a photo) are **cut out
automatically, per file** — `is_opaque` decides, so a mixed directory is safe;
the fill is seeded from every border pixel and the kept area is eroded 1px so
no backdrop halo survives (`--bg always|never` forces it, `--bg-tol` tunes it).
Ids are read from `palette.ts`, so source art and code can't
drift. `npm run sprites:check` (= `--check`) audits the shipped set — square,
uniform, ≥384px (the card modal is 120pt = 360px at 3x), padded, not oversized
— and exits non-zero, so it can gate a release build. It currently passes.

`scripts/slice_sprites.py` handles the older path: one 1254×1254 sheet (17
plants, rows of 4/4/4/5) → flood-fill the background, extract each plant as a
**connected component** (via `scipy.ndimage.label`) so neighbours never bleed
into a crop. Feed its output through `prep_sprites.py` to normalise it.

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
- **Never mount a cell's sprite conditionally, and keep the grid keyed by
  board.** Two boards of the same size reconcile cell-for-cell, so React keeps
  every `Cell` instance and its native views across a level change. Combined with
  a `{!placed && <Image …>}` glyph that produced a real Android bug: a tinted
  `Image` unmounted (cell planted) and later remounted into the recycled view
  never drew again, so every cell planted earlier in the session showed as a
  blank tile on later boards — accumulating level after level. The fix is both
  halves: `Cell` keeps the glyph mounted and only animates its opacity, and
  `Board` keys rows/cells with `boardKey` (size + solution) so each puzzle gets a
  fresh grid. `retry()`/`RESET`/resume reuse the same puzzle, hence the same key,
  and correctly do *not* remount.
- Keep `src/game/*` (except `plants.ts`) free of RN/asset imports so `npm test`
  works under Node.
- After editing `palette.ts` plant ids, keep `plants.ts` and the slicer in sync.
- Use `npx expo install` for Expo/RN packages to stay on SDK 54-compatible versions.
```
