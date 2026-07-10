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

// First-play tutorial: steps 0..5 run on the real Level 1 board; TUT_DONE = off.
// The TutorialOverlay blacks out everything except the spotlit target, and the
// input handlers lock the board to exactly the prompted action.
const TUT_DONE = 6;
const TUTORIAL_STEPS: { text: string; button?: string }[] = [
  {
    text: "Grow one plant in every row, column and color.\nPlants can never touch — not even diagonally.",
    button: "Got it",
  },
  {
    text: "This color has just one cell, so its plant must live here. Double-tap to plant it!",
  },
  {
    text: "Plants never touch. Mark ✕ on every cell around your plant — tap or swipe.",
  },
  {
    text: "Only one plant per row — mark ✕ on the rest of its row. Swipe across it!",
  },
  {
    text: "And one per column — mark the rest of its column too.",
  },
  {
    text: "You're ready — fill the whole board!",
    button: "Let's go!",
  },
];

const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

/** Small "Finish" button that joins the hint-pill row — appears (with a pop)
 * when the rest of the board is trivially forced. */
function FinishFab({ onPress }: { onPress: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [pop]);
  return (
    <Animated.View style={{ opacity: pop, transform: [{ scale: pop }] }}>
      <Button
        small
        label="Finish"
        icon="checkmark-done"
        variant="solid"
        onPress={onPress}
      />
    </Animated.View>
  );
}

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

  // Android back returns to the menu (an open overlay registers later and
  // consumes the press first).
  useBackHandler(() => {
    onMenu();
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

  // The mark steps' target sets around the forced placement: the in-grid
  // cells touching it (no-touch rule), then the rest of its row and column
  // (one-per-row / one-per-column rules).
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
  const tutMarkTargets = !tutorial
    ? []
    : tutStep === 2
      ? tutNeighbors
      : tutStep === 3
        ? tutRowCells
        : tutStep === 4
          ? tutColCells
          : [];

  // Advance gesture-completed steps by watching the board state: the forced
  // placement, then each mark step once its whole target set is ✕'d.
  useEffect(() => {
    if (!tutorial || !tutTarget) return;
    if (tutStep === 1 && game.states[tutTarget[0]][tutTarget[1]] === "placed") {
      setTutStep(2);
    } else if (
      tutStep >= 2 &&
      tutStep <= 4 &&
      tutMarkTargets.length > 0 &&
      tutMarkTargets.every(([r, c]) => game.states[r][c] === "marked")
    ) {
      setTutStep(tutStep + 1);
    }
  }, [tutorial, tutStep, tutTarget, tutMarkTargets, game.states]);

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

  // --- Auto-complete (one plant left) ---------------------------------------
  // Pressing Finish plays a staged sweep instead of jumping to the win
  // overlay: every still-empty cell gets its ✕ one by one in reading order
  // (mark pop + tick each, like a fast drag), then the last plant pops in
  // with the place cue, then — after a beat — the overlay + win fanfare.
  // While `autoAnim` is set the board and controls are locked and the win
  // overlay (and its sound, below) wait for it to clear.
  const [autoAnim, setAutoAnim] = useState<Coord | null>(null);
  const autoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => autoTimers.current.forEach(clearTimeout), []);

  const startAutoComplete = () => {
    if (autoAnim) return;
    const { size: n, solution } = game.puzzle;
    let target: Coord | null = null;
    for (let r = 0; r < n && !target; r++)
      if (!game.states[r].includes("placed")) target = [r, solution[r]];
    if (!target) return;
    const [tr, tc] = target;
    // Every cell still empty except the final plant's own cell.
    const toMark: Coord[] = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (game.states[r][c] === "empty" && !(r === tr && c === tc))
          toMark.push([r, c]);
    setAutoAnim(target);
    Haptics?.selectionAsync().catch(() => {});
    // Per-cell pace scaled so the whole sweep stays ~a second regardless of
    // how many cells are left (the audio facade pools the overlapping ticks).
    const stepMs = Math.max(35, Math.min(80, 1100 / Math.max(1, toMark.length)));
    let i = 0;
    const tick = () => {
      if (i < toMark.length) {
        const [r, c] = toMark[i++];
        Haptics?.selectionAsync().catch(() => {});
        audio.play("mark");
        game.paint(r, c);
        autoTimers.current.push(setTimeout(tick, stepMs));
        return;
      }
      autoTimers.current.push(
        setTimeout(() => {
          Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
            () => {},
          );
          audio.play("place");
          game.autoComplete();
          autoTimers.current.push(setTimeout(() => setAutoAnim(null), 550));
        }, 200),
      );
    };
    autoTimers.current.push(setTimeout(tick, 150));
  };

  // Board frame position (relative to the screen root — the overlay's space),
  // measured off the board wrapper so the spotlight can ring exact cells.
  const { width: winW } = useWindowDimensions();
  const [boardBox, setBoardBox] = useState<{ x: number; y: number; w: number } | null>(null);

  // The blackout's spotlight hole for the current step (null = total blackout).
  // Step 1: just the singleton cell. Step 2: the 3×3 block around the plant
  // (clamped to the grid) — plant visible in the middle, ✕ targets around it.
  // Step 3: the plant's whole row. Step 4: its whole column.
  const tutHole = useMemo<Hole | null>(() => {
    if (!tutorial || !tutTarget || !boardBox) return null;
    if (tutStep < 1 || tutStep > 4) return null;
    const [tr, tc] = tutTarget;
    let r0 = tr, r1 = tr, c0 = tc, c1 = tc;
    if (tutStep === 2) {
      r0 = Math.max(0, tr - 1);
      r1 = Math.min(size - 1, tr + 1);
      c0 = Math.max(0, tc - 1);
      c1 = Math.min(size - 1, tc + 1);
    } else if (tutStep === 3) {
      c0 = 0;
      c1 = size - 1;
    } else if (tutStep === 4) {
      r0 = 0;
      r1 = size - 1;
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
  }, [tutorial, tutStep, tutTarget, boardBox, winW, size]);

  // Tutorial lockout: the blackout scrim already swallows touch-downs outside
  // the spotlight, but a drag granted inside the hole keeps delivering moves
  // after the finger leaves it — so the handlers must gate too. During the
  // tutorial only the prompted action works: step 1 = double-tap the target
  // cell, steps 2-4 = mark/unmark the step's target cells (never the plant
  // itself — a tap on a placed cell would uproot it).
  const canMarkAt = (r: number, c: number) =>
    autoAnim == null &&
    (!tutorial || tutMarkTargets.some(([nr, nc]) => nr === r && nc === c));

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
    if (autoAnim) return;
    if (
      tutorial &&
      (tutStep !== 1 || !tutTarget || r !== tutTarget[0] || c !== tutTarget[1])
    )
      return;
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

  // Win fanfare — held back while the auto-complete sequence is mid-flight so
  // the place cue and plant pop get their beat before the overlay lands.
  React.useEffect(() => {
    if (game.solved && !autoAnim) {
      Haptics?.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      audio.play("win");
    }
  }, [game.solved, autoAnim]);

  // Out of hearts: sound the game-over cue (the FailOverlay takes the screen).
  React.useEffect(() => {
    if (game.failed) audio.play("fail");
  }, [game.failed]);

  // Juice: shake the board (+ error haptic) when a plant lands on a wrong cell.
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
        <Pressable hitSlop={10} onPress={onMenu} style={styles.iconBtn}>
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
          highlight={tutorial && tutStep === 1 ? tutTarget : null}
          hintCells={
            tutorial && tutMarkTargets.length > 0 ? tutMarkTargets : null
          }
        />
      </Animated.View>

      <View style={styles.hintRow}>
        <View style={[styles.hintPill, styles.hintFlex]}>
          <Text style={styles.hintLine}>Mark ✕ · double-tap to plant</Text>
        </View>
        {game.canAutoComplete && !tutorial && !autoAnim && (
          <FinishFab onPress={startAutoComplete} />
        )}
      </View>

      <View style={styles.controls}>
        <Button
          label="Undo"
          icon="arrow-undo"
          onPress={game.undo}
          disabled={!game.canUndo || tutorial || autoAnim != null}
          badge={game.undoDepth}
          flex
        />
        <Button
          label="Hint"
          icon="bulb"
          variant="ghost"
          onPress={game.requestHint}
          disabled={tutorial || autoAnim != null}
          badge={game.hintsUsed}
          flex
        />
        <Button
          label="Reset"
          icon="refresh"
          onPress={game.reset}
          disabled={tutorial || autoAnim != null}
          flex
        />
      </View>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      {tutorial && (
        <TutorialOverlay
          hole={tutHole}
          text={TUTORIAL_STEPS[tutStep].text}
          buttonLabel={TUTORIAL_STEPS[tutStep].button}
          onButton={tutStep === 0 ? () => setTutStep(1) : finishTutorial}
          step={tutStep + 1}
          total={TUTORIAL_STEPS.length}
          pointer={tutStep === 1}
        />
      )}

      {game.solved && !autoAnim && (
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
          onMenu={onMenu}
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
          onMenu={onMenu}
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
