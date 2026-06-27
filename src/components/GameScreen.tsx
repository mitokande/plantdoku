import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { audio } from "../audio";
import type { Game } from "../state/useGame";
import { nextCard } from "../game/cards";
import { dailyNumber } from "../game/daily";
import { parSeconds } from "../game/stars";
import { formatTime } from "../format";
import { useBackHandler } from "../hooks/useBackHandler";
import { radius, theme } from "../theme";
import { Board } from "./Board";
import { Button } from "./Button";
import { FailOverlay } from "./FailOverlay";
import { Hearts } from "./Hearts";
import { HelpOverlay } from "./HelpOverlay";
import { TutorialBubble } from "./TutorialBubble";
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

// First-play tutorial: steps 0..3 run on the real Level 1 board; TUT_DONE = off.
// While a step is active, board input is locked to the prompted action.
const TUT_DONE = 4;
const TUTORIAL_STEPS: { text: string; button?: string }[] = [
  {
    text: "Grow one plant in every row, every column and every color — and no two plants may touch, not even diagonally.",
    button: "Got it",
  },
  {
    text: "This color is a single cell, so its plant must go here. Double-tap the glowing cell to plant it!",
  },
  {
    text: "Plants can't touch! Tap or drag across cells to mark ✕ where no plant can go — try the cells around your plant.",
  },
  {
    text: "You've got it — fill the whole board! The Hint button is there if you get stuck.",
    button: "Let's go!",
  },
];

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

  // Advance gesture-completed steps by watching the board state.
  useEffect(() => {
    if (!tutorial || !tutTarget) return;
    if (tutStep === 1 && game.states[tutTarget[0]][tutTarget[1]] === "placed") {
      setTutStep(2);
    } else if (tutStep === 2) {
      let marked = 0;
      for (const row of game.states) for (const s of row) if (s === "marked") marked++;
      if (marked >= 3) setTutStep(3);
    }
  }, [tutorial, tutStep, tutTarget, game.states]);

  const finishTutorial = () => {
    setTutStep(TUT_DONE);
    game.completeOnboarding();
  };

  // Drag-paint fires the mark cue once per cell — even on a fast swipe every
  // cell ticks (the audio facade pools voices so they overlap, see src/audio).
  const paint = (r: number, c: number) => {
    if (tutorial && tutStep < 2) return;
    Haptics?.selectionAsync().catch(() => {});
    audio.play("mark");
    game.paint(r, c);
  };
  const erase = (r: number, c: number) => {
    if (tutorial && tutStep < 2) return;
    Haptics?.selectionAsync().catch(() => {});
    audio.play("mark");
    game.erase(r, c);
  };
  const place = (r: number, c: number) => {
    if (tutorial && (tutStep === 0 || tutStep === 2)) return;
    if (
      tutorial &&
      tutStep === 1 &&
      tutTarget &&
      (r !== tutTarget[0] || c !== tutTarget[1])
    )
      return;
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // A wrong cell costs a heart — cue accordingly (the win sound is fired by
    // the solved effect when the final correct plant completes the board).
    audio.play(game.puzzle.solution[r] === c ? "place" : "mistake");
    game.place(r, c);
  };
  const tapCell = (r: number, c: number) => {
    if (tutorial && tutStep < 2) return;
    Haptics?.selectionAsync().catch(() => {});
    audio.play("mark");
    game.tap(r, c);
  };

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
            tutorial
              ? tutStep === 1
                ? tutTarget
                : null
              : game.activeHint?.action === "place"
                ? game.activeHint.cell
                : null
          }
          hintCells={
            !tutorial && game.activeHint?.action === "mark"
              ? game.activeHint.cells
              : null
          }
        />
      </Animated.View>

      {tutorial ? (
        <TutorialBubble
          key={tutStep}
          step={tutStep + 1}
          total={TUTORIAL_STEPS.length}
          text={TUTORIAL_STEPS[tutStep].text}
          buttonLabel={TUTORIAL_STEPS[tutStep].button}
          onButton={tutStep === 0 ? () => setTutStep(1) : finishTutorial}
        />
      ) : game.activeHint ? (
        <View style={styles.hintCard}>
          <Text style={styles.hintCardTxt}>{game.activeHint.message}</Text>
        </View>
      ) : (
        <View style={styles.hintPill}>
          <Text style={styles.hintLine}>
            Tap or swipe to mark ✕ · double-tap to place
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <Button
          label="Undo"
          icon="arrow-undo"
          onPress={game.undo}
          disabled={!game.canUndo || (tutorial && tutStep < 3)}
          badge={game.undoDepth}
          flex
        />
        <Button
          label={game.activeHint ? "Apply" : "Hint"}
          icon={game.activeHint ? "checkmark" : "bulb"}
          variant={game.activeHint ? "solid" : "ghost"}
          onPress={game.activeHint ? game.applyHint : game.requestHint}
          disabled={tutorial && tutStep < 3}
          badge={game.hintsUsed}
          flex
        />
        <Button
          label="Reset"
          icon="refresh"
          onPress={game.reset}
          disabled={tutorial && tutStep < 3}
          flex
        />
      </View>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

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
  hintPill: {
    alignSelf: "center",
    backgroundColor: theme.bgAlt,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: 14,
    marginBottom: 14,
  },
  hintCard: {
    alignSelf: "center",
    width: "96%",
    maxWidth: 460,
    backgroundColor: theme.panel,
    borderColor: theme.gold,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 10,
    marginBottom: 10,
  },
  hintCardTxt: {
    color: theme.text,
    fontSize: 13.5,
    lineHeight: 18,
    textAlign: "center",
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
