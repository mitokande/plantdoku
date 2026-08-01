// Rewarded-ad wrapper. The rest of the app calls `ads.showRewarded("hint")`
// against this typed facade rather than touching the ad SDK directly, so there
// is one place that owns the placement taxonomy, the unit ids, consent, and the
// "did the player actually earn it?" contract.
//
// Mirrors `src/analytics` and `src/audio`: one module, one default export, and
// **react-native-google-mobile-ads is imported nowhere else in the app**.
//
// NOTE: keep this out of `src/game/*` — the headless Node tests stay
// framework-free, and the economy numbers it pays out live in `game/economy.ts`.
//
// The SDK is a **native module**: it does not exist in Expo Go or on web, so the
// require below is lazy and every function degrades to the no-SDK path rather
// than throwing. That path *grants* the reward (see `showRewarded`).

import { Platform } from "react-native";

import { sdk } from "./sdk";

/**
 * Where an ad was offered from. A closed union for the same reason `EventName`
 * is one: the taxonomy stays in a single place, and it is what the analytics
 * event is keyed by.
 */
export type AdPlacement = "hint";

// ---------------------------------------------------------------------------
// Unit ids.
//
// **Never show a real ad in development.** Google treats developer clicks on
// live units as invalid traffic and suspends accounts for it, so `__DEV__`
// forces the SDK's own test unit — that is what `TestIds.REWARDED` is for, and
// it is the one branch here that must not be "optimised away".
//
// These are the owner's live units. Their **app** ids live in `app.json`'s
// plugin config (`iosAppId` / `androidAppId`) and are a separate pair — the two
// files have to agree, or the SDK initialises against the wrong app.
// ---------------------------------------------------------------------------
const REWARDED_UNIT_IDS: Record<AdPlacement, { ios: string; android: string }> = {
  hint: {
    ios: "ca-app-pub-4604843322018757/3734848951",
    android: "ca-app-pub-4604843322018757/6777879496",
  },
};

/** Simulated watch time on the no-SDK path, so the grant isn't instant. */
const STUB_MS = 400;

/** How long to wait for an ad to load before giving up and granting anyway. */
const LOAD_TIMEOUT_MS = 8000;

const supported = Platform.OS !== "web";

// The SDK, or null where there isn't one (web, Expo Go, an unlinked build).
// It arrives through a **platform-split module** rather than a lazy require:
// Metro resolves every require statically, so naming the package in this file
// would drag RN internals into the web bundle and break `expo export -p web`.
// See `sdk.ts` / `sdk.web.ts`.
const mod = supported ? sdk : null;

const unitId = (placement: AdPlacement): string => {
  const ids = REWARDED_UNIT_IDS[placement];
  const real = Platform.OS === "ios" ? ids.ios : ids.android;
  // __DEV__ is injected by the RN bundler; guard for the Node/test context.
  const dev = typeof __DEV__ !== "undefined" && __DEV__;
  return dev ? mod?.TestIds.REWARDED ?? real : real;
};

// One preloaded ad per placement. A rewarded ad takes seconds to fetch, and an
// offer the player accepted must not sit on a spinner — so one is kept warm and
// the next is fetched the moment this one is consumed.
type Loaded = { ad: import("react-native-google-mobile-ads").RewardedAd; ready: boolean };
const loaded: Partial<Record<AdPlacement, Loaded>> = {};

let started = false;

/**
 * Initialise the SDK and gather consent. Safe to call more than once, and safe
 * to never await — everything below works (by degrading) if it hasn't finished.
 *
 * Consent is requested through the SDK's UMP wrapper, which is what shows the
 * GDPR form in the EEA/UK. It is *not* the iOS ATT prompt: the plugin's
 * `userTrackingUsageDescription` in app.json covers the Info.plist string, and
 * the SDK shows the ATT prompt itself when the UMP form calls for it.
 */
async function init(): Promise<void> {
  if (!mod || started) return;
  started = true;
  try {
    await mod.default().initialize();
    const consent = await mod.AdsConsent.gatherConsent();
    // A player who can't be shown personalised ads still gets non-personalised
    // ones; nothing here may block the game from running.
    void consent;
  } catch {
    // Consent/init failures must never break gameplay — the load below will
    // simply fail and `showRewarded` grants the reward anyway.
  }
  prepare("hint");
}

/**
 * Whether an ad could plausibly be shown. The UI uses this to decide between
 * offering the ad and saying "come back later" — it must never be used to
 * decide whether to *pay*, which is `showRewarded`'s answer alone.
 */
function available(): boolean {
  // With no SDK the offer stands (and is granted); with one, the offer stands
  // whether or not an ad is warm, because `showRewarded` waits for a load.
  return true;
}

/** Warm up the next ad for `placement`. Cheap and idempotent. */
function prepare(placement: AdPlacement): void {
  if (!mod || loaded[placement]) return;
  try {
    const ad = mod.RewardedAd.createForAdRequest(unitId(placement), {
      requestNonPersonalizedAdsOnly: false,
    });
    const entry: Loaded = { ad, ready: false };
    loaded[placement] = entry;
    ad.addAdEventListener(mod.RewardedAdEventType.LOADED, () => {
      entry.ready = true;
    });
    ad.addAdEventListener(mod.AdEventType.ERROR, () => {
      // Drop the dead instance so the next `prepare` builds a fresh one.
      if (loaded[placement] === entry) delete loaded[placement];
    });
    ad.load();
  } catch {
    delete loaded[placement];
  }
}

/**
 * Show a rewarded ad and resolve **whether the reward was earned**.
 *
 * The caller owns the payout — this never touches game state, so a dropped
 * promise or a double-tap can't mint anything on its own. It also never
 * rejects.
 *
 * The one asymmetry worth keeping: an ad the player *dismissed early* resolves
 * `false` (they didn't watch it), but an ad that could not be shown **at all**
 * — no SDK, no fill, load timeout, thrown error — resolves `true`. The player
 * asked for a hint and accepted the price; being denied because the ad network
 * had a bad minute is our problem, not theirs.
 */
async function showRewarded(placement: AdPlacement): Promise<boolean> {
  if (!mod) {
    await new Promise((r) => setTimeout(r, STUB_MS));
    return true;
  }
  try {
    void init();
    prepare(placement);
    const entry = loaded[placement];
    if (!entry) return true;

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (earned: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subs.forEach((off) => off());
        // This instance is spent (or dead) either way — build the next one.
        if (loaded[placement] === entry) delete loaded[placement];
        prepare(placement);
        resolve(earned);
      };

      // An ad that never loads must not strand the player on a spinner.
      const timer = setTimeout(() => finish(true), LOAD_TIMEOUT_MS);

      // `show()` returns a promise — a rejection here (ad not ready, activity
      // gone) has to settle the offer, or the player waits on nothing.
      const show = () => {
        try {
          void entry.ad.show().catch(() => finish(true));
        } catch {
          finish(true);
        }
      };

      let earnedReward = false;
      const subs = [
        entry.ad.addAdEventListener(mod.RewardedAdEventType.LOADED, () => {
          show();
        }),
        entry.ad.addAdEventListener(mod.RewardedAdEventType.EARNED_REWARD, () => {
          earnedReward = true;
        }),
        // Dismissal is the settling event: it fires after EARNED_REWARD on a
        // completed view, and on its own when the player backed out early.
        entry.ad.addAdEventListener(mod.AdEventType.CLOSED, () => {
          finish(earnedReward);
        }),
        entry.ad.addAdEventListener(mod.AdEventType.ERROR, () => finish(true)),
      ];

      // Already warm? Nothing else will fire LOADED, so show it now.
      if (entry.ready) show();
    });
  } catch {
    return true;
  }
}

export const ads = { init, available, prepare, showRewarded };
