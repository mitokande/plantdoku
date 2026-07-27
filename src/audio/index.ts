// Sound-effects wrapper. The rest of the app calls `audio.play("place")` against
// this typed facade rather than touching expo-audio directly, so there is one
// place to manage the clip taxonomy, lazy player creation, and the mute toggle.
//
// NOTE: this module imports expo-audio (RN-only). Keep it out of `src/game/*` so
// the headless Node tests stay framework-free (same rule as `src/analytics`).
//
// Behaviour mirrors the haptics pattern in GameScreen: native-only, every call
// is a safe no-op on web / before init / when muted, and failures are swallowed
// so audio can never break gameplay. SFX clips live in `assets/audio/*.wav` and
// are rendered from the CC0 masters in `art/sfx/` by `scripts/prep_sfx.py`
// (`npm run sfx`) — re-cut or re-source a cue by editing that script's RECIPES,
// just keep the filenames in `SOURCES` below.

import { Platform } from "react-native";

import { Asset } from "expo-asset";
import type { AudioPlayer } from "expo-audio";

/** Every sound effect in the app. Add new cues here to keep them in one place. */
export type SoundName = "place" | "mark" | "mistake" | "win" | "fail" | "button";

// Static requires so Metro bundles the assets (the `require`s must be literal).
const SOURCES: Record<SoundName, number> = {
  place: require("../../assets/audio/place.wav"),
  mark: require("../../assets/audio/mark.wav"),
  mistake: require("../../assets/audio/mistake.wav"),
  win: require("../../assets/audio/win.wav"),
  fail: require("../../assets/audio/fail.wav"),
  button: require("../../assets/audio/button.wav"),
};

// expo-audio targets native; on web we no-op (the web build is a smoke-test
// target only, and there are no players to manage).
const enabled = Platform.OS !== "web";

let mod: typeof import("expo-audio") | null = null;
if (enabled) {
  // Loaded lazily so web builds don't pull in the native module.
  try {
    mod = require("expo-audio");
  } catch {
    mod = null;
  }
}

// Some cues retrigger faster than the clip's own length — drag-painting ✕ marks
// fires `mark` once per cell, many times a second. A single player would just
// `seekTo(0)` and cut the previous tick off (you'd hear one smear, not each
// cell), so those cues get a small round-robin pool of players that overlap.
const VOICES: Record<SoundName, number> = {
  place: 1,
  mark: 8,
  mistake: 1,
  win: 1,
  fail: 1,
  button: 2,
};

// One pool of players per clip, each voice created lazily on first use (cheap to
// keep resident — the clips are tiny). `seekTo(0)` before `play()` lets a single
// voice retrigger; the pool lets consecutive plays overlap.
const pools = new Map<SoundName, AudioPlayer[]>();
const cursors = new Map<SoundName, number>();
let muted = false;
let configured = false;

// Downloaded assets, keyed by cue — see `preload` for why this matters.
const assets = new Map<SoundName, Asset>();

// Every failure below is swallowed so audio can never break gameplay — but that
// makes a broken clip and a working-but-silent one look identical, which costs
// far more time than it saves. In dev, say what went wrong; in production, stay
// quiet as before.
function warn(where: string, err: unknown): void {
  if (__DEV__) console.warn(`[audio] ${where}:`, err);
}

function configure(): void {
  if (!mod || configured) return;
  configured = true;
  try {
    // `playsInSilentMode: true` — a muted game is a support ticket, and we have
    // our own in-app mute (SettingsOverlay) for players who want quiet. On iOS
    // `false` means the hardware ringer switch silences the whole game, which
    // reads as "the sound is broken" rather than as a deliberate choice.
    void mod
      .setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "mixWithOthers",
      })
      .catch((e) => warn("setAudioModeAsync", e));
  } catch (e) {
    warn("configure", e);
  }
}

/**
 * Pull every clip down to a local file before any player is created.
 *
 * This is what makes SFX work in **Expo Go** (and any dev client loading from
 * Metro). expo-audio resolves a `require`d clip with `asset.localUri ?? asset.uri`:
 * in a release build the wav is bundled, so `localUri` is a `file://` path and a
 * cue is instant. In Expo Go nothing is bundled — `localUri` is null until the
 * asset is downloaded, so the player is handed the dev server's http URL and has
 * to stream a one-shot cue over the LAN. On Android that load quietly never
 * completes (the dev asset URL carries its extension in a query string), the
 * player stays `isLoaded === false`, and `play()` is a no-op: audible in the APK,
 * silent in Expo Go, with no error anywhere. `downloadAsync()` is a no-op when the
 * asset is already local, so this costs production nothing.
 */
async function preload(): Promise<void> {
  if (!mod) return;
  await Promise.all(
    (Object.keys(SOURCES) as SoundName[]).map(async (name) => {
      try {
        const asset = Asset.fromModule(SOURCES[name]);
        if (!asset.localUri) await asset.downloadAsync();
        assets.set(name, asset);
        // A cue that fired during the download already has a player pointed at
        // the remote URL; move it onto the local file.
        for (const p of pools.get(name) ?? []) p.replace(asset);
      } catch (e) {
        warn(`preload ${name}`, e);
      }
    }),
  );
}

// Kick the download off at module load so the clips are local well before the
// player's first tap. Players created before it finishes still work — they just
// fall back to the raw module id (the old behaviour).
if (enabled) void preload();

// Next voice in the clip's pool (round-robin), created on demand.
function nextVoice(name: SoundName): AudioPlayer | null {
  if (!mod) return null;
  let pool = pools.get(name);
  if (!pool) {
    pool = [];
    pools.set(name, pool);
  }
  const i = (cursors.get(name) ?? 0) % VOICES[name];
  cursors.set(name, i + 1);
  let p = pool[i];
  if (!p) {
    // Prefer the downloaded asset (local file). Falls back to the module id if a
    // cue fires before `preload` resolves — `preload` repoints it afterwards.
    p = mod.createAudioPlayer(assets.get(name) ?? SOURCES[name]);
    pool[i] = p;
  }
  return p;
}

export const audio = {
  /** True when SFX can play (native, module loaded). */
  enabled: enabled && !!mod,

  /** Mute/unmute all SFX. Persisted by the caller (see useGame). */
  setMuted(value: boolean): void {
    muted = value;
  },

  get muted(): boolean {
    return muted;
  },

  /** Play a one-shot sound effect. Safe to call in any state. */
  play(name: SoundName): void {
    if (!mod || muted) return;
    try {
      configure();
      const p = nextVoice(name);
      if (!p) return;
      // Restart this voice from the top so the cue fires even mid-playback.
      // Only once it is loaded, though: seeking an unprepared player rejects on
      // Android, and there is nothing to rewind on a voice's first play anyway.
      if (p.isLoaded) {
        void Promise.resolve(p.seekTo(0)).catch((e) => warn(`seekTo ${name}`, e));
      }
      p.play();
    } catch (e) {
      warn(`play ${name}`, e);
    }
  },

  /**
   * Dev-only smoke test: report what the audio layer thinks its state is.
   * Silence has too many possible causes (muted, web, module missing, asset
   * failed to load) and they are indistinguishable from the outside — call this
   * from a debug build to tell them apart.
   */
  diagnose(): Record<string, unknown> {
    const loaded: Record<string, unknown> = {};
    for (const name of Object.keys(SOURCES) as SoundName[]) {
      try {
        const p = nextVoice(name);
        // `uri` is the tell: a `file://` path means the clip is local (bundled or
        // downloaded); an `http://…:8081/assets/…` one means it is still being
        // streamed from Metro, which is the Expo Go silence this all guards.
        loaded[name] = {
          player: !!p,
          isLoaded: p?.isLoaded ?? false,
          uri: assets.get(name)?.localUri ?? assets.get(name)?.uri ?? null,
        };
      } catch (e) {
        loaded[name] = false;
        warn(`load ${name}`, e);
      }
    }
    const info = {
      platform: Platform.OS,
      enabled,
      moduleLoaded: !!mod,
      muted,
      configured,
      loaded,
    };
    if (__DEV__) console.warn("[audio] diagnose:", JSON.stringify(info, null, 2));
    return info;
  },
};
