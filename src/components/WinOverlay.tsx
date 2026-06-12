import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

import { RARITY_COLORS, type PlantCard } from "../game/cards";
import { PLANT_SOURCES } from "../game/plants";
import { formatTime } from "../format";
import { radius, theme } from "../theme";
import { Button } from "./Button";
import { Confetti } from "./Confetti";

interface Props {
  level: number;
  seconds: number;
  bestSeconds?: number;
  isNewBest: boolean;
  hasNext: boolean;
  /** Set when a daily puzzle was solved — switches title/stats/actions. */
  daily?: { number: number; streak: number } | null;
  /** Set in endless mode — "Next level" becomes "New board". */
  endless?: boolean;
  /** Level-mode star rating for this solve (1..3) + the 3-star par time. */
  stars?: { earned: number; par: number } | null;
  /** Plant cards unlocked by this solve (level mode only). */
  newCards?: PlantCard[];
  /** Stars still needed for the next card, or null when all are collected. */
  nextCardIn?: number | null;
  onShare?: () => void;
  onNext: () => void;
  onMenu: () => void;
}

export function WinOverlay({
  level,
  seconds,
  bestSeconds,
  isNewBest,
  hasNext,
  daily,
  endless,
  stars,
  newCards = [],
  nextCardIn,
  onShare,
  onNext,
  onMenu,
}: Props) {
  // Springy entrance: backdrop fades while the card scales up with overshoot.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // "New best" badge pulses for that arcade-y reward feel.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isNewBest) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isNewBest, pulse]);

  // New-card reveal pops in after the main card settles.
  const cardPop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (newCards.length === 0) return;
    Animated.spring(cardPop, {
      toValue: 1,
      delay: 450,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [newCards.length, cardPop]);

  const fade = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade }]}>
      <Confetti />
      <Animated.View
        style={[
          styles.card,
          {
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.emoji}>{isNewBest ? "🏆" : "🌱"}</Text>
        <Text style={styles.title}>
          {daily
            ? `Daily #${daily.number} solved!`
            : endless
              ? "Board solved!"
              : `Level ${level} solved!`}
        </Text>

        {stars && (
          <>
            <Text style={styles.stars}>
              {[1, 2, 3].map((i) => (
                <Text
                  key={i}
                  style={i <= stars.earned ? styles.starOn : styles.starOff}
                >
                  ★
                </Text>
              ))}
            </Text>
            {stars.earned < 3 && (
              <Text style={styles.starHint}>
                3★ = no hints &amp; under {formatTime(stars.par)}
              </Text>
            )}
          </>
        )}

        {newCards.length > 0 ? (
          <Animated.View
            style={[
              styles.newCard,
              { borderColor: RARITY_COLORS[newCards[0].rarity] },
              {
                opacity: cardPop,
                transform: [
                  {
                    scale: cardPop.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Image
              source={PLANT_SOURCES[newCards[0].plantId]}
              style={styles.newCardImg}
            />
            <View>
              <Text
                style={[
                  styles.newCardTag,
                  { color: RARITY_COLORS[newCards[0].rarity] },
                ]}
              >
                NEW CARD{newCards.length > 1 ? ` +${newCards.length - 1}` : ""}
              </Text>
              <Text style={styles.newCardName}>{newCards[0].name}</Text>
            </View>
          </Animated.View>
        ) : (
          stars != null &&
          nextCardIn != null && (
            <Text style={styles.nextCard}>
              🃏 {nextCardIn}★ more until your next plant card
            </Text>
          )
        )}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={styles.statVal}>{formatTime(seconds)}</Text>
          </View>
          <View style={styles.stat}>
            {daily ? (
              <>
                <Text style={styles.statLabel}>STREAK</Text>
                <Text style={styles.statVal}>🔥 {daily.streak}</Text>
              </>
            ) : (
              <>
                <Text style={styles.statLabel}>BEST</Text>
                <Text style={styles.statVal}>{formatTime(bestSeconds)}</Text>
              </>
            )}
          </View>
        </View>

        {isNewBest && (
          <Animated.Text
            style={[
              styles.newBest,
              {
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.1],
                    }),
                  },
                ],
              },
            ]}
          >
            ★ New best time!
          </Animated.Text>
        )}

        {!daily && !endless && !hasNext && (
          <Text style={styles.comingSoon}>More levels coming soon 🌻</Text>
        )}

        <View style={styles.actions}>
          <Button label="Menu" icon="☰" onPress={onMenu} flex />
          {daily ? (
            <Button
              label="Share"
              icon="📤"
              variant="solid"
              onPress={onShare ?? (() => {})}
              flex
            />
          ) : endless ? (
            <Button
              label="New board"
              icon="▶"
              variant="solid"
              onPress={onNext}
              flex
            />
          ) : (
            hasNext && (
              <Button
                label="Next level"
                icon="▶"
                variant="solid"
                onPress={onNext}
                flex
              />
            )
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(8,16,11,0.74)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.panelLine,
    padding: 24,
    alignItems: "center",
  },
  emoji: {
    fontSize: 44,
  },
  title: {
    color: theme.text,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 4,
  },
  stars: {
    fontSize: 34,
    marginTop: 8,
    letterSpacing: 6,
  },
  starOn: {
    color: theme.gold,
  },
  starOff: {
    color: theme.panelLine,
  },
  starHint: {
    color: theme.textDim,
    fontSize: 12.5,
    marginTop: 2,
  },
  newCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: theme.panel,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  newCardImg: {
    width: 40,
    height: 40,
    resizeMode: "contain",
  },
  newCardTag: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  newCardName: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
  },
  nextCard: {
    color: theme.textDim,
    fontSize: 12.5,
    marginTop: 10,
  },
  stats: {
    flexDirection: "row",
    gap: 32,
    marginTop: 18,
  },
  stat: {
    alignItems: "center",
  },
  statLabel: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  statVal: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "800",
    marginTop: 2,
  },
  newBest: {
    color: theme.gold,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 14,
  },
  comingSoon: {
    color: theme.textDim,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    alignSelf: "stretch",
  },
});
