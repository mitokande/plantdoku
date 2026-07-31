import { Ionicons } from "@expo/vector-icons";
import * as NativeSplash from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Image,
  Platform,
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
import { SplashScreen } from "./src/components/SplashScreen";
import { RewardFlight, type Pt } from "./src/components/RewardFlight";
import { Tappable } from "./src/components/Tappable";
import { LEVEL_COUNT } from "./src/game/levels";
import { useBackHandler } from "./src/hooks/useBackHandler";
import { useGame } from "./src/state/useGame";
import { shadow, theme } from "./src/theme";

// The painted garden the whole tab shell sits on. It is full-bleed at the root
// — *outside* the SafeAreaView — so the status-bar inset is part of the scene
// rather than a strip of flat canvas above it. The board screen keeps its own
// warm gradient (the region pastels need a neutral page, see CLAUDE.md), so
// this is mounted only while the shell is up.
const PAGE_BG = require("./assets/home-bg.jpg");

// Hold the static native splash until the animated one has painted, so the
// launch reads as one continuous shot instead of a flash of empty canvas.
// (Failures are ignored — the splash auto-hiding early is cosmetic.)
NativeSplash.preventAutoHideAsync().catch(() => {});

export default function App() {
  const game = useGame();
  // The animated launch splash covers the shell until its beat finishes.
  const [splash, setSplash] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  // A board fills the screen while playing — HUD and tab bar are hidden.
  const [playing, setPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // --- Post-win reward flight -----------------------------------------------
  // Leaving a solved board flings its rewards from the Home Play button up into
  // the HUD: stars first, then coins into their own pill. Purely cosmetic —
  // both totals are already counted by the time this runs (the pills show the
  // new numbers throughout), so a flight can be dropped on any frame without
  // owing the player anything. Both endpoints are *measured* in window coords
  // rather than assumed: the path row's height moves with the screen size.
  const [flight, setFlight] = useState<{
    id: number;
    stars: number;
    coins: number;
    /** Which leg is in the air — coins wait for the stars to land. */
    leg: "stars" | "coins";
  } | null>(null);
  const [ctaPt, setCtaPt] = useState<Pt | null>(null);
  const [starPt, setStarPt] = useState<Pt | null>(null);
  const [coinPt, setCoinPt] = useState<Pt | null>(null);
  const starRef = useRef<View>(null);
  const coinRef = useRef<View>(null);
  const starPop = useRef(new Animated.Value(0)).current;
  const coinPop = useRef(new Animated.Value(0)).current;
  const pop = (v: Animated.Value) => () => {
    v.setValue(0);
    Animated.spring(v, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };
  // A pill's scale, driven by whichever reward is landing in it.
  const popStyle = (v: Animated.Value) => ({
    transform: [
      {
        scale: v.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 1.18, 1],
        }),
      },
    ],
  });

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

  // First paint has happened by the time this runs, so the animated splash is
  // already on screen behind the native one — hand over.
  useEffect(() => {
    NativeSplash.hideAsync().catch(() => {});
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
  const startLevel = (
    level: number = Math.min(game.unlockedLevel, LEVEL_COUNT),
  ) => {
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
    // The splash sits outside the SafeAreaView so it covers the status-bar
    // inset too — a launch animation letterboxed by a strip of page canvas
    // would give away the seam it exists to hide.
    <View style={styles.root}>
      {!playing && (
        <Image source={PAGE_BG} style={styles.pageBg} resizeMode="cover" />
      )}
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        {playing ? (
          <GameScreen
            game={game}
            onMenu={() => setPlaying(false)}
            onHome={() => {
              // Read the payout *before* leaving — the board's solve state goes
              // with it. Only a level pays stars; coins are paid in every mode,
              // and the chest rides in with them.
              const stars = game.mode === "level" ? game.solveStars ?? 0 : 0;
              const paid = game.coinsEarned + (game.milestone?.coins ?? 0);
              // Coins fly as a small flock, not one sprite per coin — 100 of
              // them would be a swarm, and the pill already shows the number.
              const coins = paid > 0 ? Math.min(6, 2 + Math.round(paid / 40)) : 0;
              setPlaying(false);
              setTab("home");
              if (stars > 0 || coins > 0)
                setFlight({
                  id: Date.now(),
                  stars,
                  coins,
                  leg: stars > 0 ? "stars" : "coins",
                });
            }}
          />
        ) : (
          <>
            {/* Global HUD: star wallet (jumps to Cards) · streak · settings. */}
            <View style={styles.hud}>
              {/* Each landing reward knocks its pill — the wallet has to react
                  or the flight looks like it passed through it. */}
              <Animated.View
                ref={starRef}
                onLayout={() =>
                  starRef.current?.measureInWindow((x, y, w, h) =>
                    setStarPt({ x: x + w / 2, y: y + h / 2 }),
                  )
                }
                style={popStyle(starPop)}
              >
                <Tappable onPress={() => setTab("cards")} style={styles.pill}>
                  <Ionicons name="star" size={15} color={theme.gold} />
                  <Text style={styles.pillTxt}>{game.totalStars}</Text>
                </Tappable>
              </Animated.View>
              {/* Coins. Gold here is a deliberate exception to "gold = stars,
                  rewards, rarity" — a coin *is* gold — so the wallet and the
                  star pill are told apart by glyph, not by colour. */}
              <Animated.View
                ref={coinRef}
                onLayout={() =>
                  coinRef.current?.measureInWindow((x, y, w, h) =>
                    setCoinPt({ x: x + w / 2, y: y + h / 2 }),
                  )
                }
                style={popStyle(coinPop)}
              >
                <View style={styles.pill}>
                  <Ionicons name="cash" size={15} color={theme.gold} />
                  <Text style={styles.pillTxt}>{game.coins}</Text>
                </View>
              </Animated.View>
              {game.dailyStreak > 0 && (
                <View style={styles.pill}>
                  <Ionicons name="flame" size={15} color={theme.danger} />
                  <Text style={styles.pillTxt}>{game.dailyStreak}</Text>
                </View>
              )}
              <View style={styles.hudSpacer} />
              <Tappable
                hitSlop={10}
                onPress={() => setShowSettings(true)}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                style={styles.settingsBtn}
              >
                <Ionicons name="settings-sharp" size={22} color={theme.textDim} />
              </Tappable>
            </View>

            <View style={styles.page}>
              {tab === "home" && (
                <HomeScreen
                  unlockedLevel={game.unlockedLevel}
                  allComplete={game.allComplete}
                  totalStars={game.totalStars}
                  resume={game.resume}
                  onResume={continueBoard}
                  onPlay={() => startLevel()}
                  onLevel={startLevel}
                  onEndless={(difficulty) => {
                    game.newEndless(difficulty);
                    setPlaying(true);
                  }}
                  onCards={() => setTab("cards")}
                  onCtaMeasure={setCtaPt}
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
      {/* Outside the SafeAreaView, like the splash: window coords in, window
          coords out. Each leg waits for its own endpoints — a flight fired
          before Home has laid out would start from nowhere — and the coins only
          launch once the stars have landed, so the two reads as one payout
          rather than a scramble. */}
      {flight && !playing && tab === "home" && ctaPt && (
        <>
          {flight.leg === "stars" && starPt && (
            <RewardFlight
              key={`${flight.id}-stars`}
              from={ctaPt}
              to={starPt}
              count={flight.stars}
              icon="star"
              onArrive={pop(starPop)}
              onDone={() =>
                setFlight((f) =>
                  f && f.coins > 0 ? { ...f, leg: "coins" } : null,
                )
              }
            />
          )}
          {flight.leg === "coins" && coinPt && (
            <RewardFlight
              key={`${flight.id}-coins`}
              from={ctaPt}
              to={coinPt}
              count={flight.coins}
              icon="cash"
              // Shorter run-up: the screen settled during the star leg (and on
              // a coins-only payout there were no stars to wait for anyway).
              delay={flight.stars > 0 ? 90 : undefined}
              onArrive={pop(coinPop)}
              onDone={() => setFlight(null)}
            />
          )}
        </>
      )}
      {splash && <SplashScreen onDone={() => setSplash(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  // Transparent so the page backdrop shows through; `root` keeps the flat
  // canvas underneath for the board screen (which paints its own).
  safe: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0,
  },
  pageBg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
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
