#!/usr/bin/env python3
"""Synthesize Plantdoku's placeholder SFX into assets/audio/ (stdlib only).

Six short, soft cues — deliberately gentle to suit a calm garden puzzle. These
are real, audible placeholders so the game ships with sound out of the box;
swap in designed clips later (keep the filenames, see src/audio/index.ts).

    python3 scripts/make_sfx.py
"""
import math
import os
import struct
import wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

def env(i, n, attack=0.01, release=0.5):
    """Attack/decay envelope in [0,1] over n samples (release as a fraction)."""
    t = i / n
    a = min(1.0, t / attack) if attack > 0 else 1.0
    rstart = 1.0 - release
    d = 1.0 if t < rstart else max(0.0, (1.0 - t) / release)
    return a * d

def tone(freq, dur, vol=0.5, attack=0.01, release=0.6, harmonic=0.0):
    n = int(SR * dur)
    out = []
    for i in range(n):
        ph = 2 * math.pi * freq * (i / SR)
        s = math.sin(ph) + harmonic * math.sin(2 * ph)
        out.append(s / (1 + harmonic) * vol * env(i, n, attack, release))
    return out

def seq(notes):
    """Concatenate (freq, dur, vol) notes into one buffer."""
    out = []
    for f, d, v in notes:
        out.extend(tone(f, d, v, attack=0.008, release=0.7, harmonic=0.25))
    return out

def mix_to(buf, length):
    if len(buf) < length:
        buf = buf + [0.0] * (length - len(buf))
    return buf

def save(name, samples):
    path = os.path.join(OUT, name + ".wav")
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, int(s * 32767))))
            for s in samples
        )
        w.writeframes(frames)
    print(f"  {name}.wav  {len(samples)/SR*1000:.0f}ms")

def main():
    os.makedirs(OUT, exist_ok=True)
    print("Synthesizing SFX ->", os.path.normpath(OUT))

    # place: a soft woody "pock" — mid note with a quick decay.
    save("place", tone(523.25, 0.16, vol=0.55, attack=0.004, release=0.85, harmonic=0.3))
    # mark: a light tick for laying an X.
    save("mark", tone(1320.0, 0.05, vol=0.32, attack=0.002, release=0.9))
    # mistake: a soft low double-thud (no harshness).
    save("mistake", seq([(196.0, 0.09, 0.5), (155.56, 0.13, 0.5)]))
    # win: gentle ascending arpeggio C-E-G-C.
    save("win", seq([(523.25, 0.12, 0.5), (659.25, 0.12, 0.5),
                     (783.99, 0.12, 0.5), (1046.5, 0.30, 0.55)]))
    # fail: a slow descending sigh.
    save("fail", seq([(440.0, 0.16, 0.5), (349.23, 0.16, 0.5), (261.63, 0.34, 0.5)]))
    # button: a quiet UI click.
    save("button", tone(880.0, 0.04, vol=0.28, attack=0.002, release=0.9))

if __name__ == "__main__":
    main()
