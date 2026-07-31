# CLAUDE.md — Plantdoku

Project context for Claude Code. Plantdoku is a plant-themed logic puzzle —
LinkedIn **"Queens"** (a Star Battle variant) reskinned with plant sprites.

## What the game is

An _n×n_ grid is partitioned into _n_ connected **clusters**, each owned by one
**colour**. The player places one plant marker so there is:

- exactly **one per row**,
- exactly **one per column**,
- exactly **one per cluster**, and
- **no two markers touching** — including diagonally.

Every generated board has exactly **one** solution.

**One plant per board, and it's the card you're chasing.** A board's clusters
used to be *n* different species, one per colour; now the whole board is a
single species. Clusters are told apart by **colour alone** — which is why the
palette's touching-cluster separation floor now carries that job by itself (see
`palette.ts`), and why the embossed silhouette is texture rather than identity.

Which species is **player state, not board data**: `boardPlant` in `useGame.ts`
picks `nextCard(totalStars).plantId` — the card the ★ progress bar points at —
so the board being solved, the `WinFlourish` bloom and the "<Card> unlocked!"
hero are all one plant on the solve that crosses the milestone. It is **frozen
into `GameState.plant` at board creation** (passed on the `NEW_GAME`/`NEW_DAILY`/
`NEW_ENDLESS` actions, carried by `RETRY` and the resume snapshot, hence
`RESUME_VERSION` 2) and deliberately *not* re-derived per render: the finishing
move can cross that very milestone while the grid is still on screen behind the
flourish, and the plants must not change under the player. `Board` therefore
takes a `plant` prop and ignores `puzzle.plant`.

`Puzzle.plant` survives as the **fallback**: a seeded pick from `PLANT_IDS` off
the cosmetic `skin` PRNG (deterministic per seed, can't perturb generation),
used once the collection is complete and there is no next card — which keeps
some variety instead of pinning every post-152★ board to one legendary. Every
seed keeps its old region colours: `assemble` draws the colours *before* the
plant so the added draw can't shift them.

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
**Revive** (paid — see Coins below), **Try again** (`useGame.retry()` rebuilds
the same board with hearts/timer reset) or Menu. Undo never refunds a spent
heart (so it can't be used to probe cells). Hearts render in `Hearts.tsx`
(header row, pops when one breaks); `MAX_HEARTS` lives in `useGame.ts`.

**Coins / revive** (`src/game/economy.ts`, pure/headless-safe): the app's one
currency, and it exists for one sink — buying a failed board back. **Stars
could never be it**: they are simultaneously a per-level skill *record* and the
card-unlock currency, and they are finite (180), so spending them would erase
the rating and the faucet would run dry. Coins are the repeatably-earnable
half. Every tunable number lives in that one module (`REVIVE_COST` 500,
`COINS_PER_LEVEL` 20, `COINS_PER_DAILY` 20 + a capped streak bonus,
`endlessCoins` 10/15/20, `MILESTONE_COINS` 100, `STARTING_COINS`) and is covered
by runTests; the UI never imports the prices, it reads `coins` / `reviveCost` /
`canRevive` off `useGame`.

The faucet is **first-clear-only for levels** — the award sits inside the
existing `if (level === unlockedLevel)` block, which *is* the first-clear test,
so replaying a cleared level can't mint coins — with daily (gated on the same
`firstToday` the streak uses) and endless as the ongoing income. Endless paying
at all is new: it is the first reward that mode has ever given.

**Chest levels pay on being *reached*, not cleared.** Every `MILESTONE_EVERY`
(10) level is a gold chest node on the Home path, worth `MILESTONE_COINS` (100),
and the bonus lands the moment `unlockedLevel` advances to a multiple of 10 —
so clearing level 9 collects the level-10 chest. That timing is deliberate and
worth preserving: `teasing` only draws the chest while its level is still
`locked`, so paying on *reaching* means the chest disappears exactly when it is
collected, and it matches the callout's own wording ("Reach level 10 for 100
coins"). Paying on *clearing* level 10 instead would leave a window where the
chest is gone but unpaid, which reads as a lost reward.
`MILESTONE_EVERY`/`MILESTONE_COINS` live in `economy.ts` and are **imported by
`HomeScreen.tsx`** precisely so the chest the player is shown can't drift from
the chest that pays. The win card shows the chest as its own gold chip beside
the ordinary `+20`, not folded into a bigger total — it is the payoff for a
promise the path has been dangling for ten levels, so it should read as its own
event.

`REVIVE` is the exact opposite of `RETRY`: **+1 heart and nothing else
touched**, because continuing the solve you were losing is the entire thing
being bought. Three details are load-bearing:

- **`history: []`.** `UNDO` is guarded by `state.failed`, so clearing `failed`
  re-arms it — and `mistakes` rides inside each `Snapshot`, so an undo would
  step back past the fatal placement and erase the red ✕ the player just paid
  500 coins to survive. `RESTORE` starts with a clean stack for the same reason.
- The fatal cell **keeps** its red ✕, and `PLACE` already no-ops on a `mistakes`
  cell — so the bought heart can't be spent re-tapping the cell that took the
  last one.
- Coins are debited by the `revive()` wrapper *before* it dispatches, and it
  returns false when unaffordable; the reducer owns no currency. Balance
  mutations go through **`coinsRef`**, not `coins` — an award and a spend can
  land in the same tick (the same hazard `stateRef` / `slotsRef` exist for).

Stars after a revive are **unchanged** — `starsFor` stays a function of time +
hints. The revive buys back the attempt, not the rating, and the clock kept
running, so under-par is already harder. Resume needs no schema change
(`RESUME_VERSION` stays 2): `toSnapshot` bails while `failed`, so the slot is
dropped at the fail and the auto-save effect re-creates it once the revive
clears it (`state.hearts` is already in that effect's deps). **Don't add a
`revives` counter to `GameState`** — it would have to enter `ResumeSnapshot` to
survive a resume, forcing a version bump for something the `revive_used` event
already answers.

NOTE the affordability curve: at 20 a level the first revive lands around level
25, while most fails are in the medium band (L9–20), so players meet the button
before they can use it. That is why `FailOverlay` renders an unaffordable revive
as a **progress line (`340 / 500`), never a dead control**. `STARTING_COINS` is
the knob if it needs softening.

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
flushData resets it for free. The card being chased is also **what you plant**:
every board is a single species and that species is `nextCard`'s (see One plant
per board), so the grid, the flourish and the unlock hero agree. `useGame`
exposes `newCards` (milestones crossed
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
- Persistence: `@react-native-async-storage/async-storage` (progress, prefs).
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
`coins_earned`/`coins_spent`/`revive_used`/`milestone_reached` (revive matters most — it is
the only sink, so it measures whether the currency does anything; it also means
`hearts_left` on the *_completed events no longer implies the board never
dropped to one heart),
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
`button`). One row per cue in `CLIPS` gives it a clip and a **voice count** — a
small round-robin pool of lazily created `AudioPlayer`s, so cues that retrigger
faster than their own length overlap instead of cutting each other off (`mark`
gets 8: drag-painting ✕ fires it once per cell). **A voice that has already
played is parked at the end of its clip, where `play()` does nothing** — it must
be rewound, and `seekTo` is *async*, so `play` awaits the seek before playing
(`fire`). Firing the seek without awaiting it is what once made pooled cues die
on wrap-around: the first N taps each got a fresh voice, then every later one hit
a parked voice and the cue went silent for the rest of the session. A voice's
first play skips the seek, so the common case stays synchronous. Don't switch the
"needs rewinding" test to `player.currentTime` — status only refreshes on the
player's 500ms interval, so a just-finished one-shot still reports a stale
position; the facade tracks played voices itself. **On web,
before init, or when muted, every call is a safe no-op** (so the headless web
smoke-test runs without audio), and all failures are swallowed — audio can
never break gameplay. Clips are bundled from `assets/audio/*.wav` via static
`require`s.

**The clips are built, not hand-picked** (`npm run sfx` = `scripts/prep_sfx.py`,
the audio counterpart to `prep_sprites.py`). Masters live in `art/sfx/` — CC0
library recordings from five Kenney packs, see `art/sfx/CREDITS.md` — and are
never bundled; the script renders the six shipped WAVs from a `RECIPES` table.
The programmatic-synthesis era (`scripts/make_sfx.py`) is over; that script is
deleted, don't bring it back.

The pipeline exists because dropping six clips from six sources into a folder is
what makes an SFX set sound amateur — the giveaway is mismatched loudness, not
bad clips. So every cue is trimmed, resampled to mono 44.1k, de-clicked with
short fades, **level-matched to a per-cue RMS target** and peak-limited to
−1dBFS. `LEVELS` is the actual mix and its *ordering* is the design: `win` is
the loudest thing in the game, `place` sits under it, and `button` is a
near-subliminal −27dB. `npm run sfx:check` audits the shipped set (rate,
channels, peak, RMS-vs-target, length) and exits non-zero, so it can gate a
release like `sprites:check`. It tolerates a cue that lands *under* its target
only when the clip is already peak-limited — a sharp transient can hit the
−1dBFS ceiling before it reaches its RMS target, which is the limiter talking,
not a mis-level, and there is no headroom left to give it. **All six currently
land on target exactly**, so that branch is a guard rather than a description;
a cue that starts tripping it is usually all transient and no body, which is a
reason to look at the source before accepting the shortfall (that is exactly
what `mistake` was — it sat 3.9dB under until it was re-sourced).

**`mark` is deliberately louder than the "quiet cue" logic implies** (−21dB, not
the −26 it started at). A cue that is both soft *and* very brief reads as
nothing at all — the first pass was inaudible in play. If it ever needs
retuning, move it before assuming the source is wrong.

Two composition decisions worth keeping:

- **`place` is layered**, not a single clip: a low soil thud with a leaf rustle
  12ms behind it at only -5dB, i.e. deliberately leafy rather than heavy. No
  library clip is "a plant being planted" — the layer is what makes it read as
  one, and this is the cue the player hears hundreds of times a session, so it's
  where the effort belongs.
- **`win` and `fail` are mirrored phrases on one instrument** — Kenney pizzicato
  jingles 10 and 11. The win climbs `D F♯ F♯ G` (0.80s); the fail falls
  `F♯ D D` (0.67s), which is PIZZI11 with its leading G cut off by the recipe's
  `start_ms`. A win and a loss have to sound like one game, and answering a
  rising figure with a falling one on the same instrument gets that far more
  strongly than a shared instrument alone. The fail is deliberately the
  *shorter* of the two — it descends to the same D but with less ceremony, which
  suits a board the player is one tap from retrying. Keep that relationship
  (win climbs to G, fail falls to D, fail no longer) if either is re-picked.
  Note **the jingle pack is a
  matrix** — the same 17 melodies played by 5 instrument families — so a cue is
  chosen twice, phrase first, instrument second. The phrase is what carries: the
  original pair (STEEL02/01) shared an instrument but its melodies were plain
  six-note scale runs, up and back down, which is the stock level-up/game-over
  gesture rather than a tune. Only 7 of the 86 clips are kept in `art/sfx/`;
  re-download the pack to audition the rest.

To re-cut a cue, edit its `Recipe` (sources, per-layer gain/delay/pitch, target,
`start_ms` head trim / `max_ms` length cap — the pair that lets a cue use just
part of a musical phrase) and re-run — `CLIPS` filenames are the contract, so no app
code changes. `soundfile`/`numpy` are dev-only deps of the script, not the app.

**The clips are preloaded to local files at module load** (`preload()`, via
`expo-asset`), and this is not an optimisation. expo-audio resolves a `require`d
clip as `asset.localUri ?? asset.uri`: in a release build the wav is bundled so
`localUri` is a `file://` path, but in **Expo Go / a dev client nothing is
bundled** — `localUri` is null until downloaded, so the player gets Metro's http
asset URL and has to stream each one-shot over the LAN. On Android that load
never completes, the player stays `isLoaded === false`, and `play()` is a
silent no-op: **audio works in the APK and is dead in Expo Go, with no error
anywhere**. `downloadAsync()` is a no-op once local, so production pays nothing.
`play()` also never seeks a voice on its first play (seeking an unprepared
player rejects on Android), and `diagnose()` prints each cue's resolved `uri` —
`file://` = local, `http://…:8081/assets/…` = the failure above.

Mute is owned by `useGame` (single source of truth, like the other prefs): it
persists `plantdoku:sound` ("0" = muted, default on), pushes the flag to
`audio.setMuted`, and exposes `soundOn` / `setSoundOn`. `flushData` wipes the
key (back to on). The toggle lives in `SettingsOverlay`. Cues fire from
`GameScreen` (place/mistake on a placement by solution-cell check, `mark` on
tap-✕, `win`/`fail` on the solved/failed edges) and from `Tappable` (the
`button` click). Keep audio **out of `src/game/*`** so the Node tests stay
framework-free (same rule as analytics).

**`Tappable.tsx` is the app's only `Pressable`** — a pass-through wrapper that
plays the click, which `Button` also renders through, so the two together own
every tap in the app. Use it for anything tappable and **never reach for a bare
`Pressable`**: a raw one silently opts out of the convention, which is exactly
how the click ended up firing on `Button` alone while the Home screen's primary
CTA, the tab bar, the star wallet, the card tiles and both header discs stayed
mute. A UI where only some controls answer reads as broken, not as restrained —
and `button` is mixed near-subliminal at −27dB (see Audio) precisely so it can
be on *everything* without becoming noise. The `silent` prop is the deliberate
opt-out, and it currently has exactly two users, both presses that are
impatience rather than a control: skipping the splash, and skipping the win
reveal (which lands while the `win` jingle is playing, where a click on top
would only muddy it).

## Commands

```bash
npm install
npm start            # Expo dev server (Expo Go / simulators)
npm run web          # run in a browser
npm test             # headless game-core tests (tsx src/game/runTests.ts)
npm run typecheck    # tsc --noEmit
npm run sprites:check          # audit assets/plants against the sprite spec
npm run sfx                    # render assets/audio/*.wav from the art/sfx masters
npm run sfx:check              # audit the shipped SFX (level, length, format)
# Rebuild the plant sprites from the raw art (see Sprite assets):
python3 scripts/prep_sprites.py --in art/raw --fit area
SHEET=/path/to/sheet.png python3 scripts/slice_sprites.py   # sheet -> raw cuts
```

## Interaction model (current)

Handled by a single board-level `PanResponder` in `src/components/Board.tsx`:

- **Tap** a cell → toggle an **✕** "no" note (tap again to clear).
- **Swipe / drag** across cells → paint **✕** marks quickly. If the drag
  **starts on an ✕-marked cell**, the whole drag **erases** ✕ marks instead
  (mode is fixed at drag start; plants are never affected either way).
- **Double-tap** a cell → try to place a **plant** (the board's plant, revealed
  on placement). On a wrong cell nothing is planted — it becomes a red
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
  progress, active selection · `forest` = the board screen's one hero action
  (Hint) · `text` dark forest green = type/icons · `gold` =
  stars, rewards, rarity (**never** a plain card border) · `bed*` = the
  board's tray only, `soil` = the Home wordmark's mound only · `danger` = mistakes and hearts only.
  The **coin wallet is a deliberate exception** to "gold = stars": a coin *is*
  gold, and it sits beside the star pill in the HUD, so the two are told apart
  by glyph (`cash` vs `star`), not by colour. `onAccent` /
  `onForest` / `onGold` / `onDanger` are the type colours on those fills (very
  dark greens and browns, or white on `forest` — never pure black).
- Surface hierarchy, lightest first: `panel` (white — cards *and* modal cards) >
  `bg` (the warm off-white page canvas) > `bgAlt` (things sunken *into* a card:
  chips, progress tracks, recessed slots) > `panelEdge` (the chunky 3D bottom
  edge). Note `bg` sits **above** `bgAlt`: a light theme gets its layers from a
  quiet near-white page with darker recesses, not from tinting everything green.
  `frame` stays deliberately dark and must not be lightened (it tints
  locked-card silhouettes — a shadow, not a wash). `mark`, the board's ✕ glyph,
  is the opposite: a **mid forest green**, deliberately not near-black — but it
  still has to be legible at a glance on every region tint; see the ✕ note under
  Board for how that balance is struck.
- **The board screen runs a parallel warm set** (`bgWarm` · `panelWarm` ·
  `bgWarmAlt` · `btnWarm*` · `forest*`) filling exactly the same roles as
  `bg`/`panel`/`bgAlt`/`panelLine`/`accent`, in ivory instead of green. It
  exists because that screen's whole job is to show eleven pale region tints:
  a green-tinted canvas there reads as one more cluster colour, and the tabs'
  cool white chips read as a twelfth. **Use the warm token on the board screen
  and the plain one everywhere else** — mixing them in one screen is the drift
  this section exists to prevent.
- `radius` is picked by role (`chip` 12 · `md` 16 · `btn` 20 · `lg` 24 card ·
  `modal` 32; `cell` is a *fraction* of tile size). **A capsule on a
  fixed-height view uses `height / 2`, not `borderRadius: 999`** — an
  out-of-spec radius is clamped by the platform and both iOS and Android can
  land on square corners instead (this is what made the bottom nav's selected
  pill render as a rectangle on some devices; `BottomNav.tsx` now derives every
  dimension, including the label's `lineHeight`, so the bar and the pill have
  exact radii). `999` survives only on content-sized views — pill buttons, the
  rule chips, the hint pill — where the height isn't known up front.
  `shadow` has exactly three
  presets — `card`, `raised` (primary button, tab bar), `modal` — all soft and
  vertical; no hard dark drops. `typography` is the type scale; `overline` is
  the only uppercase style and keeps its tracking modest, because uppercase +
  bold + wide tracking at once reads as shouting. `space(n)` is 8-point-ish
  (`space(2)`=8, `space(4)`=16, `space(6)`=24).
- Modal backdrops use the exported `scrim` (a soft green shade) rather than
  per-file `rgba(...)` literals; the tutorial's blackout scrim stays near-opaque
  dark on purpose. **Every full-screen cover also spreads `overlayZ`**
  (`zIndex`+`elevation` 24) — `WinOverlay` · `FailOverlay` · `HelpOverlay` ·
  `SettingsOverlay` · `TutorialOverlay` · `WinFlourish`, plus the splash's own
  higher `root`. On Android a scrim does *not* cover an earlier sibling that has
  a shadow: elevation beats document order, and RN flattens layout-only Views
  away, which promotes shadowed leaves into siblings of the scrim. That is
  exactly how the board screen's three rule chips (`shadow.card`, elevation 3)
  used to sit lit up on top of the win card's dimming. The token also carries
  `shadowColor: "transparent"`, because elevation buys a *shadow* along with the
  z-order and a screen-sized translucent view casts a big dark one — that is
  what put mismatched grey rectangles behind the modals on the first pass.
  Anything new that covers the screen needs the token. `app.json`
  (`userInterfaceStyle`/`backgroundColor`/splash/notification colour) and
  `App.tsx`'s `<StatusBar style="dark" />` are part of the theme — keep in sync.

### Board

- Cells are **rounded tiles** (radius = 0.2 × tile) with a 1px gap between them
  (the bed's `bedGap` shows through), a **1px rim in a deeper shade of the
  tile's own colour**, and a **full-strength embossed glyph** of the board's
  plant (the same species on every tile — see One plant per board). Everything a tile needs is derived in `Cell.tsx` from the one base tint
  in `REGION_COLORS` (which is the *available* colour): `available` · `excluded`
  (only *softened* — ~0.8 saturation and a touch paler) · `planted` (saturation
  boosted, bright white rim, small drop shadow, full-colour sprite) · `rim` and
  `glyph` (saturated up and scaled down in luminance). **Keep `rim`/`glyph`
  on-hue**: mixing a pastel toward a dark neutral turns the silhouette into a
  grey smudge and costs the tile its cluster identity. **Do not drain
  `excluded`** either: which cluster a ✕'d cell belongs to is information the
  player is still reasoning with, so the hue must survive the mark — the ✕
  carries the eliminated state, the tile only steps back. A solved cell should
  be the most vivid, most physically raised thing on the board — that's the
  player's payoff.
- **No bold cluster borders.** Clusters read by colour + glyph; tile gaps and
  rims are uniform everywhere. There is **no bevel** — a top-light/bottom-shade
  pair only muddies a pastel; the rim does the separating.
- The ✕ must be **legible at a glance but never louder than a plant.** Most
  cells on a solved board end up eliminated, so a heavy mark turns the board
  into a field of dark crosses and the player's own placements stop being what
  you see first — but a mark the player has to squint at is worse, since ✕s are
  the working notes the whole deduction runs on. The restraint therefore comes
  from the **thin stroke, not from being small or washed out** — Ionicons'
  thinnest round-capped `close-outline` at ~0.66 of the tile, `theme.mark`
  forest green at 0.85 opacity, over a silhouette that recedes to 0.14 under a
  mark so the glyph reads on a clean field, stamping on with a short scale from
  0.8 plus a few degrees of rotation. Ranked loudness on a tile, and the
  ordering any future change has to preserve: **placed plant > embossed
  silhouette-plus-tile-colour > ✕**. A *mistake* ✕ is the one exception — solid
  `close`, larger, near-opaque, `dangerDark` — because there are only ever a
  few of them and they mean something different.
- The board sits in a **cream mat** (`theme.bed` face · `bedEdge` outer border ·
  `bedGap` in the tile gaps · `bedRim` carved ring set 3px inside the border —
  no texture assets), `FRAME` 12 / `FRAME_BORDER` 1.5 in `Board.tsx`, corner
  radius `radius.tray`. Note `bedGap` is **inset to exactly the grid's
  footprint**, so the mat around the grid keeps the lighter face colour and the
  grid reads as sunk into the tray. The tray is **lighter than every tile**,
  which inverts the old sage-grey design — that one worked by being the darkest
  thing on the board. It can do this because each tile now carries its own rim:
  the nearest tile sits only 61 redmean units from the tray, but that tile's rim
  sits 153 away, so a tile's outline no longer depends on the tray. **Re-check
  both numbers together if either the palette or the tray changes.**
  `GameScreen` lays the whole screen on a very faint vertical
  `expo-linear-gradient` in the warm ivory key.
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

- Header is **back arrow · level name · `?`**, the two controls as matching soft
  white discs (`headerCircle`). No capsule around the level (it isn't
  interactive) and no "Help ?" text.
- The three rules get the **full card only during the tutorial**; afterwards
  they're three white pill chips (`One per line` / `One per color` /
  `No touching`) that expand to a one-line explanation on tap. The reclaimed
  vertical space goes to the board. The chips are **equal thirds** (`flex: 1`,
  full content width) — content-sized pills overflowed both screen edges on a
  390pt phone. Since a chip can no longer grow past its third, the *label* is
  what gives: `chipFontSize` derives the type size from the measured third minus
  the icon and padding (`CHIP_*` constants), so the row fits from 320pt up
  without ever ellipsizing. Re-measure `CHIP_LABEL_PT` if the labels change.
- The **clock is the headline number** (33pt) and the hearts are smaller; those
  two are the whole status row. A "mistakes left" caption sits under the hearts
  for a not-yet-onboarded player only — and the row has a fixed height so its
  arrival/departure never shifts the board. A `Best <time>` caption used to sit
  here too and was **deliberately removed**: it only rendered once the level had
  a recorded time, so it appeared exactly on replays, turning a re-solve into a
  time trial against yourself on a puzzle you already know the answer to. Levels
  now keep **no best time at all** — not stored, not shown; **stars are the
  level's record**. The solve clock still runs and still decides the under-par
  star, it just isn't compared against a previous run. `plantdoku:best:level:*`
  is dead (see `legacyLevelBestKey`, kept only so `flushData` clears old
  installs), and `level_completed` no longer carries `new_best`. Daily and
  endless are untouched and still track their own bests. Don't re-add either the
  caption or the storage without asking.
- The gesture reminder pill is **onboarding copy, not a control**: it shows on a
  first-time player's board and lives in Help from then on. Its row keeps its
  height either way, so finishing the tutorial can't jolt the board up-screen.
- Controls are ranked **by footprint, not by contrast**. **Hint** is the row's
  hero: the widest and the only filled button, in `forest` deep green with white
  type — it is what a stuck player is looking for, and `accent`'s bright lime
  would fight the pastel grid directly above it. It leads on width *only*: an
  earlier pass also gave it a taller face and 20pt type and it stopped reading
  as a button in a row (all three share a height, and the hero's wrapper column
  must not pass `flex` to it — flex-grow in a column stretches it vertically and
  leaves a slab of its dark bottom edge showing).
  **Undo** sits beside it as a cream `warm` pill, and **Reset** is a narrow
  rounded `compact` button *of the same cream family*, captioned "Reset". Both
  carry gold info badges (undoable-move count / hints used) inside their own
  button's width. An earlier pass ranked Reset down by draining it to a
  borderless outline, which just made it look disabled — don't do that again;
  shrink the target, keep the contrast.
  Reset **arms on first press** (circle turns red, caption becomes "Tap again",
  falling back after 3.5s) whenever there is progress to destroy; a **long
  press** skips straight to the reset for players who already know the control,
  and a blank board needs no confirmation at all.

### Launch splash

The static native splash (`expo-splash-screen`, `assets/splash-icon.png` on
`bg`) is only the first frame: `App.tsx` calls `preventAutoHideAsync()` at
module load and `hideAsync()` after first paint, so the animated
`SplashScreen.tsx` is already on screen when the native one lifts — no flash of
empty canvas. It renders **outside** the `SafeAreaView` so it covers the
status-bar inset too. The beat (`SPLASH_MS` 2.9s, incl. a 320ms fade-out):
planter tray drops in → nine palette tiles pop in sequence (3×3) → the `sprout`
sprite rises out of the centre tile with drifting leaf sparks → wordmark →
tagline → loading bar. It is
**never a gate** — a tap anywhere skips to the end, `onDone` is fired at most
once, and it holds no game state (the app is fully live behind it).

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
- **The card carries exactly one sentence** (Royal Match's bar): the headline —
  `<Card> unlocked!`, else `Level 12 complete` / `Daily solved!` / `Solved!`, so
  the title carries the context and nothing else has to. Everything below it is
  **hero → three star glyphs → one row of icon+number chips → Continue**. The
  chips are ⏱ time · 🔥 streak · 🪙 coins · 🎁 chest (gold-filled, the loud one
  — see Coins), built from the `facts` array; a fact with no value simply isn't
  in the row. This card was a receipt once — an overline tag, a three-row goal
  list restating the rating in words, a coin chip row, a separate time line —
  and each pass cut prose, not information. Two consequences to keep: the star
  glyphs stand alone (no `3★ needs: …` line; the goals live in the level's own
  screens), and the next-card bar shows a bare `★ 34/40` because the "?" card
  above it already says what is being chased. **Add a number to the chip row,
  never a new line of text.**
- **Exactly one action, in every mode: `Continue`, which returns to Home.** The
  card ends the session on this board; picking the next one is Home's job (the
  path map, the Daily tab, the Endless popover), so the win card no longer
  carries a next-level shortcut, a `New board` button, a daily `Share`, the
  `Next: Level N` line or a `Menu` text link — `WinOverlay` has no `onNext` /
  `hasNext` / `onShare` props at all. Don't re-add them without asking.
  `GameScreen`'s `onHome` prop (App switches to the Home *tab*, not just out of
  the board) is what makes Continue land on Home even for a daily or endless
  run; the header back arrow still uses `onMenu` and returns to the tab you
  came from.

### Page backdrop

The whole tab shell sits on a **painted garden illustration**
(`assets/home-bg.jpg`, mounted in `App.tsx` as `PAGE_BG`). It is full-bleed at
the *root*, **outside** the `SafeAreaView`, so the status-bar inset is part of
the scene rather than a strip of flat canvas above it — and it is mounted only
while `!playing`: the board screen keeps its own warm ivory gradient, because
that screen's job is to show eleven pale region tints and a photographic
backdrop behind them would be one more thing competing with the grid.
`styles.safe` is therefore transparent; `styles.root` keeps `theme.bg` as the
flat canvas underneath.

Cards on this screen are a **warm white veil** (`VEIL`, ~93% opaque) rather than
flat `theme.panel` white — the illustration stays faintly visible through them,
which is what keeps the screen reading as one scene instead of opaque cards
pasted on a photo.

The corollary: **loose dim type can no longer float on the page**. The backdrop
is busiest along the bottom (pots and flowers), so anything sitting there needs
its own surface — `CardsScreen`'s footer caption carries a veil chip for exactly
this reason. Text in the calm upper half is fine bare.

### Home

Home is a **level-path map**, and it **never scrolls** — wordmark → the path →
Play + Endless, all on one screen. It is a fixed flex column, not a
`ScrollView`; anything added here has to earn its height from something else.
The screen was cluttered once — a stats card under the title, Endless as a
full-width card, a "Next unlocks" panel along the bottom — and all three were
cut for exactly that reason. Don't put them back; the meta that survived moved
*onto the path* (see the reward plant below), which is the pattern to follow.

- **The path is the centrepiece and the only elastic thing on the page**
  (`pathNodes` + `LevelNode`). It takes `flex: 1`, measures what it was actually
  given (`onLayout` → `pathH`) and derives its row height and disc size from
  that, clamped to `ROW_MIN/MAX` and `NODE_MIN/MAX`. Nothing in the path may be
  a fixed height that assumes a screen size.
- A window of `PATH_WINDOW` (**2**) levels threaded on a vine, **highest level at
  the top** so the ladder is climbed upward: where the player is, and where
  they're going. Nodes: solved = green disc + check badge + a plant grown in the
  left gutter; current = green disc with a **gold ring**, pulsing on the same
  `Animated.Value` as the CTA (one heartbeat leads the eye from map to button),
  with a pointed "Current level" flag; locked = pale disc + padlock. Every
  `MILESTONE_EVERY` (10) level is a **gold chest node** worth `MILESTONE_COINS`
  — both imported from `game/economy.ts`, never redeclared here, so the chest
  shown is the chest that pays — and the next one above the window is appended
  as a dangling teaser after a visual `gap`; that dangle is the whole point of a
  path map. The chest + its "Reach level N for 100 coins" blurb only ride a
  milestone that is still `locked` (`teasing`); once it's the current level or
  behind, the node goes back to normal status dressing and just keeps its gold
  ring — which is also the moment the bonus is paid (see Coins / revive).
- **Tapping a node plays that level** — `onLevel`, wired to `App.tsx`'s
  `startLevel(level)` (which still picks the level's resume slot up when it
  matches). This is the app's only level select; locked nodes are `disabled`.
- **The card being chased grows beside the current level** (`reward` =
  `nextCard(totalStars)`, in that node's left gutter, tapping through to the
  Cards tab). This is not decoration and it is not arbitrary: that plant *is*
  the species on the board right now (see One plant per board), so the path, the
  grid and the unlock hero all show the same thing. It carries the plant, its
  name and a `totalStars/required` ★ chip — and no card frame, because it should
  read as something growing by the path rather than as a panel. It replaced the
  bottom "Next unlocks" strip, which showed three cards the player couldn't act
  on. Falls back to a decorative sprite once the collection is complete.
- **One primary action, with a door beside it.** Play and Endless share one row
  at **3:1** (`ctaRow` / `ctaMain` / `ctaSide`). A saved board *is* the big green
  button (`Continue <board>`, with `N/M planted · time elapsed` on its face);
  Endless is the quarter, in the cream key rather than green so it reads as a
  door and not a peer. Its three difficulties don't fit a quarter, so they lift
  into a small popover **above** the button (`endlessPop`, `bottom: 100%`) on
  tap. Locked, it shows a padlock and `N/15`. The row renders even when the
  ladder is finished (the "All levels complete" card takes the `ctaMain` slot),
  so completing the game can't take Endless away with it. The one other entry
  point allowed: when the saved board is a *daily or endless* run, a quiet text
  link offers the level ladder, which would otherwise be unreachable here.
- The wordmark's plants are a **planted bed** — overlapping sprites at staggered
  heights with a slight lean, standing in a `soil` mound — rather than a
  detached row of icons. On a **short screen** (`compact`, window height < 720)
  the bed goes and the title shrinks, and the panels drop their headers: an
  SE-class phone can't carry full branding *and* a readable path, and the path
  is what the screen is for.
- The full collection lives on the Cards tab; Home shows only the one card
  being chased, on the path.

## Architecture / file map

Game core is **pure TypeScript, framework-free**, so it runs under plain Node
(tests) — keep it free of `react-native` / `require('*.png')` imports.

```
src/game/
  types.ts       Difficulty, CellState, Puzzle (one `plant` per board),
                 DIFFICULTIES (6/8/9)
  levels.ts      LEVELS: 30 curated {difficulty, seed} + getLevel — pure data
  daily.ts       daily puzzle: date key -> seed (FNV-1a, golden-pinned) + streak
                 date math — pure data, headless-safe
  stars.ts       par times (size+tier) + starsFor — headless-safe
  economy.ts     coin faucet + revive price + chest levels/bonus (every
                 tunable number) — headless-safe; HomeScreen imports
                 MILESTONE_* so the chest shown is the chest that pays
  cards.ts       plant-card collection: 17 cards + star milestones, unlock
                 helpers — headless-safe
  palette.ts     PLANT_IDS (17, one picked per board) + REGION_COLORS
                 (11 pastels) — pure data,
                 headless-safe
  plants.ts      id -> require(png) sprite map — RN ONLY (do not import in core)
  generator.ts   generatePuzzle(difficulty, seed?) -> logic-solvable, tier-gated
                 Puzzle; seeded = deterministic (mulberry32 behind all randomness)
  solver.ts      countSolutions / enumerateSolutions / findSolution (backtracking)
  logicSolver.ts rateBoard -> {solved, tier 1..3, unsound} human-style propagation
  validator.ts   findConflicts (row/col/cluster/adjacency) + isSolved
  runTests.ts    headless correctness tests (npm test)
src/state/useGame.ts   reducer hook: PAINT/ERASE/PLACE/TAP, undo/reset/hint,
                 REVIVE (paid +1 heart, board kept) + the coin balance,
                 boardPlant (board species = the card being chased),
                 RESTORE (resume), timer, unlocked level + per-level stars +
                 onboarded + soundOn + resume slots (AsyncStorage)
src/audio/index.ts     SFX facade over expo-audio (play(SoundName), mute) —
                 RN ONLY, no-op on web (do not import in core)
src/components/
  Board.tsx      n×n grid + PanResponder gestures (the gesture brain) + highlight ring
  Cell.tsx       display-only cell; derives the available/excluded/planted
                 tile tints from the one region colour
  GameScreen.tsx header (back · Level N · ?), collapsible rules, stats, board,
                 ranked controls, win overlay; haptics; first-play tutorial
  HomeScreen.tsx Home tab (never scrolls): planted-bed wordmark, the elastic
                 level-path map (tap a node to play; next card grows beside the
                 current one), Play/Continue + Endless quarter (level-15 lock)
  CardsScreen.tsx Cards tab: full collection grid (locked = silhouette + ★ cost)
  DailyScreen.tsx Daily tab: today's puzzle CTA, streak, solve-history list
  BottomNav.tsx  hand-rolled 3-tab bar (Home/Cards/Daily, dot = daily not done)
  TutorialOverlay.tsx  spotlight blackout + coach card (first-play tutorial)
  HelpOverlay.tsx  "How to play" card
  SplashScreen.tsx animated launch splash (tray + tiles pop in, sprout rises,
                 wordmark, loading bar) — cosmetic only, tap to skip
  SettingsOverlay.tsx settings modal: SFX toggle (useGame.soundOn/setSoundOn) +
                 flush game data (inline confirm; uses useGame.flushData —
                 wipes all AsyncStorage keys, back to L1)
  Tappable.tsx   the app's only Pressable — pass-through wrapper that plays the
                 UI click (`silent` opts out). Button renders through it.
  Button.tsx (solid/forest/ghost/warm/danger + pill/small/iconOnly/
  compact, optional long-press), WinFlourish.tsx (big plant
  bloom before the win modal), WinOverlay.tsx (card-flip reveal + Continue),
  FailOverlay.tsx (out-of-hearts game over: paid Revive / Try again / Menu),
  Hearts.tsx (lives row), Confetti.tsx
src/theme.ts     design tokens: colour · radius · shadow · typography · space
src/format.ts
App.tsx          tab shell: full-bleed garden backdrop + global HUD
                 (★ wallet → Cards, 🔥 streak, ⚙) +
                 Home/Cards/Daily pages + BottomNav; `playing` swaps in a
                 full-screen GameScreen (no HUD/nav); Android back returns
                 to the Home tab first; resume-aware Play/Daily entry points
                 + AppState listener (reminder re-sync + resume flush)
scripts/gen_art.py           Gemini image-gen for the raw art (prompts + CLI)
scripts/slice_sprites.py     sprite-sheet slicer (PIL + SciPy)
scripts/pick_level_seeds.ts  offline seed picker for the level table
scripts/prep_sfx.py          CC0 masters (art/sfx) -> assets/audio/*.wav:
                             layer, trim, level-match per cue, --check audit
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
> **The app icon and splash have been replaced too**: the master logo lives at
> `art/logo.png` (owner-supplied) and `python3 scripts/build_icons.py`
> regenerates the whole launcher set from it — `assets/icon.png` (opaque,
> 1024², art at 94% on `#F3F6EA`), `splash-icon.png` + `favicon.png`
> (transparent), the Android adaptive `android-icon-foreground.png` (66% safe
> zone), a flat `android-icon-background.png`, and a themed
> `android-icon-monochrome.png` derived from the artwork's linework. Rerun the
> script after any logo change instead of hand-editing the PNGs. Full plan,
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
hearts + red-✕ mistakes, hint, undo/reset, timer + per-level stars,
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
