import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

import { nextCard, RARITY_COLORS, type PlantCard } from "../game/cards";
import { PLANT_SOURCES } from "../game/plants";
import { formatTime } from "../format";
import { radius, theme } from "../theme";
import { Button } from "./Button";
import { Confetti } from "./Confetti";

interface Props {
  level: number;
  seconds: number;
  hasNext: boolean;
  /** Set when a daily puzzle was solved — switches title/stats/actions. */
  daily?: { date: string; streak: number } | null;
  /** Set in endless mode — "Next level" becomes "New board". */
  endless?: boolean;
  /** Level-mode star rating for this solve (1..3) + the 3-star par time. */
  stars?: { earned: number; par: number } | null;
  /** Plant cards unlocked by this solve (level mode only). */
  newCards?: PlantCard[];
  /** Total stars across all levels — drives the next-card progress bar. */
  totalStars?: number;
  onShare?: () => void;
  onNext: () => void;
  onMenu: () => void;
}

export function WinOverlay({
  level,
  seconds,
  hasNext,
  daily,
  endless,
  stars,
  newCards = [],
  totalStars = 0,
  onShare,
  onNext,
  onMenu,
}: Props) {
  const wonCard = newCards[0] ?? null;
  // No card this solve, but level mode still tracks progress toward the next
  // one — null once the whole collection is unlocked.
  const upcoming = !wonCard && stars != null ? nextCard(totalStars) : null;
  const progress = upcoming ? Math.min(totalStars / upcoming.stars, 1) : 0;

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

  // The won card is the hero — it pops in a beat after the card settles, like
  // it's being drawn from a pack.
  const cardPop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!wonCard) return;
    Animated.spring(cardPop, {
      toValue: 1,
      delay: 400,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [wonCard, cardPop]);

  const fade = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const tag = daily
    ? `Daily · ${daily.date}`
    : endless
      ? "Endless"
      : `Level ${level}`;

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
        <Text style={styles.tag}>{tag}</Text>
        <Text style={styles.title}>Solved!</Text>

        {wonCard ? (
          <Animated.View
            style={[
              styles.hero,
              {
                opacity: cardPop,
                transform: [
                  {
                    scale: cardPop.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                  },
                  {
                    rotate: cardPop.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["-8deg", "0deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.heroFrameWrap}>
              <View
                style={[
                  styles.heroGlow,
                  { backgroundColor: RARITY_COLORS[wonCard.rarity] },
                ]}
              />
              <View
                style={[
                  styles.heroFrame,
                  { borderColor: RARITY_COLORS[wonCard.rarity] },
                ]}
              >
                <Image
                  source={PLANT_SOURCES[wonCard.plantId]}
                  style={styles.heroImg}
                />
              </View>
            </View>
            <Text style={[styles.heroTag, { color: RARITY_COLORS[wonCard.rarity] }]}>
              NEW CARD{newCards.length > 1 ? `  +${newCards.length - 1}` : ""}
            </Text>
            <Text style={styles.heroName}>{wonCard.name}</Text>
          </Animated.View>
        ) : upcoming ? (
          <View style={styles.progressWrap}>
            <View style={styles.heroFrameWrap}>
              <View style={[styles.heroFrame, styles.lockedFrame]}>
                <Image
                  source={PLANT_SOURCES[upcoming.plantId]}
                  style={[styles.heroImg, styles.lockedImg]}
                />
                <Text style={styles.lockedQ}>?</Text>
              </View>
            </View>
            <Text style={styles.lockedTag}>NEXT CARD</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.barLabel}>
              <Ionicons name="star" size={12} color={theme.gold} />
              {`  ${totalStars}/${upcoming.stars} to unlock`}
            </Text>
          </View>
        ) : (
          <Ionicons
            name="leaf"
            size={34}
            color={theme.accent}
            style={styles.icon}
          />
        )}

        {stars && (
          <View style={styles.stars}>
            {[1, 2, 3].map((i) => (
              <Ionicons
                key={i}
                name={i <= stars.earned ? "star" : "star-outline"}
                size={30}
                color={i <= stars.earned ? theme.gold : theme.panelLine}
              />
            ))}
          </View>
        )}
        {stars && stars.earned < 3 && (
          <Text style={styles.starHint}>
            3★ · no hints · under {formatTime(stars.par)}
          </Text>
        )}

        <View style={styles.chips}>
          <View style={styles.chip}>
            <Ionicons name="time-outline" size={14} color={theme.textDim} />
            <Text style={styles.chipTxt}>{formatTime(seconds)}</Text>
          </View>
          {daily && (
            <View style={styles.chip}>
              <Ionicons name="flame" size={14} color={theme.danger} />
              <Text style={styles.chipTxt}>{daily.streak}</Text>
            </View>
          )}
        </View>

        {!daily && !endless && !hasNext && (
          <Text style={styles.comingSoon}>More levels soon</Text>
        )}

        <View style={styles.actions}>
          <Button label="Menu" icon="menu" onPress={onMenu} flex />
          {daily ? (
            <Button
              label="Share"
              icon="share-outline"
              variant="solid"
              onPress={onShare ?? (() => {})}
              flex
            />
          ) : endless ? (
            <Button
              label="New board"
              icon="play"
              variant="solid"
              onPress={onNext}
              flex
            />
          ) : (
            hasNext && (
              <Button
                label="Next level"
                icon="play"
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
    maxWidth: 340,
    backgroundColor: theme.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.panelLine,
    paddingVertical: 22,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  tag: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 2,
  },
  icon: {
    marginTop: 12,
  },
  hero: {
    alignItems: "center",
    marginTop: 10,
  },
  heroFrameWrap: {
    width: 128,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlow: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    opacity: 0.3,
  },
  heroFrame: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panel,
    borderRadius: radius.md,
    borderWidth: 2.5,
  },
  heroImg: {
    width: 78,
    height: 78,
    resizeMode: "contain",
  },
  heroTag: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 10,
  },
  heroName: {
    color: theme.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 1,
  },
  progressWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 10,
  },
  lockedFrame: {
    borderColor: theme.panelLine,
  },
  lockedImg: {
    tintColor: theme.frame,
    opacity: 0.9,
  },
  lockedQ: {
    position: "absolute",
    color: theme.gold,
    fontSize: 30,
    fontWeight: "900",
  },
  lockedTag: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 10,
  },
  barTrack: {
    alignSelf: "stretch",
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.bg,
    marginTop: 10,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.gold,
  },
  barLabel: {
    color: theme.textDim,
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: 6,
  },
  stars: {
    flexDirection: "row",
    gap: 4,
    marginTop: 14,
  },
  starHint: {
    color: theme.textDim,
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipTxt: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  comingSoon: {
    color: theme.textDim,
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    alignSelf: "stretch",
  },
});
