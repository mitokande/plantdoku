#!/usr/bin/env python3
"""Render the game's SFX set from raw source clips.

This is the audio counterpart to `scripts/prep_sprites.py`: raw source files
live in `art/sfx/` (masters, not bundled) and this script normalises them into
the six clips the app ships in `assets/audio/`.

Why a pipeline instead of just dropping files in: a set of library clips sourced
from different packs arrives at wildly different loudness, length and DC offset,
and mismatched levels are most of what makes an SFX set feel amateur. Every cue
here is trimmed, level-matched to a *per-cue* RMS target (see LEVELS — `mark`
fires eight times a second while dragging and must sit far below `place`),
peak-limited, de-clicked with short fades and written as mono 44.1kHz 16-bit
WAV.

A cue may also LAYER several sources. `place` is the game's signature sound and
is built as two: a dark low thud (the plant pressing into soil) with a quiet
leaf rustle a few milliseconds behind it. No single library clip is a plant
being planted; the layer is what makes it read as one.

Sources are CC0 (Kenney) — see `art/sfx/CREDITS.md`.

Usage:
    pip install soundfile numpy      # dev-only deps, not part of the app
    python3 scripts/prep_sfx.py                  # render assets/audio/*.wav
    python3 scripts/prep_sfx.py --out /tmp/try   # render somewhere else
    python3 scripts/prep_sfx.py --check          # audit the shipped set
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - dev tooling
    sys.exit("prep_sfx.py needs `soundfile`:  pip install soundfile numpy")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "sfx"
OUT = ROOT / "assets" / "audio"

SR = 44100
PEAK_CEILING_DB = -1.0  # headroom so mixing several cues can't clip the master
FADE_IN_MS = 2.0
FADE_OUT_MS = 12.0
TRIM_DB = -55.0  # silence floor, relative to the clip's own peak


@dataclass
class Layer:
    """One source clip inside a cue.

    `pitch` is a tape-style speed change: <1 plays the clip slower, so it drops
    in pitch and lengthens. It is the main knob for warming a bright library
    clip into something cozy — most impact recordings are pitched for drama and
    sit too high for a quiet puzzle game.

    `start_ms` drops the head of the source, measured on the *trimmed* clip and
    before any pitch change. It is how a cue uses part of a musical phrase — the
    jingle sources are 2-6 note figures and the useful cue is often the tail, so
    this is the counterpart to `max_ms` at the other end. Aim a few ms early of
    the note you want so its attack transient survives the cut; the fade-in
    handles the click either way.
    """

    src: str
    gain_db: float = 0.0
    delay_ms: float = 0.0
    pitch: float = 1.0
    start_ms: float = 0.0


@dataclass
class Recipe:
    layers: list[Layer]
    rms_db: float  # target loudness — the knob that ranks cues against each other
    max_ms: float | None = None  # hard cap; trailing tail is faded out
    fade_out_ms: float = FADE_OUT_MS
    notes: str = field(default="")


# Per-cue loudness targets. These are the mix, and the ordering matters more
# than the absolute numbers: `mark` and `button` are incidental and sit ~8dB
# under `place`, which is the cue the player is actually rewarded by; `win` is
# the loudest thing in the game.
LEVELS = {
    "place": -17.0,
    # -26 here was inaudible in play. A cue this short and soft needs to sit
    # much closer to `place` than the raw number suggests — quiet *and* brief
    # reads as nothing at all.
    "mark": -21.0,
    "mistake": -17.0,
    "win": -15.0,
    "fail": -17.0,
    "button": -27.0,
}

RECIPES: dict[str, Recipe] = {
    # Soil thud + a leaf rustle trailing it — see the layering note above. Both
    # layers are the *longer* member of their family: the Kenney grass footsteps
    # are one-shot crunches and most carry only ~70ms above -40dB, which is not
    # enough rustle to hear under the thud — grass_001 has nearly twice that,
    # and soft_001 is 183ms of low body against soft_000's 118ms. Check "usable
    # ms", not file length, when swapping either: these sources pad a long
    # near-silent tail, so file length says almost nothing.
    #
    # `gain_db` here is NOT comparable to the other layers' — tune it by the
    # balance it produces, not by the number. Summed low (<300Hz) against high
    # (>1.5kHz) energy, this cue wants to land around +7dB, i.e. clearly
    # soil-forward with the leaves as texture on top. grass_001 is a good deal
    # hotter than the grass_003 it replaced, so it needs -12dB to sit where
    # that one sat at -5dB; left at -5 the balance goes to +0.8dB and the cue
    # turns into a gravel crunch with a thump attached.
    "place": Recipe(
        layers=[
            Layer("impact-sounds/impactSoft_medium_001.ogg"),
            Layer("impact-sounds/footstep_grass_001.ogg", gain_db=-12.0, delay_ms=12.0),
        ],
        rms_db=LEVELS["place"],
        max_ms=380,
        notes="soil thud + leaf rustle",
    ),
    # Fires once per cell while drag-painting, so it has to survive being heard
    # eight times a second: soft and rounded, no hard transient. Pitched down to
    # warm it — the source is a bright UI drop, and the "settle" quality only
    # appears once it is slowed.
    "mark": Recipe(
        layers=[Layer("interface-sounds/drop_003.ogg", pitch=0.85)],
        rms_db=LEVELS["mark"],
        max_ms=110,
        fade_out_ms=16.0,
        notes="soft settle",
    ),
    # Dull, weighted, no buzzer — the red ✕ on screen already says "wrong". But
    # "dull" has a floor: the previous source (impactWood_light_002) rolled off
    # at 553Hz with nothing above 600Hz at all, which is not restraint, it is a
    # bump heard through a wall. A plank keeps the same dry wooden gesture and
    # carries mid presence out to ~1.2kHz, so the cue has articulation without
    # ever becoming a buzzer. It is also all body where the old one was all
    # transient: the knock peak-limited 3.9dB *under* its own RMS target, while
    # this lands on target exactly, so it now sits where LEVELS says it should.
    "mistake": Recipe(
        layers=[Layer("impact-sounds/impactPlank_medium_001.ogg")],
        rms_db=LEVELS["mistake"],
        max_ms=300,
        notes="dry plank knock",
    ),
    # Pizzicato phrase that climbs D-F#-F#-G and lands. Kenney's pack is a
    # matrix — the same 17 melodies played by 5 instruments — so a cue is chosen
    # twice: the phrase, then the instrument. The phrase matters most, and the
    # earlier pair (STEEL02/01) picked the two worst: plain six-note scale runs,
    # straight up and straight back down, which is the generic level-up /
    # game-over gesture rather than a melody. Plucked strings are also a better
    # fit for this game than the steel drum was — small and wooden, not tropical.
    "win": Recipe(
        layers=[Layer("music-jingles/jingles_PIZZI10.ogg")],
        rms_db=LEVELS["win"],
        max_ms=1600,
        fade_out_ms=90.0,
        notes="pizzicato, rises and lands",
    ),
    # The mirror phrase on the same instrument, minus its leading G: PIZZI11 is
    # G-F#-D-D and the cue starts at the second note, so it falls F#-D-D. Notes
    # in these jingles land every ~116ms and 122ms is the second onset; the 118
    # here is deliberately a few ms early so that note's attack survives the cut.
    # Dropping the G is what keeps the loss from answering the win at equal
    # weight — it descends to the same D, but shorter and with less ceremony,
    # which suits a board the player is one tap from retrying. Keep the two
    # mirrored (win climbs to G, fail falls to D) if either is ever re-picked.
    "fail": Recipe(
        layers=[Layer("music-jingles/jingles_PIZZI11.ogg", start_ms=118.0)],
        rms_db=LEVELS["fail"],
        max_ms=1400,
        fade_out_ms=90.0,
        notes="pizzicato, falling F#-D-D",
    ),
    # Barely there. A UI tap should be felt, not listened to — but there is a
    # lower bound on "brief" as well as on "quiet", and the previous source
    # (click_003) sat under it: 10ms after trimming, of which the 8ms fade-out
    # ate most, which the ear takes as a pop or a glitch rather than as a sound
    # someone chose. This one is ~56ms — still far too short to listen *to*, but
    # long enough to have a body. Same lesson as `mark` above, from the other
    # direction: that cue was too quiet to register, this one was too short.
    "button": Recipe(
        layers=[Layer("ui-audio/click2.ogg")],
        rms_db=LEVELS["button"],
        max_ms=80,
        fade_out_ms=10.0,
        notes="soft click",
    ),
}


def load(path: Path) -> np.ndarray:
    """Decode to mono float32 at SR."""
    x, sr = sf.read(str(path), always_2d=True, dtype="float64")
    x = x.mean(axis=1)
    if sr != SR:
        # Linear resample. These are short, broadband one-shots well under
        # Nyquist; a polyphase filter would not be audible here.
        n = int(round(len(x) * SR / sr))
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    return x.astype(np.float64)


def trim(x: np.ndarray) -> np.ndarray:
    """Drop leading/trailing near-silence (library clips pad both ends)."""
    peak = np.abs(x).max()
    if peak <= 0:
        return x
    idx = np.flatnonzero(np.abs(x) > peak * 10 ** (TRIM_DB / 20))
    return x[idx[0] : idx[-1] + 1] if idx.size else x


def envelope(x: np.ndarray, fade_out_ms: float) -> np.ndarray:
    """Short fades at both ends so a cut waveform can't click on retrigger."""
    n_in = min(int(SR * FADE_IN_MS / 1000), len(x) // 2)
    n_out = min(int(SR * fade_out_ms / 1000), len(x) // 2)
    y = x.copy()
    if n_in:
        y[:n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        y[-n_out:] *= np.linspace(1, 0, n_out)
    return y


def render(recipe: Recipe) -> np.ndarray:
    parts = []
    for layer in recipe.layers:
        src = RAW / layer.src
        if not src.exists():
            raise SystemExit(f"missing source: {src.relative_to(ROOT)}")
        y = trim(load(src))
        if layer.start_ms:
            y = y[int(SR * layer.start_ms / 1000) :]
        if layer.pitch != 1.0:
            n = int(round(len(y) / layer.pitch))
            y = np.interp(np.linspace(0, len(y) - 1, n), np.arange(len(y)), y)
        y = y * 10 ** (layer.gain_db / 20)
        pad = int(SR * layer.delay_ms / 1000)
        parts.append(np.concatenate([np.zeros(pad), y]) if pad else y)

    n = max(len(p) for p in parts)
    mix = np.zeros(n)
    for p in parts:
        mix[: len(p)] += p

    mix = trim(mix)
    if recipe.max_ms:
        mix = mix[: int(SR * recipe.max_ms / 1000)]
    mix = envelope(mix, recipe.fade_out_ms)

    # Level-match on RMS (what loudness reads as), then pull back only if that
    # pushed the peak past the ceiling — so the cue-to-cue balance in LEVELS
    # survives clips with very different crest factors.
    rms = float(np.sqrt((mix**2).mean()))
    if rms > 0:
        mix *= 10 ** (recipe.rms_db / 20) / rms
    peak = float(np.abs(mix).max())
    ceiling = 10 ** (PEAK_CEILING_DB / 20)
    if peak > ceiling:
        mix *= ceiling / peak
    return mix


def write(path: Path, x: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.clip(x, -1.0, 1.0), SR, subtype="PCM_16")


def check(out: Path) -> int:
    """Audit the shipped set: present, mono/44.1k, sane length and level."""
    problems = []
    for name in RECIPES:
        p = out / f"{name}.wav"
        if not p.exists():
            problems.append(f"{name}.wav: missing")
            continue
        info = sf.info(str(p))
        x, _ = sf.read(str(p), always_2d=True, dtype="float64")
        mono = x.mean(axis=1)
        rms_db = 20 * np.log10(max(float(np.sqrt((mono**2).mean())), 1e-9))
        peak_db = 20 * np.log10(max(float(np.abs(mono).max()), 1e-9))
        dur = info.frames / info.samplerate
        flags = []
        if info.samplerate != SR:
            flags.append(f"samplerate {info.samplerate}")
        if info.channels != 1:
            flags.append(f"{info.channels} channels")
        if peak_db > PEAK_CEILING_DB + 0.2:
            flags.append(f"peak {peak_db:.1f}dB over ceiling")
        # A very peaky clip (a sharp wood knock, say) can hit the peak ceiling
        # before it reaches its RMS target — the limiter set the level, not the
        # target, and there is no headroom left to give it. That is expected, so
        # only flag an RMS *shortfall* when the clip is not already ceilinged.
        ceilinged = peak_db >= PEAK_CEILING_DB - 0.2
        if rms_db > LEVELS[name] + 1.5 or (rms_db < LEVELS[name] - 1.5 and not ceilinged):
            flags.append(f"rms {rms_db:.1f}dB != target {LEVELS[name]:.1f}dB")
        elif rms_db < LEVELS[name] - 1.5:
            status_note = f"(peak-limited, {LEVELS[name] - rms_db:.1f}dB under target)"
            print(f"{name:8} {dur:5.3f}s  peak {peak_db:6.1f}  rms {rms_db:6.1f}  ok {status_note}")
            continue
        if dur > 2.0:
            flags.append(f"{dur:.2f}s too long")
        status = "FAIL " + ", ".join(flags) if flags else "ok"
        print(f"{name:8} {dur:5.3f}s  peak {peak_db:6.1f}  rms {rms_db:6.1f}  {status}")
        if flags:
            problems.append(f"{name}.wav: {', '.join(flags)}")
    if problems:
        print(f"\n{len(problems)} problem(s)")
        return 1
    print("\nall clips ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT, help="output directory")
    ap.add_argument("--check", action="store_true", help="audit instead of render")
    args = ap.parse_args()

    if args.check:
        return check(args.out)

    for name, recipe in RECIPES.items():
        mix = render(recipe)
        path = args.out / f"{name}.wav"
        write(path, mix)
        print(f"{name:8} {len(mix)/SR:5.3f}s  {path.stat().st_size/1024:5.1f}KB  {recipe.notes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
