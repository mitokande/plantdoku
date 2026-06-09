import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Platform,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
} from "react-native";

import { DifficultyMenu } from "./src/components/DifficultyMenu";
import { GameScreen } from "./src/components/GameScreen";
import type { Difficulty } from "./src/game/types";
import { useGame } from "./src/state/useGame";
import { theme } from "./src/theme";

export default function App() {
  const game = useGame("easy");
  const [screen, setScreen] = useState<"menu" | "game">("menu");

  const start = (d: Difficulty) => {
    game.newGame(d);
    setScreen("game");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {screen === "menu" ? (
        <DifficultyMenu bestTimes={game.bestTimes} onSelect={start} />
      ) : (
        <GameScreen game={game} onMenu={() => setScreen("menu")} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0,
  },
});
