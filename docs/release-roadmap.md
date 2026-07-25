# Plantdoku — Release Roadmap

Status assessment (July 2026) and the path to publishing on Google Play and
the App Store. Organized as: **P0 blockers** (cannot submit without),
**P1 pre-launch polish** (quality bar for a good first impression), and
**P2 post-launch / fast-follow**. Each item says *why* it matters, not just what.

---

## Where the app stands

Already done and in good shape — no work needed here:

- **Game core**: seeded deterministic generator with logic-solvability gating,
  60 curated levels, daily puzzle + streaks, endless mode, stars, 17-card
  collection meta, hearts/fail, hints, undo/reset.
- **Onboarding**: 6-stage interactive spotlight tutorial + Help overlay.
- **Feel**: haptics, SFX facade, confetti, animations, gesture model tuned.
- **App config**: icons (incl. Android adaptive + monochrome), splash, bundle
  ids (`com.mithatcanturan.plantdoku`), EAS project + build profiles,
  `ITSAppUsesNonExemptEncryption` set, portrait lock, dark UI style.
- **Analytics**: PostHog facade with a full event taxonomy (funnel, mistakes,
  hints, cards, onboarding).
- **Notifications**: local reminder system (daily-ready, streak-risk,
  re-engage) with settings toggle; push-token plumbing for a future backend.
- **Compliance docs drafted**: `docs/privacy-policy.md`,
  `docs/terms-of-service.md`, `docs/store-privacy-disclosures.md` (fill-in
  answers for both stores' privacy forms).
- **Verification**: headless game-core test suite + typecheck; web smoke-test
  path.

---

## P0 — Release blockers

### Art / IP

The shipped art copied *Plants vs. Zombies* character designs (Peashooter,
Sunflower, Chomper, Cherry Bomb, Garlic) under their trademarked names — which
were also the ids in `palette.ts` and the card names in `cards.ts`. That risks
takedown and developer-account termination on both stores, so it outranks
everything else on this list.

- [x] **Plant sprites replaced.** *Mostly done.* The 17 ids are now the
  owner's own AI-generated botanical set, normalised to 512² by
  `scripts/prep_sprites.py`; the infringing files are deleted. Spec, style and
  prompts: `docs/art-brief.md`.
- [ ] **Replace the 4 placeholder sprites** — `sunflower`, `daisy`, `cactus`,
  `aloe` are `PLACEHOLDER` stand-ins. Generate them (prompts are in the brief's
  appendix), drop into `art/raw/`, re-run prep. **`npm run sprites:check` fails
  until then** — wire it into the release gate so a build can't ship one.
- [ ] **Rebuild the app icon + splash** from the new set: `assets/icon.png`,
  `assets/splash-icon.png`, `assets/android-icon-foreground.png`,
  `assets/android-icon-monochrome.png`, `assets/favicon.png` still show the
  copied Sunflower and Cherries. (Also fixes the stray accent in the current
  wordmark: "PLANTDÓKU".)
- [ ] **Decide on git history.** The infringing PNGs are gone from the working
  tree but remain in past commits — scrub with `git filter-repo` if the repo
  goes public.

### Meta / store

- [ ] **Start Google Play closed testing immediately** — this is the
  longest-lead item. Personal developer accounts created after Nov 2023 must
  run a closed test with **12+ testers opted in for 14 continuous days**
  before production access is granted. Upload a production AAB to a closed
  track now; everything else on this roadmap can proceed in parallel while
  the clock runs.
- [ ] **Host the privacy policy & terms at public URLs.** Both stores require
  a live URL, not a repo file. Publish `docs/privacy-policy.md` and
  `docs/terms-of-service.md` (e.g. on mithatck.com or GitHub Pages) and put
  the URLs in both store listings. Also resolve the placeholder in the
  privacy policy: decide whether `benmithat18@gmail.com` stays as the contact
  or a dedicated support address replaces it — the doc itself flags this.
- [ ] **First production build.** Only preview APKs have been built so far.
  Run `eas build -p android --profile production` (AAB, auto-increment is
  already configured) and verify it installs and plays clean on a real device.
- [ ] **Set `EXPO_PUBLIC_POSTHOG_KEY` / `_HOST` as EAS environment variables**
  for the `production` (and `preview`) environments. `.env` is gitignored, so
  EAS cloud builds don't see it — without this, release builds ship with
  analytics silently no-oping and launch week is flying blind.
- [ ] **Store listing assets**:
  - Screenshots: Play needs phone shots (min 2, 16:9-ish); App Store needs
    6.9"/6.5" iPhone sets. Screenshot the strongest moments: mid-solve board,
    win + confetti, card collection, daily streak, tutorial spotlight.
  - Play **feature graphic** (1024×500) — required.
  - Short description (80 chars), full description, keywords/subtitle (iOS).
    ASO angle: "logic puzzle", "no guessing", "one per row/column/region" —
    do **not** reference LinkedIn or "Queens" (trademarks) in the listing.
  - Check the name **"Plantdoku"** is available on both stores; "-doku" names
    are crowded.
- [ ] **Store forms** (answers already drafted in
  `docs/store-privacy-disclosures.md` — transcribe, don't re-derive):
  - Play Data Safety form + "No ads" declaration + IARC content rating
    questionnaire + target-audience section (declare 13+ / not
    child-directed to stay out of the Families policy surface).
  - App Store App Privacy questionnaire + age rating.
- [ ] **iPad decision.** `supportsTablet: true` means App Store review runs
  it on iPad and requires iPad screenshots. The board caps at 460 px wide so
  nothing breaks, but the layout will look sparse on a 13" screen. Either do
  an iPad layout/screenshot pass, or set `supportsTablet: false` for v1
  (can be enabled later; the reverse is not allowed).
- [ ] **Decide launch platforms.** Android-first is the low-friction path
  (account likely exists; closed testing is the only gate). iOS adds the
  Apple Developer Program ($99/yr), TestFlight pass, and the iPad decision.
  Recommendation: Android first, iOS 2–4 weeks behind with the lessons learned.

### Repo / build hygiene

- [ ] **Remove the 9 committed APKs (~570 MB) from git** and add `*.apk` to
  `.gitignore`. They bloat every clone and the EAS upload archive. (History
  rewrite via `git filter-repo` is optional; at minimum `git rm --cached` +
  ignore going forward.)
- [ ] Delete the stale local `ios/` and `android/` folders (gitignored but
  present from June) so `expo run:*` and EAS always prebuild fresh from
  `app.json` — stale native folders silently win over config changes.

---

## P1 — Pre-launch polish (do while the closed test runs)

### Gameplay / in-app

- [x] **Resume in-progress board.** *Done.* Mid-solve state (board, red-✕ set,
  elapsed, hearts, hints) persists to `plantdoku:resume` as one slot per mode;
  Home shows a **Continue** card, PLAY resumes a matching level instead of
  restarting it, and the Daily CTA becomes "Continue today's puzzle". Flushed
  on leaving the board and on app background. See CLAUDE.md → Resume.
- [ ] **Notification permission priming.** The reminder preference defaults
  *on*, but OS permission is only ever requested if the player toggles it in
  Settings — meaning most players never grant it and no reminder ever fires
  (Android 13+ and iOS both require a runtime prompt). Add a contextual ask
  at the natural moment: after the first daily solve, a small "Remind me
  tomorrow? 🔔" card that triggers the OS prompt. Never ask cold on first
  launch.
- [ ] **Rate-the-app prompt.** Add `expo-store-review` and request a review
  at a high point — e.g. first 3★ solve past level 8, or a 3-day daily
  streak; once per install, never after a fail. Cheap, and early ratings
  decide store ranking.
- [ ] **Replace the placeholder SFX.** Current clips are stdlib-synthesized
  (`scripts/make_sfx.py`). Swap in designed sounds (freelance sound pack or a
  library like Kenney/ZapSplat — check licenses) keeping the same filenames;
  the facade needs no code change. Audio is the #1 "feels cheap" tell in
  hybrid-casual.
- [x] **Drop-off analytics.** *Done.* `tutorial_step` (one per stage reached,
  stable names) makes first-play drop-off visible, and `board_abandoned`
  (progress %, seconds, hints, hearts left) separates rage-quits from
  put-the-phone-down; `board_resumed` measures whether Continue gets used.
  These are the launch-week questions the old taxonomy couldn't answer.
- [ ] **Crash reporting.** There is none — production crashes would be
  invisible (Play's ANR/crash console only catches native ones). Add
  `@sentry/react-native` (or PostHog error tracking since the SDK is already
  in) and update `store-privacy-disclosures.md` + the privacy policy if the
  data collected changes.
- [ ] **Settings additions**: haptics toggle (sound has one, haptics don't),
  app version display (`expo-application` is already installed), links to the
  hosted privacy policy / terms, and a support/contact row. Standard
  review-proofing and user trust.
- [ ] **Edge-to-edge / safe-area audit.** The shell uses RN's `SafeAreaView`
  (iOS-only) plus manual `StatusBar.currentHeight` padding. SDK 54 enforces
  edge-to-edge on Android 15+; verify the bottom nav clears the gesture bar
  on a modern device, and consider `react-native-safe-area-context` if not.
- [ ] **Accessibility pass (scoped).** Add `accessibilityLabel`s to the HUD,
  nav, and control buttons; verify the app survives large font scaling
  (`allowFontScaling` on tight labels like the hint pill). Full screen-reader
  board support is out of scope for v1 — colorblind players are already
  served by the per-cluster glyphs.
- [ ] **Device test matrix before promoting to production**: small phone
  (~5", 320 dp width — does the 9×9 board + controls fit?), tall phone,
  Android 13/14/15, airplane mode (everything is offline — confirm no hangs),
  process-death restore (relates to Resume above), date rollover mid-daily.

### Release gate (mechanical, per build)

- [ ] `npm test` + `npm run typecheck` + `npm run sprites:check` green.
- [ ] `npx expo export -p android` bundles clean.
- [ ] Fresh-install run-through on device: tutorial → L1–3 → daily → a fail →
  flush data → tutorial again.

---

## P2 — Post-launch / fast-follow

Roughly in recommended order:

- [ ] **Monetization decision.** Currently zero revenue surface, and the
  privacy docs proudly promise "no ads, no IAP" — that's a real positioning
  asset for launch reviews. Post-launch options, in ascending complexity:
  1. One-time **"Supporter" IAP** (tip jar / golden plant cosmetic) — no
     privacy-doc impact beyond a purchases line.
  2. **Rewarded ads for extra hints/hearts** — fits the heart economy, but
     requires AdMob SDK, ATT thinking on iOS, and rewriting the privacy
     policy + both store forms. Decide *before* building.
  Let launch retention data pick: strong D7 retention justifies IAP; weak
  monetizable engagement suggests staying free as a portfolio piece.
- [ ] **More levels** (L61+) — the seed-picker script and append-only CURVE
  make this cheap; "more levels coming soon" is already in the UI. Ship a
  batch ~monthly as a re-engagement beat (and a push campaign once a backend
  exists — the token plumbing is done).
- [ ] **Statistics screen** — solves, win rate, average time by difficulty,
  streak history. Puzzle players expect it; data is mostly already persisted.
- [ ] **Daily archive** — calendar of past dailies (the seed function is
  date-keyed, so any past board is reproducible for free). Big daily-habit
  retention lever.
- [ ] **Localization.** All strings are hardcoded English; `expo-localization`
  is installed but unused (drop the plugin if not pursuing this). If pursued:
  extract strings, start with Turkish + English, localize the store listing
  first (cheapest ASO win).
- [ ] **Leaderboards** (Game Center / Play Games) for endless + daily times.
- [ ] **Cloud save / progress transfer** — everything is in AsyncStorage;
  device loss loses progress. Android auto-backup covers some of it for
  free — verify, then consider explicit backup with any future backend.
- [ ] **Ambient music** — optional loop behind the SFX facade with its own
  toggle.
- [ ] **Remote push backend** for "new levels / new card" campaigns
  (`PushPayload` contract is already defined in `src/notifications/`).

---

## Suggested sequence

| Week | Focus |
|---|---|
| 1 | P0: production AAB → **closed testing track (starts the 14-day clock)**, host privacy/ToS, EAS env vars, repo cleanup, recruit 12+ testers |
| 2 | P1 code: resume-in-progress, notification priming, rate prompt, crash reporting, settings additions |
| 3 | P1 content: designed SFX, store listing (screenshots, feature graphic, descriptions/ASO), device matrix + a11y pass; iterate on tester feedback |
| 4 | Store forms final, promote to production on Play. Start iOS track (Apple account, TestFlight, iPad decision) if going iOS |

**Biggest schedule risk**: the Play closed-testing requirement (14 days,
12 testers) — start it before anything else. **Biggest product risks**: no
crash visibility and losing an in-progress daily — both are Week-2 items.
