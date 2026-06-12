import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { dailyNumber, todayKey } from "../game/daily";
import { formatTime } from "../format";
import { radius, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  dailyDone: boolean;
  dailyStreak: number;
  /** dateKey -> best seconds for every daily ever solved. */
  dailyLog: Record<string, number>;
  onPlay: () => void;
}

const HISTORY_MAX = 14;

/** Daily tab: today's puzzle, the streak, and recent solve history. */
export function DailyScreen({ dailyDone, dailyStreak, dailyLog, onPlay }: Props) {
  const tk = todayKey();
  const history = Object.keys(dailyLog)
    .sort()
    .reverse()
    .slice(0, HISTORY_MAX);

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>🌞</Text>
        <Text style={styles.heroTitle}>Daily puzzle #{dailyNumber(tk)}</Text>
        <Text style={styles.heroSub}>
          {dailyDone
            ? `✓ Solved today — ${formatTime(dailyLog[tk])}`
            : "One shared board for everyone. New at midnight."}
        </Text>
        <View style={styles.heroBtn}>
          <Button
            label={dailyDone ? "Replay for a better time" : "Play today's puzzle"}
            icon="▶"
            variant="solid"
            onPress={onPlay}
          />
        </View>
      </View>

      <View style={styles.streak}>
        <Text style={styles.streakFlame}>🔥</Text>
        <View>
          <Text style={styles.streakVal}>
            {dailyStreak > 0
              ? `${dailyStreak} day streak`
              : "No streak yet"}
          </Text>
          <Text style={styles.streakSub}>
            {dailyDone
              ? "Come back tomorrow to keep it going!"
              : dailyStreak > 0
                ? "Solve today's puzzle to keep it alive!"
                : "Solve today's puzzle to start one."}
          </Text>
        </View>
      </View>

      <Text style={styles.section}>HISTORY</Text>
      {history.length === 0 ? (
        <Text style={styles.empty}>
          Solved dailies will show up here with their times.
        </Text>
      ) : (
        <ScrollView style={styles.history}>
          {history.map((key) => (
            <View key={key} style={styles.row}>
              <Text style={styles.rowNum}>#{dailyNumber(key)}</Text>
              <Text style={styles.rowDate}>
                {key}
                {key === tk ? "  · today" : ""}
              </Text>
              <Text style={styles.rowTime}>{formatTime(dailyLog[key])}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  hero: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  heroEmoji: {
    fontSize: 38,
  },
  heroTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 4,
  },
  heroSub: {
    color: theme.textDim,
    fontSize: 13.5,
    marginTop: 3,
    textAlign: "center",
  },
  heroBtn: {
    alignSelf: "stretch",
    marginTop: 14,
  },
  streak: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  streakFlame: {
    fontSize: 26,
  },
  streakVal: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  streakSub: {
    color: theme.textDim,
    fontSize: 12.5,
    marginTop: 1,
  },
  section: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    color: theme.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 6,
  },
  empty: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    color: theme.textDim,
    fontSize: 13.5,
  },
  history: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.panelLine,
  },
  rowNum: {
    color: theme.gold,
    fontSize: 14,
    fontWeight: "900",
    width: 44,
  },
  rowDate: {
    flex: 1,
    color: theme.textDim,
    fontSize: 13.5,
  },
  rowTime: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
