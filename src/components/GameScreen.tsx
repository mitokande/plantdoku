import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { analytics } from "../analytics";
import { audio } from "../audio";
import type { Game } from "../state/useGame";
import { parSeconds } from "../game/stars";
import type { Coord } from "../game/types";
import { formatDateKey, formatTime } from "../format";
import { useBackHandler } from "../hooks/useBackHandler";
import { radius, shadow, space, theme, typography } from "../theme";
import { Board, BOARD_FRAME, boardMetrics } from "./Board";
import { Button } from "./Button";
import { FailOverlay } from "./FailOverlay";
import { Hearts } from "./Hearts";
import { HelpOverlay } from "./HelpOverlay";
import { Tappable } from "./Tappable";
import { TutorialOverlay, type Hole } from "./TutorialOverlay";
import { FLOURISH_MS, WinFlourish } from "./WinFlourish";
import { WinOverlay } from "./WinOverlay";

let Haptics: typeof import("expo-haptics") | null = null;
if (Platform.OS !== "web") {
  // Loaded lazily so web builds don't pull in the native module.
  Haptics = require("expo-haptics");
}

interface Props {
  game: Game;
  onMenu: () => void;
  /**
   * Where the win card's single "Continue" goes: back to the Home tab, whatever
   * tab the board was started from. Defaults to `onMenu`.
   */
  onHome?: () => void;
}

// First-play tutorial: stages 0..5 run on the real Level 1 board; TUT_DONE =
// off. Every stage asks for one simple player action — no read-only "Next"
// screens: plant the forced cell, then ✕ each rule's cells yourself
// (neighbours → row → column), then the colour-rule payoff — those marks
// have left one cluster with a single open cell, so the player DEDUCES a
// second plant (stage 4 self-skips if the board doesn't offer that setup).
// Each stage advances itself the moment its action is done; stage 5 hands
// off to real solving. The TutorialOverlay blacks out everything except the spotlit
// target, and the input handlers lock the board to exactly the prompted
// action.
const TUT_DONE = 6;
// `name` is the analytics label for the stage — each one fires a
// `tutorial_step` event when reached, so the funnel shows exactly which
// instruction players quit on (the tutorial is forced, so a drop here is a
// lost install). Keep the names stable; renaming one breaks the funnel.
const TUTORIAL_STEPS: { name: string; text: string; button?: string }[] = [
  { name: "plant", text: "Double-tap to plant 🌱" },
  { name: "no_touch", text: "Plants can't touch ✋\n✕ the cells around it." },
  { name: "row", text: "One plant per row.\n✕ the rest of this row." },
  { name: "column", text: "One plant per column.\n✕ this column too." },
  {
    name: "colour",
    text: "One plant per color 🎨\nOnly one spot left — plant it!",
  },
  { name: "free_play", text: "Your turn! 🌿\nSolve the rest.", button: "Let's go!" },
];

/** Bounding box of a cell list — used to spotlight a (possibly irregular)
 * cluster with the tutorial's one rectangular hole. */
function bbox(cells: Coord[]) {
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (const [r, c] of cells) {
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if (c < c0) c0 = c;
    if (c > c1) c1 = c;
  }
  return { r0, r1, c0, c1 };
}

const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

// --- Rule-chip metrics ------------------------------------------------------
// The three chips are equal thirds of one row (see `ruleChip`), so how much
// label fits is pure arithmetic rather than something to eyeball: measure the
// third, subtract the icon and the padding, and size the type to what's left.
// This is what stops the row from overflowing the screen on a narrow phone —
// the chips can't grow past their third, so the *label* has to give.
const CHIP_GAP = space(2);
const CHIP_PAD = 5; // horizontal padding inside a chip
const CHIP_ICON = 15;
const CHIP_ICON_GAP = 4;
const CHIP_MAX_W = 440; // the rules row's own max width
/** Longest label ("One per color") at 12.5pt/700, measured off a screenshot. */
const CHIP_LABEL_PT = 78;
const CHIP_FONT_MAX = 12.5;
const CHIP_FONT_MIN = 10;
/** Screen padding either side of the row (`wrap`'s paddingHorizontal). */
const SCREEN_PAD = 12;

function chipFontSize(winW: number) {
  const rowW = Math.min(winW - SCREEN_PAD * 2, CHIP_MAX_W);
  const chipW = (rowW - CHIP_GAP * 2) / 3;
  const labelRoom = chipW - CHIP_PAD * 2 - CHIP_ICON - CHIP_ICON_GAP;
  const fitted = (labelRoom / CHIP_LABEL_PT) * CHIP_FONT_MAX;
  return Math.max(CHIP_FONT_MIN, Math.min(CHIP_FONT_MAX, fitted));
}

// A warm ivory canvas with the faintest lift behind the board. This screen
// deliberately drops the tabs' green tint: the region pastels are a narrow
// band of light hues, and a neutral-warm page is what stops the canvas itself
// from reading as one more cluster colour.
const BG_GRADIENT = ["#FFFCF6", theme.bgWarm, "#FBF1E1"] as const;

// The three core rules. During the tutorial these get the full card (that's
// when the player is actually reading); afterwards they collapse to a row of
// three chips — `label` alone — that expand to `detail` on tap, because a
// solver doesn't need to re-read the rules every level.
const RULES = [
  {
    icon: "leaf",
    label: "One per line",
    detail: "Exactly one plant in every row and every column.",
  },
  {
    icon: "color-palette",
    label: "One per color",
    detail: "Exactly one plant in each coloured patch.",
  },
  {
    icon: "close-circle",
    label: "No touching",
    detail: "No two plants may touch — not even diagonally.",
  },
] as const satisfies {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  detail: string;
}[];

export function GameScreen({ game, onMenu, onHome }: Props) {
  const { size } = game.puzzle;
  const [showHelp, setShowHelp] = useState(false);
  // Which collapsed rule chip is showing its explanation (null = none).
  const [openRule, setOpenRule] = useState<number | null>(null);
  // Reset throws away real work, so it asks once when there is any to throw
  // away. The armed state falls back to idle after a few seconds.
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );
  const armReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResetArmed(true);
    resetTimer.current = setTimeout(() => setResetArmed(false), 3500);
  };
  const resetNow = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResetArmed(false);
    game.reset();
  };
  // A blank board has nothing to confirm; otherwise the first press only arms.
  const onReset = () => {
    if (resetArmed || game.placedCount === 0) resetNow();
    else armReset();
  };

  // Every way out of the board goes through here: an unfinished board is
  // saved to the resume slot (so Home can offer Continue) and reported as
  // abandoned. Both no-op on a board that was won or lost.
  const leave = () => {
    game.abandonBoard();
    onMenu();
  };

  // The win card's one action. `abandonBoard` no-ops on a solved board, so this
  // only differs from `leave` in where it lands: always the Home tab.
  const goHome = () => {
    game.abandonBoard();
    (onHome ?? onMenu)();
  };

  // Android back returns to the menu (an open overlay registers later and
  // consumes the press first).
  useBackHandler(() => {
    leave();
    return true;
  });

  // --- First-play tutorial -------------------------------------------------
  // The forced first move: Level 1 (easy) always has a singleton cluster, and
  // a one-cell cluster's cell is necessarily its solution cell.
  const tutTarget = useMemo<[number, number] | null>(() => {
    if (game.onboarded || game.level !== 1) return null;
    const { regions } = game.puzzle;
    const counts = new Array(size).fill(0);
    for (const row of regions) for (const id of row) counts[id]++;
    const rid = counts.indexOf(1);
    if (rid < 0) return null;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (regions[r][c] === rid) return [r, c];
    return null;
  }, [game.onboarded, game.level, game.puzzle, size]);

  const [tutStep, setTutStep] = useState(() => (tutTarget ? 0 : TUT_DONE));
  const tutorial = tutStep < TUT_DONE && tutTarget != null;

  // The mark-stage target sets after the forced placement: the cells touching
  // it, the rest of its row, the rest of its column (the player ✕'s all
  // three), then — since the placement itself is always a singleton
  // cluster and so has no same-colour neighbours to mark — the rest of a
  // *different*, larger cluster for the colour rule (its true solution cell
  // is left out of the target set, so nothing here spoils it).
  const tutNeighbors = useMemo<Coord[]>(() => {
    if (!tutTarget) return [];
    const out: Coord[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = tutTarget[0] + dr;
        const c = tutTarget[1] + dc;
        if (r >= 0 && c >= 0 && r < size && c < size) out.push([r, c]);
      }
    return out;
  }, [tutTarget, size]);
  const tutRowCells = useMemo<Coord[]>(() => {
    if (!tutTarget) return [];
    const out: Coord[] = [];
    for (let c = 0; c < size; c++) if (c !== tutTarget[1]) out.push([tutTarget[0], c]);
    return out;
  }, [tutTarget, size]);
  const tutColCells = useMemo<Coord[]>(() => {
    if (!tutTarget) return [];
    const out: Coord[] = [];
    for (let r = 0; r < size; r++) if (r !== tutTarget[0]) out.push([r, tutTarget[1]]);
    return out;
  }, [tutTarget, size]);
  // Stage 4's colour-rule payoff: the marks the player just made (the forced
  // plant's row, column and neighbours) can leave a cluster with exactly ONE
  // open cell — the colour rule then forces a plant there, a deduction the
  // player can see for themselves (every other cell of that colour is
  // visibly ✕'d). Prefer the biggest such cluster so the elimination is
  // worth showing; singletons teach nothing new. The open cell must be a
  // sound deduction's answer — the true solution cell — and is verified
  // against it, so a logic slip here can only skip the stage (null), never
  // teach a lie. The current L1 seed does offer one (a 4-cell cluster
  // narrowed to one spot); re-check if L1's seed or the generator changes.
  const tutColor = useMemo<{ cell: Coord; cells: Coord[] } | null>(() => {
    if (!tutTarget) return null;
    const { regions, solution } = game.puzzle;
    const [tr, tc] = tutTarget;
    const eliminated = (r: number, c: number) =>
      r === tr || c === tc || (Math.abs(r - tr) <= 1 && Math.abs(c - tc) <= 1);
    let best: { cell: Coord; cells: Coord[] } | null = null;
    for (let id = 0; id < size; id++) {
      if (id === regions[tr][tc]) continue;
      const cells: Coord[] = [];
      const open: Coord[] = [];
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (regions[r][c] === id) {
            cells.push([r, c]);
            if (!eliminated(r, c)) open.push([r, c]);
          }
      if (
        cells.length > 1 &&
        open.length === 1 &&
        solution[open[0][0]] === open[0][1] &&
        (!best || cells.length > best.cells.length)
      )
        best = { cell: open[0], cells };
    }
    return best;
  }, [tutTarget, game.puzzle, size]);

  const tutMarkStages = useMemo<Coord[][]>(
    () => [tutNeighbors, tutRowCells, tutColCells],
    [tutNeighbors, tutRowCells, tutColCells],
  );
  const tutMarkTargets =
    tutorial && tutStep >= 1 && tutStep <= 3 ? tutMarkStages[tutStep - 1] : [];

  // Every stage advances off the player's own action: the forced placement
  // (stage 0), each mark stage once its whole target set is ✕'d, and the
  // colour deduction once its cell is planted — with a success haptic as the
  // "step done" reward beat (the checklist chip ticking + the next card
  // springing in carry the visual half). Stage 4 is skipped outright when
  // the board offers no one-cell-left cluster.
  useEffect(() => {
    if (!tutorial || !tutTarget) return;
    const done = () =>
      Haptics?.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    if (tutStep === 0 && game.states[tutTarget[0]][tutTarget[1]] === "placed") {
      setTutStep(1);
    } else if (
      tutStep >= 1 &&
      tutStep <= 3 &&
      tutMarkTargets.length > 0 &&
      tutMarkTargets.every(([r, c]) => game.states[r][c] === "marked")
    ) {
      done();
      setTutStep(tutStep === 3 && !tutColor ? 5 : tutStep + 1);
    } else if (
      tutStep === 4 &&
      tutColor &&
      game.states[tutColor.cell[0]][tutColor.cell[1]] === "placed"
    ) {
      done();
      setTutStep(5);
    }
  }, [tutorial, tutStep, tutTarget, tutMarkTargets, tutColor, game.states]);

  // Drop-off funnel: one event per stage the player actually reaches. Stage 4
  // can be skipped by the board (3 → 5), which shows up as a gap rather than
  // a drop. `onboarding_completed` closes the funnel.
  useEffect(() => {
    if (!tutorial) return;
    analytics.track("tutorial_step", {
      step: tutStep,
      name: TUTORIAL_STEPS[tutStep].name,
    });
  }, [tutorial, tutStep]);

  const finishTutorial = () => {
    setTutStep(TUT_DONE);
    game.completeOnboarding();
  };

  // Freeze the solve clock while the tutorial holds the board (the forced
  // walkthrough shouldn't eat into Level 1's par time). The cleanup also
  // unfreezes on unmount, so leaving mid-tutorial can't strand the flag on
  // the shared game hook.
  useEffect(() => {
    game.setTimerPaused(tutorial);
    return () => game.setTimerPaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref write; game identity churns per render
  }, [tutorial]);

  // Board frame position (relative to the screen root — the overlay's space),
  // measured off the board wrapper so the spotlight can ring exact cells.
  const { width: winW } = useWindowDimensions();
  const [boardBox, setBoardBox] = useState<{ x: number; y: number; w: number } | null>(null);
  // Rule-chip type is sized off the viewport, not fixed — see chipFontSize.
  const chipFont = chipFontSize(winW);

  // The blackout's spotlight hole for the current stage (null = total
  // blackout, used only for the finish stage). Stage 0: just the singleton
  // cell. Stage 1: the 3×3 block around it (clamped to the grid) — plant
  // visible in the middle, ✕ targets outlined around it. Stage 2: its whole
  // row. Stage 3: its whole column. Stage 4: the bounding box of the
  // one-cell-left colour cluster (see tutColor) — the player sees its ✕'d
  // cells and the single open spot together; clusters aren't always
  // rectangular, so the box can include a stray outside cell, and the
  // pulsing highlight ring (not the box) marks the cell to plant.
  const tutHole = useMemo<Hole | null>(() => {
    if (!tutorial || !tutTarget || !boardBox) return null;
    if (tutStep < 0 || tutStep > 4) return null;
    if (tutStep === 4 && !tutColor) return null;
    const [tr, tc] = tutTarget;
    let r0 = tr, r1 = tr, c0 = tc, c1 = tc;
    if (tutStep === 1) {
      r0 = Math.max(0, tr - 1);
      r1 = Math.min(size - 1, tr + 1);
      c0 = Math.max(0, tc - 1);
      c1 = Math.min(size - 1, tc + 1);
    } else if (tutStep === 2) {
      c0 = 0;
      c1 = size - 1;
    } else if (tutStep === 3) {
      r0 = 0;
      r1 = size - 1;
    } else if (tutStep === 4 && tutColor) {
      const box = bbox(tutColor.cells);
      r0 = box.r0;
      r1 = box.r1;
      c0 = box.c0;
      c1 = box.c1;
    }
    const { cellPx, frameW } = boardMetrics(winW, size);
    const x0 = boardBox.x + (boardBox.w - frameW) / 2 + BOARD_FRAME;
    const y0 = boardBox.y + BOARD_FRAME;
    const PAD = 6;
    return {
      x: x0 + c0 * cellPx - PAD,
      y: y0 + r0 * cellPx - PAD,
      w: (c1 - c0 + 1) * cellPx + PAD * 2,
      h: (r1 - r0 + 1) * cellPx + PAD * 2,
    };
  }, [tutorial, tutStep, tutTarget, tutColor, boardBox, winW, size]);

  // Tutorial lockout: the blackout scrim already swallows touch-downs outside
  // the spotlight, but a drag granted inside the hole keeps delivering moves
  // after the finger leaves it — so the handlers must gate too. During the
  // tutorial only the prompted action works: stages 0/4 = double-tap their
  // one cell, stages 1-3 = mark/unmark the stage's target cells (never a
  // plant — a tap on a placed cell would uproot it).
  const canMarkAt = (r: number, c: number) =>
    !tutorial || tutMarkTargets.some(([nr, nc]) => nr === r && nc === c);

  // Drag-paint fires the mark cue once per cell — even on a fast swipe every
  // cell ticks (the audio facade pools voices so they overlap, see src/audio).
  const paint = (r: number, c: number) => {
    if (!canMarkAt(r, c)) return;
    Haptics?.selectionAsync().catch(() => {});
    audio.play("mark");
    game.paint(r, c);
  };
  const erase = (r: number, c: number) => {
    if (!canMarkAt(r, c)) return;
    Haptics?.selectionAsync().catch(() => {});
    audio.play("mark");
    game.erase(r, c);
  };
  const place = (r: number, c: number) => {
    if (tutorial) {
      const allowed =
        tutStep === 0
          ? tutTarget
          : tutStep === 4
            ? tutColor?.cell
            : null;
      if (!allowed || r !== allowed[0] || c !== allowed[1]) return;
    }
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // A wrong cell costs a heart — cue accordingly (the win sound is fired by
    // the solved effect when the final correct plant completes the board).
    const correct = game.puzzle.solution[r] === c;
    audio.play(correct ? "place" : "mistake");
    game.place(r, c);
  };
  const tapCell = (r: number, c: number) => {
    if (!canMarkAt(r, c)) return;
    Haptics?.selectionAsync().catch(() => {});
    audio.play("mark");
    game.tap(r, c);
  };
  // Win fanfare: sound + haptic on the solved edge, then the flourish (a big
  // bloom of the plant that finished the board) holds the screen before the
  // result card. `flourish` gates WinOverlay; a timer backstops the animation
  // callback so the modal can never be stranded behind it.
  const [flourish, setFlourish] = useState(false);
  React.useEffect(() => {
    if (!game.solved) {
      setFlourish(false);
      return;
    }
    Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    audio.play("win");
    setFlourish(true);
    const t = setTimeout(() => setFlourish(false), FLOURISH_MS + 400);
    return () => clearTimeout(t);
  }, [game.solved]);

  // Out of hearts: sound the game-over cue (the FailOverlay takes the screen).
  React.useEffect(() => {
    if (game.failed) audio.play("fail");
  }, [game.failed]);

  // Juice: shake the board (+ error haptic) when a plant is rejected by a
  // wrong cell (which turns it into a red ✕).
  const shake = useRef(new Animated.Value(0)).current;
  const prevMistakes = useRef(game.mistakes.size);
  // Whose ✕s those are: a resumed board arrives with its red ✕s already in
  // place, and re-playing the rejection beat for a mistake made last session
  // would be a lie. Adopt a new/restored board's count silently.
  const shakeBoard = useRef(game.puzzle);
  useEffect(() => {
    if (shakeBoard.current !== game.puzzle) {
      shakeBoard.current = game.puzzle;
      prevMistakes.current = game.mistakes.size;
      return;
    }
    if (game.mistakes.size > prevMistakes.current) {
      Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      shake.setValue(0);
      Animated.sequence(
        [1, -1, 0.6, -0.6, 0].map((v) =>
          Animated.timing(shake, {
            toValue: v,
            duration: 45,
            useNativeDriver: true,
          }),
        ),
      ).start();
    }
    prevMistakes.current = game.mistakes.size;
  }, [game.mistakes, game.puzzle, shake]);

  // Progress bar fill (plants placed / board size), springy.
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(progress, {
      toValue: game.placedCount / size,
      friction: 8,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [game.placedCount, size, progress]);

  // The progress leaf gives a little kick on every plant, so the counter
  // registers as a reward and not just a number changing.
  const leafPop = useRef(new Animated.Value(1)).current;
  const prevPlaced = useRef(game.placedCount);
  useEffect(() => {
    if (game.placedCount > prevPlaced.current) {
      leafPop.setValue(1.5);
      Animated.spring(leafPop, {
        toValue: 1,
        friction: 4,
        tension: 180,
        useNativeDriver: true,
      }).start();
    }
    prevPlaced.current = game.placedCount;
  }, [game.placedCount, leafPop]);

  return (
    <LinearGradient
      colors={BG_GRADIENT}
      locations={[0, 0.42, 1]}
      style={styles.wrap}
    >
      <View style={styles.header}>
        <Tappable
          hitSlop={12}
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel="Back to menu"
          style={styles.headerBtn}
        >
          <View style={styles.headerCircle}>
            <Ionicons name="arrow-back" size={21} color={theme.text} />
          </View>
        </Tappable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {game.mode === "daily" && game.dailyKey ? (
            <>
              <Ionicons name="sunny" size={16} color={theme.text} />
              {` Daily ${formatDateKey(game.dailyKey)}`}
            </>
          ) : game.mode === "endless" && game.endlessDifficulty ? (
            <>
              <Ionicons name="leaf" size={16} color={theme.text} />
              {` ${DIFF_LABEL[game.endlessDifficulty]}`}
            </>
          ) : (
            `Level ${game.level}`
          )}
        </Text>
        <Tappable
          hitSlop={12}
          onPress={() => setShowHelp(true)}
          accessibilityRole="button"
          accessibilityLabel="How to play"
          style={styles.headerBtn}
        >
          <View style={styles.headerCircle}>
            <Ionicons name="help" size={20} color={theme.text} />
          </View>
        </Tappable>
      </View>

      {/* The rules get a full card only while the tutorial is teaching them;
          after that they're three chips that explain themselves on tap, and
          the space goes to the board. */}
      {tutorial ? (
        <View style={styles.rulesCard}>
          {RULES.map((rule, i) => (
            <React.Fragment key={rule.label}>
              {i > 0 && <View style={styles.ruleDivider} />}
              <View style={styles.ruleCol}>
                <Ionicons name={rule.icon} size={22} color={theme.accent} />
                <Text style={styles.ruleTxt}>{rule.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : (
        <View style={styles.ruleChipsWrap}>
          <View style={styles.ruleChips}>
            {RULES.map((rule, i) => (
              <Tappable
                key={rule.label}
                onPress={() => setOpenRule(openRule === i ? null : i)}
                accessibilityRole="button"
                accessibilityLabel={rule.detail}
                style={[styles.ruleChip, openRule === i && styles.ruleChipOpen]}
              >
                <Ionicons
                  name={rule.icon}
                  size={CHIP_ICON}
                  color={theme.accentDark}
                />
                <Text
                  style={[styles.ruleChipTxt, { fontSize: chipFont }]}
                  numberOfLines={1}
                >
                  {rule.label}
                </Text>
              </Tappable>
            ))}
          </View>
          {openRule != null && (
            <Text style={styles.ruleDetail}>{RULES[openRule].detail}</Text>
          )}
        </View>
      )}

      {/* The clock is the headline number and the hearts support it. A "Best
          <time>" caption used to sit alongside them; it was removed because it
          only rendered once the level had been completed, so it showed up
          exactly on the replays — turning a re-solve into a time trial against
          yourself on a puzzle whose answer you already know. Levels now keep no
          best time at all; stars are the record. The clock still runs and still
          decides the under-par star, it just isn't measured against a previous
          run. `game.bestSeconds` is daily/endless-only now. */}
      <View style={styles.statusRow}>
        <Text style={styles.clock}>{formatTime(game.seconds)}</Text>
        <View style={styles.statusItem}>
          <Hearts hearts={game.hearts} max={game.maxHearts} size={24} />
          {!game.onboarded && (
            <Text style={styles.statusLabel}>mistakes left</Text>
          )}
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressLabel}>
          <Animated.View style={{ transform: [{ scale: leafPop }] }}>
            <Ionicons name="leaf" size={17} color={theme.accentDark} />
          </Animated.View>
          <Text style={styles.progressTxt}>
            {`${game.placedCount} of ${size} planted`}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              { transform: [{ scaleX: progress }] },
            ]}
          />
        </View>
      </View>

      <Animated.View
        onLayout={(e) => {
          const { x, y, width } = e.nativeEvent.layout;
          setBoardBox({ x, y, w: width });
        }}
        style={[
          styles.boardWrap,
          {
            transform: [
              {
                translateX: shake.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-8, 8],
                }),
              },
            ],
          },
        ]}
      >
        <Board
          puzzle={game.puzzle}
          plant={game.plant}
          states={game.states}
          mistakes={game.mistakes}
          onPaint={paint}
          onErase={erase}
          onPlace={place}
          onTap={tapCell}
          highlight={
            !tutorial
              ? null
              : tutStep === 0
                ? tutTarget
                : tutStep === 4
                  ? (tutColor?.cell ?? null)
                  : null
          }
          hintCells={
            tutorial && tutMarkTargets.length > 0 ? tutMarkTargets : null
          }
        />
      </Animated.View>

      {/* The gesture reminder is onboarding copy, not a control: it's here for
          the first board only, and lives in Help from then on. The row keeps
          its height either way, so finishing the tutorial doesn't jolt the
          board up the screen. */}
      <View style={styles.hintRow}>
        {!game.onboarded && (
          <View style={styles.hintPill}>
            <Text style={styles.hintLine}>Mark ✕ · double-tap or hold to plant</Text>
          </View>
        )}
      </View>

      {/* Hint is the row's hero — the widest and the only filled button —
          because it is the one control a stuck player is looking for.
          Undo sits beside it in the cream secondary family, and Reset is ranked
          down by *footprint* (a narrow rounded button) rather than by being
          drained of contrast, which is what made it read as disabled. It keeps
          a full-strength icon and a caption, so it never looks like dead UI.
          Destroying real work needs a second tap (or a long press to skip the
          confirmation once you know the control). */}
      <View style={styles.controls}>
        <Button
          label="Undo"
          icon="arrow-undo"
          variant="warm"
          onPress={game.undo}
          disabled={!game.canUndo || tutorial}
          badge={game.undoDepth}
          pill
          flex
        />
        <View style={styles.hintCol}>
          {/* No `flex` here: the wrapper is a *column*, so flex-grow would
              stretch the button vertically (which is what left a slab of the
              dark bottom edge showing under it) — a column child already
              stretches to full width on its own. */}
          <Button
            label="Hint"
            icon="bulb"
            variant="forest"
            onPress={game.requestHint}
            disabled={tutorial}
            badge={game.hintsUsed}
            pill
          />
        </View>
        <View style={styles.resetCol}>
          <Button
            label={resetArmed ? "Confirm reset" : "Reset board"}
            icon={resetArmed ? "alert" : "refresh"}
            variant={resetArmed ? "danger" : "warm"}
            onPress={onReset}
            onLongPress={game.placedCount > 0 ? resetNow : undefined}
            disabled={tutorial}
            compact
          />
          <Text style={[styles.resetTxt, resetArmed && styles.resetTxtArmed]}>
            {resetArmed ? "Tap again" : "Reset"}
          </Text>
        </View>
      </View>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      {tutorial && (
        <TutorialOverlay
          hole={tutHole}
          text={TUTORIAL_STEPS[tutStep].text}
          buttonLabel={TUTORIAL_STEPS[tutStep].button}
          onButton={finishTutorial}
          holeRing={tutStep === 0}
          pointer={tutStep === 0}
          checklist={[
            { label: "No touch", done: tutStep > 1 },
            { label: "Row", done: tutStep > 2 },
            { label: "Column", done: tutStep > 3 },
            { label: "Color", done: tutStep > 4 },
          ]}
        />
      )}

      {game.solved && flourish && (
        <WinFlourish
          plantId={
            // The freshly unlocked card outranks the board's own plant — it is
            // the more exciting thing to bloom, and the win card reveals it next.
            (game.mode === "level" && game.newCards[0]?.plantId) ||
            game.plant
          }
          onDone={() => setFlourish(false)}
        />
      )}

      {game.solved && !flourish && (
        <WinOverlay
          level={game.level}
          seconds={game.seconds}
          daily={
            game.mode === "daily" && game.dailyKey
              ? { date: formatDateKey(game.dailyKey), streak: game.dailyStreak }
              : null
          }
          stars={
            game.mode === "level" && game.solveStars != null
              ? {
                  earned: game.solveStars,
                  par: parSeconds(game.puzzle.size, game.puzzle.tier),
                  hintsUsed: game.hintsUsed,
                }
              : null
          }
          newCards={game.mode === "level" ? game.newCards : []}
          totalStars={game.totalStars}
          coinsEarned={game.coinsEarned}
          milestone={game.mode === "level" ? game.milestone : null}
          endless={game.mode === "endless"}
          onMenu={goHome}
        />
      )}

      {game.failed && (
        <FailOverlay
          title={
            game.mode === "daily" && game.dailyKey
              ? `Daily ${formatDateKey(game.dailyKey)}`
              : game.mode === "endless" && game.endlessDifficulty
                ? `${DIFF_LABEL[game.endlessDifficulty]} board`
                : `Level ${game.level}`
          }
          coins={game.coins}
          reviveCost={game.reviveCost}
          onRevive={game.revive}
          onRetry={game.retry}
          onMenu={leave}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space(1),
  },
  headerBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: theme.text,
    fontSize: 27,
    fontWeight: "900",
    flexShrink: 1,
  },
  // Both header controls are the same soft white disc: the back arrow and the
  // help mark are peers, and a disc reads as tappable on a page with no other
  // chrome.
  headerCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panelWarm,
    ...shadow.card,
  },
  // Full width inside the screen's own padding — the three chips have to fit
  // one row on the narrowest phone, so there is no width to give away here.
  ruleChipsWrap: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 440,
    marginTop: space(1),
  },
  ruleChips: {
    flexDirection: "row",
    gap: CHIP_GAP,
  },
  // `flex: 1` (not intrinsic width) is what keeps this row on-screen: three
  // equal thirds that shrink with the viewport, instead of three content-sized
  // pills whose sum overflowed the page on a 390pt phone. The padding is small
  // because it is invisible here — the labels are centred in a fixed third, so
  // all it does is eat into the room the label has (see chipFontSize).
  ruleChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: CHIP_ICON_GAP,
    paddingVertical: 9,
    paddingHorizontal: CHIP_PAD,
    borderRadius: 999,
    backgroundColor: theme.panelWarm,
    ...shadow.card,
  },
  ruleChipOpen: {
    backgroundColor: theme.btnWarm,
  },
  // fontSize comes from chipFontSize at render — it depends on the viewport.
  ruleChipTxt: {
    color: theme.text,
    fontWeight: "700",
  },
  ruleDetail: {
    ...typography.caption,
    color: theme.textDim,
    textAlign: "center",
    marginTop: space(2),
  },
  rulesCard: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "center",
    width: "92%",
    maxWidth: 440,
    backgroundColor: theme.panelWarm,
    borderColor: theme.btnWarmLine,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderBottomColor: theme.btnWarmEdge,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginTop: 10,
  },
  ruleCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    paddingHorizontal: 6,
  },
  ruleDivider: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 2,
    backgroundColor: theme.panelLine,
  },
  ruleTxt: {
    color: theme.text,
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: space(5),
    marginTop: space(3),
  },
  // Fixed height: the "mistakes left" caption below the hearts only shows on
  // a first-time player's board, and its arrival/departure must not move the
  // board underneath it.
  statusItem: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    gap: 2,
  },
  statusLabel: {
    color: theme.textDim,
    fontSize: 10.5,
    fontWeight: "700",
  },
  clock: {
    color: theme.text,
    fontSize: 33,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  progressRow: {
    alignItems: "center",
    gap: space(1),
    alignSelf: "center",
    width: "92%",
    maxWidth: 440,
    marginTop: space(3),
    marginBottom: space(2),
  },
  progressTrack: {
    alignSelf: "stretch",
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.bgWarmAlt,
    overflow: "hidden",
  },
  progressFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.accent,
    borderRadius: 5,
    transformOrigin: "left",
  },
  progressLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressTxt: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  boardWrap: {
    alignItems: "center",
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: "94%",
    maxWidth: 460,
    minHeight: 32,
    marginVertical: space(4),
  },
  hintPill: {
    flexShrink: 1,
    backgroundColor: theme.btnWarm,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
    alignItems: "center",
  },
  hintLine: {
    ...typography.caption,
    color: theme.textDim,
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space(3),
  },
  // The hero leads on *width* and on being the only filled button — it is the
  // same height as its neighbours, so the row still reads as one row. Ranking
  // it up with extra height and 20pt type as well made it a slab.
  hintCol: {
    flex: 1.35,
  },
  resetCol: {
    alignItems: "center",
  },
  // Always captioned: a bare icon is what left this control ambiguous, and a
  // caption that comes and goes with the level would move the row instead.
  resetTxt: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  resetTxtArmed: {
    color: theme.dangerDark,
    fontWeight: "900",
  },
});
