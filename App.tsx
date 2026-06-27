import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { analytics } from "./src/analytics";
import { BottomNav, type Tab } from "./src/components/BottomNav";
import { CardsScreen } from "./src/components/CardsScreen";
import { DailyScreen } from "./src/components/DailyScreen";
import { GameScreen } from "./src/components/GameScreen";
import { HomeScreen } from "./src/components/HomeScreen";
import { SettingsOverlay } from "./src/components/SettingsOverlay";
import { LEVEL_COUNT } from "./src/game/levels";
import { useBackHandler } from "./src/hooks/useBackHandler";
import { useGame } from "./src/state/useGame";
import { theme } from "./src/theme";

export default function App() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("home");
  // A board fills the screen while playing — HUD and tab bar are hidden.
  const [playing, setPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Android back from a non-home tab returns Home before exiting the app.
  // (GameScreen / overlays mount later, so their handlers win while open.)
  useBackHandler(() => {
    if (!playing && tab !== "home") {
      setTab("home");
      return true;
    }
    return false;
  });

  // Record the active screen (game board, or the current tab when in the shell).
  useEffect(() => {
    analytics.screen(
      playing
        ? "Game"
        : tab === "home"
          ? "Home"
          : tab === "cards"
            ? "Cards"
            : "Daily",
    );
  }, [tab, playing]);

  const startLevel = () => {
    game.newGame(Math.min(game.unlockedLevel, LEVEL_COUNT));
    setPlaying(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {playing ? (
        <GameScreen game={game} onMenu={() => setPlaying(false)} />
      ) : (
        <>
          {/* Global HUD: star wallet (jumps to Cards) · streak · settings. */}
          <View style={styles.hud}>
            <Pressable onPress={() => setTab("cards")} style={styles.pill}>
              <Ionicons name="star" size={15} color={theme.gold} />
              <Text style={styles.pillTxt}>{game.totalStars}</Text>
            </Pressable>
            {game.dailyStreak > 0 && (
              <View style={styles.pill}>
                <Ionicons name="flame" size={15} color={theme.danger} />
                <Text style={styles.pillTxt}>{game.dailyStreak}</Text>
              </View>
            )}
            <View style={styles.hudSpacer} />
            <Pressable hitSlop={10} onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-sharp" size={24} color={theme.textDim} />
            </Pressable>
          </View>

          <View style={styles.page}>
            {tab === "home" && (
              <HomeScreen
                unlockedLevel={game.unlockedLevel}
                allComplete={game.allComplete}
                totalStars={game.totalStars}
                onPlay={startLevel}
                onEndless={(difficulty) => {
                  game.newEndless(difficulty);
                  setPlaying(true);
                }}
                onCards={() => setTab("cards")}
              />
            )}
            {tab === "cards" && <CardsScreen totalStars={game.totalStars} />}
            {tab === "daily" && (
              <DailyScreen
                dailyDone={game.dailyDoneToday}
                dailyStreak={game.dailyStreak}
                dailyLog={game.dailyLog}
                onPlay={() => {
                  game.newDaily();
                  setPlaying(true);
                }}
              />
            )}
          </View>

          <BottomNav tab={tab} onTab={setTab} dailyDot={!game.dailyDoneToday} />
        </>
      )}
      {showSettings && (
        <SettingsOverlay
          soundOn={game.soundOn}
          onToggleSound={game.setSoundOn}
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
  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  hudSpacer: {
    flex: 1,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  pillTxt: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
  },
  page: {
    flex: 1,
  },
});
