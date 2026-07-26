import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
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
import { shadow, theme } from "./src/theme";

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

  // Reschedule local reminders each time the app returns to the foreground, so
  // the "we miss you" timers reset on every real visit (they only fire during a
  // genuine multi-day absence). Leaving the foreground also flushes the live
  // board to the resume slot, so an app kill (or a swipe-away) keeps the solve
  // and its clock. The refs keep the listener stable while always calling the
  // latest closure (game is rebuilt every render).
  const syncReminders = useRef(game.syncReminders);
  syncReminders.current = game.syncReminders;
  const saveResume = useRef(game.saveResume);
  saveResume.current = game.saveResume;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") syncReminders.current();
      else saveResume.current();
    });
    return () => sub.remove();
  }, []);

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

  // Play picks up a saved board for the same level instead of wiping it — the
  // Continue card is the explicit route, this just stops the big green button
  // from being a trap. Any other saved board (a daily, an endless run) is
  // superseded, as it would be by any other new game.
  const startLevel = () => {
    const level = Math.min(game.unlockedLevel, LEVEL_COUNT);
    if (game.resumeSlots.level?.level === level) game.resumeGame("level");
    else game.newGame(level);
    setPlaying(true);
  };

  // Continue from the Home card: whatever mode the saved board was in.
  const continueBoard = () => {
    game.resumeGame();
    setPlaying(true);
  };

  const startDaily = () => {
    // Today's daily left half-solved resumes rather than restarting (losing a
    // streak to a phone call is the worst version of this bug).
    if (game.resumeSlots.daily) game.resumeGame("daily");
    else game.newDaily();
    setPlaying(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
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
            <Pressable
              hitSlop={10}
              onPress={() => setShowSettings(true)}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={styles.settingsBtn}
            >
              <Ionicons name="settings-sharp" size={22} color={theme.textDim} />
            </Pressable>
          </View>

          <View style={styles.page}>
            {tab === "home" && (
              <HomeScreen
                unlockedLevel={game.unlockedLevel}
                allComplete={game.allComplete}
                totalStars={game.totalStars}
                resume={game.resume}
                onResume={continueBoard}
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
                hasSaved={game.resumeSlots.daily != null}
                onPlay={startDaily}
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
          notifsOn={game.notifsOn}
          onToggleNotifs={game.setNotifsOn}
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
  settingsBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.panel,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
    ...shadow.card,
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
