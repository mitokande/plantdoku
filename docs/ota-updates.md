# Over-the-air updates — options and plan

Notes on shipping JS/asset updates to installed Plantdoku builds without a store
release. Nothing here is implemented yet — `expo-updates` is **not** currently a
dependency.

## What OTA can and cannot ship

EAS Update (and every alternative below) replaces the **JS bundle + assets** —
`src/`, the plant PNGs, the six WAVs. It cannot change native code.

| OTA-able | Store build required |
| --- | --- |
| Game logic, `levels.ts`, `stars.ts`, `cards.ts`, `daily.ts` | New native dep (`npx expo install` of anything with native code) |
| Screens, `theme.ts`, copy | `app.json` plugin changes |
| Sprites, SFX WAVs | Expo SDK bump, RN version bump |
| Analytics events | App icon / splash native config, permissions |

### Two hazards specific to this app

- **Generator and seed changes are not safely OTA-able.** Per the NOTE in
  `CLAUDE.md`, changing the generator changes what every seed produces. Over OTA
  that becomes worse than a re-pick chore: players on the old bundle and the new
  one would disagree about today's daily board and about the curated levels.
  Treat any `generator.ts` / `logicSolver.ts` / `dailySeed` change as a store
  release, or accept that the rollout must reach everyone at once.
- **Persistent state survives an OTA.** `plantdoku:resume` (`RESUME_VERSION`),
  `plantdoku:stars`, the daily keys and the prefs are all still there. A bundle
  that changes those shapes must bump the version and rely on
  `parseSlots`/`validSnapshot` to drop stale slots — an OTA install is never a
  clean install.

## Option 1 — `expo-updates` + EAS (recommended here)

The EAS project already exists (`extra.eas.projectId` in `app.json`,
`b29a2752-0527-4cb3-8f41-d60690d8fedb`) and `eas.json` already has
development/preview/production profiles, so this is the least work by a wide
margin.

### Setup

```bash
npx expo install expo-updates
eas update:configure        # writes runtimeVersion + updates.url into app.json
```

`android/` and `ios/` are checked into this repo, so the native updates config
also has to land in them — run `npx expo prebuild` afterwards (or hand-edit
`Expo.plist` / `AndroidManifest.xml`); `eas update:configure` reports what it
needs.

`eas.json` — give each profile a channel:

```json
"preview":    { ..., "channel": "preview" },
"production": { ..., "channel": "production" }
```

`app.json`:

```json
"runtimeVersion": { "policy": "appVersion" },
"updates": { "url": "https://u.expo.dev/b29a2752-0527-4cb3-8f41-d60690d8fedb" }
```

**`runtimeVersion` is the safety interlock** — a build only accepts updates
published under the same runtime version. With `policy: "appVersion"` (currently
`1.0.0`) any native change forces a version bump, which automatically stops the
new JS from reaching old binaries. Do **not** use `"sdkVersion"`: it is too
coarse and will happily push JS that needs a native module the installed app
doesn't have.

### Publishing

```bash
eas update --channel preview    --message "tune mark SFX level"
eas update --channel production --message "L31-60 seed fix"
```

Default behaviour: check on launch → download in background → apply on the next
cold start. A fix lands one relaunch later.

### Rollback

`eas update:republish` re-points a channel at a previous update. That is the
undo, and it is why production is promoted only after dogfooding the `preview`
APK. There is no recovery over OTA from a bundle that hard-crashes on launch —
the check may never run — so that case needs a store build.

### Fitting it to Plantdoku

- The splash is the natural place for `Updates.checkForUpdateAsync()`:
  `SPLASH_MS` is 2.9s and the app is fully live behind it. But keep the rule
  that **the splash is never a gate** — fire-and-forget, and only call
  `Updates.reloadAsync()` if the fetch resolves before the splash ends. Never
  make the player wait on the network.
- Add `Updates.updateId` / `Updates.channel` as super-properties on the PostHog
  client in `src/analytics/`. Without them a bundle that breaks the
  `tutorial_step` funnel is indistinguishable from one that doesn't — everything
  just reports as `1.0.0`.

## Option 2 — `expo-updates`, self-hosted

The update protocol is an open spec; the library can point at any server. You
host the manifest + assets, sign manifests with your own key, and lose the
CLI/dashboard/rollback ergonomics. Same library, same native integration. Only
worth it under a hard self-hosting requirement.

## Option 3 — `react-native-code-push`

The original non-Expo answer. Microsoft retired App Center as a hosted service
(2025) and open-sourced the server, so this is now self-hosted too: run
`code-push-server`, point the SDK at it, get background download / apply-on-
restart plus staged rollouts and automatic rollback on launch crashes.

Caveats: community-maintained now — check its current state before committing —
and it conflicts with `expo-updates`. Both want to own the bundle at boot; pick
one.

## Option 4 — third-party hosted services

Several vendors resell CodePush-style hosting for RN. Workable, but it trades
Expo's first-party integration for someone else's when an EAS project already
exists.

## Option 5 — roll your own

Not viable. React Native has no supported public API for swapping the JS bundle
at runtime. You would write native code on both platforms to download, verify,
stage and atomically switch bundles, plus a rollback path for a bundle that
crashes on launch — which is the hard part and exactly what the libraries exist
for.

## Option 6 — remote config (complements any of the above)

Sidesteps bundle updates entirely for the changes most likely to be wanted
quickly. `src/game/levels.ts` is **pure data** — 60 `{difficulty, seed}` pairs —
and so is the `CARDS` table. Fetch a JSON version at launch, cache it in
AsyncStorage, fall back to the bundled table. No native module, no store review,
no bundle swap, and it works on the web build too.

Covers: retuning the difficulty curve, appending L61+, adjusting card star
milestones.

**The constraint is the generator.** Seeds only mean anything against a fixed
generator, so a remotely-delivered level table is safe only while the generator
is byte-identical across every installed version. The payload must carry a
generator version and be **ignored** when it doesn't match the build's.

## Recommendation

`expo-updates` + EAS (option 1). Look elsewhere only under a self-hosting
requirement. Remote config (option 6) is a useful complement either way — it
covers the fast-moving changes without any runtime-version interlock risk.
