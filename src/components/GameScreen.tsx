import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { analytics } from "../analytics";
import { audio } from "../audio";
import type { Game } from "../state/useGame";
import { nextCard } from "../game/cards";
import { dailyNumber } from "../game/daily";
import { parSeconds } from "../game/stars";
import type { Coord } from "../game/types";
import { formatTime } from "../format";
import { useBackHandler } from "../hooks/useBackHandler";
import { radius, theme } from "../theme";
import { Board, BOARD_FRAME, boardMetrics } from "./Board";
import { Button } from "./Button";
import { FailOverlay } from "./FailOverlay";
import { Hearts } from "./Hearts";
import { HelpOverlay } from "./HelpOverlay";
import { TutorialOverlay, type Hole } from "./TutorialOverlay";
import { WinOverlay } from "./WinOverlay";

let Haptics: typeof import("expo-haptics") | null = null;
if (Platform.OS !== "web") {
  // Loaded lazily so web builds don't pull in the native module.
  Haptics = require("expo-haptics");
}

interface Props {
  game: Game;
  onMenu: () => void;
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

// Garden-at-dusk depth: slightly lighter glade behind the board, darker
// canopy at the top and bottom edges.
const BG_GRADIENT = ["#0E1F14", "#1D3826", "#0B1710"] as const;

// The three core rules — the prominent card above the board, one per column.
const RULES = [
  { icon: "leaf", text: "One per\nrow & column" },
  { icon: "color-palette", text: "One per\ncolour" },
  { icon: "close-circle", text: "No two\ntouching" },
] as const satisfies { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }[];

export function GameScreen({ game, onMenu }: Props) {
  const { size } = game.puzzle;
  const [showHelp, setShowHelp] = useState(false);

  // Every way out of the board goes through here: an unfinished board is
  // saved to the resume slot (so Home can offer Continue) and reported as
  // abandoned. Both no-op on a board that was won or lost.
  const leave = () => {
    game.abandonBoard();
    onMenu();
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
    audio.play(game.puzzle.solution[r] === c ? "place" : "mistake");
    game.place(r, c);
  };
  const tapCell = (r: number, c: number) => {
    if (!canMarkAt(r, c)) return;
    Haptics?.selectionAsync().catch(() => {});
    audio.play("mark");
    game.tap(r, c);
  };

  // Win fanfare.
  React.useEffect(() => {
    if (game.solved) {
      Haptics?.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      audio.play("win");
    }
  }, [game.solved]);

  // Out of hearts: sound the game-over cue (the FailOverlay takes the screen).
  React.useEffect(() => {
    if (game.failed) audio.play("fail");
  }, [game.failed]);

  // Juice: shake the board (+ error haptic) when a plant is rejected by a
  // wrong cell (which turns it into a red ✕).
  const shake = useRef(new Animated.Value(0)).current;
  const prevMistakes = useRef(0);
  useEffect(() => {
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
  }, [game.mistakes, shake]);

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

  return (
    <LinearGradient
      colors={BG_GRADIENT}
      locations={[0, 0.42, 1]}
      style={styles.wrap}
    >
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={leave} style={styles.iconBtn}>
          <Text style={styles.iconTxt}>‹ Menu</Text>
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>
            {game.mode === "daily" && game.dailyKey ? (
              <>
                <Ionicons name="sunny" size={14} color={theme.text} />
                {` Daily #${dailyNumber(game.dailyKey)}`}
              </>
            ) : game.mode === "endless" && game.endlessDifficulty ? (
              <>
                <Ionicons name="leaf" size={14} color={theme.text} />
                {` ${DIFF_LABEL[game.endlessDifficulty]}`}
              </>
            ) : (
              `Level ${game.level}`
            )}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => setShowHelp(true)}
          style={[styles.iconBtn, styles.iconBtnRight]}
        >
          <Text style={styles.iconTxt}>Help ?</Text>
        </Pressable>
      </View>

      <View style={styles.rulesCard}>
        {RULES.map((rule, i) => (
          <React.Fragment key={rule.text}>
            {i > 0 && <View style={styles.ruleDivider} />}
            <View style={styles.ruleCol}>
              <Ionicons name={rule.icon} size={22} color={theme.accent} />
              <Text style={styles.ruleTxt}>{rule.text}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>TIME</Text>
          <Text style={styles.statusVal}>{formatTime(game.seconds)}</Text>
        </View>
        <Hearts hearts={game.hearts} max={game.maxHearts} />
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>BEST</Text>
          <Text style={styles.statusVal}>{formatTime(game.bestSeconds)}</Text>
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              { transform: [{ scaleX: progress }] },
            ]}
          />
        </View>
        <Text style={styles.progressTxt}>
          <Ionicons name="leaf" size={13} color={theme.accent} />
          {` ${game.placedCount}/${size}`}
        </Text>
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

      <View style={styles.hintRow}>
        <View style={[styles.hintPill, styles.hintFlex]}>
          <Text style={styles.hintLine}>Mark ✕ · double-tap or hold to plant</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Button
          label="Undo"
          icon="arrow-undo"
          onPress={game.undo}
          disabled={!game.canUndo || tutorial}
          badge={game.undoDepth}
          flex
        />
        <Button
          label="Hint"
          icon="bulb"
          variant="ghost"
          onPress={game.requestHint}
          disabled={tutorial}
          badge={game.hintsUsed}
          flex
        />
        <Button
          label="Reset"
          icon="refresh"
          onPress={game.reset}
          disabled={tutorial}
          flex
        />
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

      {game.solved && (
        <WinOverlay
          level={game.level}
          seconds={game.seconds}
          bestSeconds={game.bestSeconds}
          isNewBest={game.newBest}
          hasNext={game.hasNextLevel}
          daily={
            game.mode === "daily" && game.dailyKey
              ? { number: dailyNumber(game.dailyKey), streak: game.dailyStreak }
              : null
          }
          stars={
            game.mode === "level" && game.solveStars != null
              ? {
                  earned: game.solveStars,
                  par: parSeconds(game.puzzle.size, game.puzzle.tier),
                }
              : null
          }
          newCards={game.mode === "level" ? game.newCards : []}
          nextCardIn={
            game.mode === "level"
              ? (() => {
                  const upcoming = nextCard(game.totalStars);
                  return upcoming ? upcoming.stars - game.totalStars : null;
                })()
              : null
          }
          onShare={() => {
            if (game.mode !== "daily" || !game.dailyKey) return;
            const streak = game.dailyStreak;
            const message =
              `🌻 Plantdoku Daily #${dailyNumber(game.dailyKey)} — ` +
              `⏱ ${formatTime(game.seconds)}` +
              (streak > 1 ? ` · 🔥 ${streak} day streak` : "");
            // Rejects on web when navigator.share is unavailable — ignore.
            Share.share({ message }).catch(() => {});
          }}
          endless={game.mode === "endless"}
          onNext={() =>
            game.mode === "endless" && game.endlessDifficulty
              ? game.newEndless(game.endlessDifficulty)
              : game.newGame(game.level + 1)
          }
          onMenu={leave}
        />
      )}

      {game.failed && (
        <FailOverlay
          title={
            game.mode === "daily" && game.dailyKey
              ? `Daily #${dailyNumber(game.dailyKey)}`
              : game.mode === "endless" && game.endlessDifficulty
                ? `${DIFF_LABEL[game.endlessDifficulty]} board`
                : `Level ${game.level}`
          }
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
    paddingVertical: 6,
  },
  iconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 72,
  },
  iconBtnRight: {
    alignItems: "flex-end",
  },
  iconTxt: {
    color: theme.textDim,
    fontSize: 15,
    fontWeight: "700",
  },
  pill: {
    backgroundColor: theme.panel,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  pillTxt: {
    color: theme.accent,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  rulesCard: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "center",
    width: "92%",
    maxWidth: 440,
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderBottomColor: theme.panelEdge,
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
    gap: 24,
    marginTop: 12,
  },
  statusItem: {
    alignItems: "center",
    gap: 2,
  },
  statusLabel: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  statusVal: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "center",
    width: "92%",
    maxWidth: 440,
    marginTop: 12,
    marginBottom: 10,
  },
  progressTrack: {
    flex: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.panelLine,
    overflow: "hidden",
  },
  progressFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.accent,
    borderRadius: 999,
    transformOrigin: "left",
  },
  progressTxt: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: "800",
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
    gap: 8,
    marginTop: 14,
    marginBottom: 14,
  },
  hintFlex: {
    flexShrink: 1,
    flexGrow: 1,
  },
  hintPill: {
    backgroundColor: theme.bgAlt,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
    alignItems: "center",
  },
  hintLine: {
    color: theme.textDim,
    fontSize: 12.5,
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    gap: 10,
  },
});
