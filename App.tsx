import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Platform,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
} from "react-native";

import { MainMenu } from "./src/components/MainMenu";
import { GameScreen } from "./src/components/GameScreen";
import { SettingsOverlay } from "./src/components/SettingsOverlay";
import { LEVEL_COUNT } from "./src/game/levels";
import { useGame } from "./src/state/useGame";
import { theme } from "./src/theme";

export default function App() {
  const game = useGame();
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [showSettings, setShowSettings] = useState(false);

  const start = () => {
    game.newGame(Math.min(game.unlockedLevel, LEVEL_COUNT));
    setScreen("game");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {screen === "menu" ? (
        <MainMenu
          unlockedLevel={game.unlockedLevel}
          allComplete={game.allComplete}
          onPlay={start}
          onSettings={() => setShowSettings(true)}
        />
      ) : (
        <GameScreen game={game} onMenu={() => setScreen("menu")} />
      )}
      {showSettings && (
        <SettingsOverlay
          onFlush={game.flushData}
          onClose={() => setShowSettings(false)}
        />
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
