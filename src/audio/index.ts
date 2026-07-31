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
// just keep the filenames in `CLIPS` below.

import { Platform } from "react-native";

import { Asset } from "expo-asset";
import type { AudioPlayer } from "expo-audio";

/** Every sound effect in the app. Add new cues here to keep them in one place. */
export type SoundName = "place" | "mark" | "mistake" | "win" | "fail" | "button";

// One row per cue: the clip (a literal `require` so Metro bundles it) and how
// many players it gets. Some cues retrigger faster than the clip's own length —
// drag-painting ✕ marks fires `mark` once per cell, many times a second. A
// single player would just `seekTo(0)` and cut the previous tick off (you'd hear
// one smear, not each cell), so those cues get a small round-robin pool that
// overlaps instead.
const CLIPS: Record<SoundName, { src: number; voices: number }> = {
  place: { src: require("../../assets/audio/place.wav"), voices: 1 },
  mark: { src: require("../../assets/audio/mark.wav"), voices: 8 },
  mistake: { src: require("../../assets/audio/mistake.wav"), voices: 1 },
  win: { src: require("../../assets/audio/win.wav"), voices: 1 },
  fail: { src: require("../../assets/audio/fail.wav"), voices: 1 },
  button: { src: require("../../assets/audio/button.wav"), voices: 2 },
};

const NAMES = Object.keys(CLIPS) as SoundName[];

// expo-audio targets native; on web we no-op (the web build is a smoke-test
// target only, and there are no players to manage). `mod` doubles as the
// enabled flag: null means every call below short-circuits.
const mod: typeof import("expo-audio") | null = (() => {
  if (Platform.OS === "web") return null;
  try {
    // Required lazily so web builds don't pull in the native module.
    return require("expo-audio");
  } catch {
    return null;
  }
})();

// Live state per cue: the downloaded asset (see `preload`), the lazily created
// voices, and the round-robin cursor.
type Cue = { asset: Asset | null; voices: AudioPlayer[]; cursor: number };
const cues: Record<SoundName, Cue> = Object.fromEntries(
  NAMES.map((name): [SoundName, Cue] => [name, { asset: null, voices: [], cursor: 0 }]),
) as Record<SoundName, Cue>;

let muted = false;

// Every failure below is swallowed so audio can never break gameplay — but that
// makes a broken clip and a working-but-silent one look identical, which costs
// far more time than it saves. In dev, say what went wrong; in production, stay
// quiet as before.
function warn(where: string, err: unknown): void {
  if (__DEV__) console.warn(`[audio] ${where}:`, err);
}

/**
 * Set the audio mode, then pull every clip down to a local file before any
 * player is created.
 *
 * The preload is what makes SFX work in **Expo Go** (and any dev client loading
 * from Metro). expo-audio resolves a `require`d clip with `asset.localUri ?? asset.uri`:
 * in a release build the wav is bundled, so `localUri` is a `file://` path and a
 * cue is instant. In Expo Go nothing is bundled — `localUri` is null until the
 * asset is downloaded, so the player is handed the dev server's http URL and has
 * to stream a one-shot cue over the LAN. On Android that load quietly never
 * completes (the dev asset URL carries its extension in a query string), the
 * player stays `isLoaded === false`, and `play()` is a no-op: audible in the APK,
 * silent in Expo Go, with no error anywhere. `downloadAsync()` is a no-op when the
 * asset is already local, so this costs production nothing.
 *
 * Runs at module load, well before the player's first tap. Cues that fire before
 * it resolves still work — they just start on the raw module id and get
 * repointed at the local file here.
 */
async function init(): Promise<void> {
  if (!mod) return;
  try {
    // `playsInSilentMode: true` — a muted game is a support ticket, and we have
    // our own in-app mute (SettingsOverlay) for players who want quiet. On iOS
    // `false` means the hardware ringer switch silences the whole game, which
    // reads as "the sound is broken" rather than as a deliberate choice.
    await mod.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    });
  } catch (e) {
    warn("setAudioModeAsync", e);
  }
  await Promise.all(
    NAMES.map(async (name) => {
      const cue = cues[name];
      try {
        const asset = Asset.fromModule(CLIPS[name].src);
        if (!asset.localUri) await asset.downloadAsync();
        cue.asset = asset;
        for (const voice of cue.voices) {
          voice.replace(asset);
          used.delete(voice); // a replaced source starts at 0 again
        }
      } catch (e) {
        warn(`preload ${name}`, e);
      }
    }),
  );
}

void init();

// Voices that have played at least once, so we know which ones need rewinding.
// We can't ask the player: `currentTime` only refreshes on its status interval
// (500ms by default), so a just-finished one-shot still reports a stale
// position — long enough to matter for cues that retrigger several times a
// second, which is exactly the case that broke.
const used = new WeakSet<AudioPlayer>();

/**
 * Start a voice from the top.
 *
 * A voice that already played is parked at the *end* of its clip, and `play()`
 * there is a no-op — it has to be rewound first, and `seekTo` is async. Firing
 * the seek without awaiting it (so `play()` runs against the end position) is
 * what made pooled cues die on wrap-around: the first N taps each got a fresh
 * voice and worked, then every later one hit a parked voice and went silent for
 * the rest of the session. A voice's first play skips the seek entirely, so the
 * common case stays synchronous and instant.
 */
function fire(p: AudioPlayer, name: SoundName): void {
  if (!used.has(p)) {
    used.add(p);
    p.play();
    return;
  }
  void Promise.resolve(p.seekTo(0))
    .then(() => p.play())
    .catch((e) => warn(`seekTo ${name}`, e));
}

/** Next voice in the cue's pool (round-robin), created on demand. */
function nextVoice(name: SoundName): AudioPlayer | null {
  if (!mod) return null;
  const cue = cues[name];
  const i = cue.cursor % CLIPS[name].voices;
  cue.cursor = i + 1;
  // Prefer the downloaded asset (local file). Falls back to the module id if a
  // cue fires before `init` resolves — `init` repoints it afterwards.
  cue.voices[i] ??= mod.createAudioPlayer(cue.asset ?? CLIPS[name].src);
  return cue.voices[i];
}

export const audio = {
  /** True when SFX can play (native, module loaded). */
  enabled: !!mod,

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
      const p = nextVoice(name);
      if (p) fire(p, name);
    } catch (e) {
      warn(`play ${name}`, e);
    }
  },

  /**
   * Dev-only smoke test: report what the audio layer thinks its state is.
   * Silence has too many possible causes (muted, web, module missing, asset
   * failed to load) and they are indistinguishable from the outside — call this
   * from a debug build to tell them apart. Read-only: it reports the voices that
   * exist rather than creating any, so it can't perturb what it measures.
   */
  diagnose(): Record<string, unknown> {
    const info = {
      platform: Platform.OS,
      moduleLoaded: !!mod,
      muted,
      cues: Object.fromEntries(
        NAMES.map((name) => [
          name,
          {
            voices: cues[name].voices.length,
            // `uri` is the tell: a `file://` path means the clip is local (bundled
            // or downloaded); an `http://…:8081/assets/…` one means it is still
            // being streamed from Metro, which is the Expo Go silence this guards.
            uri: cues[name].asset?.localUri ?? cues[name].asset?.uri ?? null,
            loaded: cues[name].voices.filter((v) => v.isLoaded).length,
          },
        ]),
      ),
    };
    if (__DEV__) console.warn("[audio] diagnose:", JSON.stringify(info, null, 2));
    return info;
  },
};
