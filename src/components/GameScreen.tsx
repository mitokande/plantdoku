import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { DIFFICULTIES, type Difficulty } from "../game/types";
import type { Game } from "../state/useGame";
import { formatTime } from "../format";
import { radius, theme } from "../theme";
import { Board } from "./Board";
import { Button } from "./Button";
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statVal}>{value}</Text>
    </View>
  );
}

export function GameScreen({ game, onMenu }: Props) {
  const { label, size } = DIFFICULTIES[game.difficulty];

  const paint = (r: number, c: number) => {
    Haptics?.selectionAsync().catch(() => {});
    game.paint(r, c);
  };
  const place = (r: number, c: number) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    game.place(r, c);
  };
  const tapCell = (r: number, c: number) => {
    Haptics?.selectionAsync().catch(() => {});
    game.tap(r, c);
  };

  React.useEffect(() => {
    if (game.solved) {
      Haptics?.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
  }, [game.solved]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={onMenu} style={styles.iconBtn}>
          <Text style={styles.iconTxt}>‹ Menu</Text>
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>{label}</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => game.newGame(game.difficulty)}
          style={styles.iconBtn}
        >
          <Text style={styles.iconTxt}>New ↻</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat label="TIME" value={formatTime(game.seconds)} />
        <Stat label="BEST" value={formatTime(game.bestSeconds)} />
        <Stat label="PLANTS" value={`${game.placedCount}/${size}`} />
      </View>

      <View style={styles.boardWrap}>
        <Board
          puzzle={game.puzzle}
          states={game.states}
          conflicts={game.conflicts}
          onPaint={paint}
          onPlace={place}
          onTap={tapCell}
        />
      </View>

      <Text style={styles.hintLine}>
        Tap or swipe to mark ✕ · double-tap to place · tap again to clear
      </Text>

      <View style={styles.controls}>
        <Button label="Undo" icon="↶" onPress={game.undo} disabled={!game.canUndo} flex />
        <Button label="Hint" icon="💡" onPress={game.hint} flex />
        <Button label="Reset" icon="⟳" onPress={game.reset} flex />
      </View>

      {game.solved && (
        <WinOverlay
          seconds={game.seconds}
          bestSeconds={game.bestSeconds}
          isNewBest={game.newBest}
          onPlayAgain={() => game.newGame(game.difficulty)}
          onMenu={onMenu}
        />
      )}
    </View>
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
  iconTxt: {
    color: theme.textDim,
    fontSize: 15,
    fontWeight: "700",
  },
  pill: {
    backgroundColor: theme.panel,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  pillTxt: {
    color: theme.accent,
    fontWeight: "800",
    fontSize: 14,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginTop: 6,
    marginBottom: 14,
  },
  stat: {
    alignItems: "center",
    minWidth: 64,
  },
  statLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  statVal: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  boardWrap: {
    alignItems: "center",
  },
  hintLine: {
    color: theme.textDim,
    fontSize: 12.5,
    textAlign: "center",
    marginTop: 14,
    marginBottom: 14,
  },
  controls: {
    flexDirection: "row",
    gap: 10,
  },
});
