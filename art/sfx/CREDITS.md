# SFX sources

Raw source clips for the game's sound effects. These are the **masters** — they
are not bundled into the app. `scripts/prep_sfx.py` renders them into the six
clips the app ships in `assets/audio/`.

## Licence

Every file here is by **Kenney** (<https://kenney.nl>) and released under
**CC0 1.0 Universal** (public domain dedication):
<https://creativecommons.org/publicdomain/zero/1.0/>

No attribution is required and no rights are reserved, so these can ship in a
commercial release without restriction. Crediting Kenney is a courtesy worth
doing anyway.

## Packs

| Directory          | Pack                                              |
| ------------------ | ------------------------------------------------- |
| `impact-sounds/`   | <https://kenney.nl/assets/impact-sounds>           |
| `interface-sounds/`| <https://kenney.nl/assets/interface-sounds>        |
| `rpg-audio/`       | <https://kenney.nl/assets/rpg-audio>               |
| `music-jingles/`   | <https://kenney.nl/assets/music-jingles>           |
| `ui-audio/`        | <https://kenney.nl/assets/ui-audio>                |

Only the clips actually referenced by `RECIPES` (plus a few auditioned
alternates) were kept — the full packs are several hundred clips each and are
free to re-download if another cue is ever needed.

## Picking a source

Don't pick by filename. These packs are numbered variants of one recording
session, so `impactWood_light_000` through `_004` are near-identical and the
useful differences are measurable ones. The three that decide whether a cue
works:

- **Usable length**, not file length — the span above −40dBFS. These sources pad
  a long near-silent tail, so a 670ms grass footstep can carry only 74ms of
  actual sound. This is the number to compare.
- **Spectral rolloff** — where the energy stops. Under ~600Hz a cue reads as
  muffled no matter how loud it is; that is what retired the old `mistake`.
- **Crest factor** — peak over RMS. A very peaky clip is all transient, will
  hit the −1dBFS ceiling before reaching its RMS target, and lands quieter than
  `LEVELS` asked for.

Scanning a whole pack on those three takes a few lines of `soundfile` + `numpy`
and beats auditioning by ear from the top of an alphabetical list.

## Reading the jingle filenames

`music-jingles` is a **matrix**, which is not obvious from a partial checkout:
the same 17 melodies (`00`–`16`) are each played by 5 instrument families
(`PIZZI` pizzicato · `STEEL` steel drum · `SAX` · `NES` 8-bit · `HIT`
orchestral hits). So `jingles_PIZZI10` and `jingles_SAX10` are one tune on two
instruments, and `jingles_PIZZI10` / `jingles_PIZZI11` are a rising figure and
its falling answer — which is why the shipped `win`/`fail` pair is 10 and 11
(`fail` starts at 11's second note; see the recipe's `start_ms`).

To audition alternatives, re-download the pack (86 clips, ~1.2MB) and compare
within a melody index before switching family.
