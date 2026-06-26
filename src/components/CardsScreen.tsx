import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CARDS, nextCard, RARITY_COLORS, type PlantCard } from "../game/cards";
import { PLANT_SOURCES } from "../game/plants";
import { useBackHandler } from "../hooks/useBackHandler";
import { radius, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  totalStars: number;
}

function CardTile({
  card,
  unlocked,
  onPress,
}: {
  card: PlantCard;
  unlocked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tile,
        unlocked
          ? { borderColor: RARITY_COLORS[card.rarity] }
          : styles.tileLocked,
      ]}
    >
      <Image
        source={PLANT_SOURCES[card.plantId]}
        style={[styles.tileImg, !unlocked && styles.tileImgLocked]}
      />
      {unlocked ? (
        <>
          <Text style={styles.tileName} numberOfLines={1}>
            {card.name}
          </Text>
          <Text style={[styles.tileRarity, { color: RARITY_COLORS[card.rarity] }]}>
            {card.rarity.toUpperCase()}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.tileName}>???</Text>
          <Text style={styles.tileStars}>
            <Ionicons name="star" size={10} color={theme.gold} />
            {` ${card.stars}`}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Full-size inspect view of one card, trading-card style. */
function CardModal({
  card,
  totalStars,
  onClose,
}: {
  card: PlantCard;
  totalStars: number;
  onClose: () => void;
}) {
  const unlocked = totalStars >= card.stars;

  // Android back closes the inspect modal, not the tab.
  useBackHandler(() => {
    onClose();
    return true;
  });

  // Pop in with a little tilt, like drawing a card from the deck.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.backdrop,
        {
          opacity: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: "clamp",
          }),
        },
      ]}
    >
      {/* Tap outside the card to dismiss. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        style={[
          styles.bigCard,
          {
            borderColor: unlocked
              ? RARITY_COLORS[card.rarity]
              : theme.panelLine,
          },
          {
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
              },
              {
                rotate: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-6deg", "0deg"],
                }),
              },
            ],
          },
        ]}
      >
        <Text
          style={[
            styles.bigRarity,
            { color: unlocked ? RARITY_COLORS[card.rarity] : theme.textDim },
          ]}
        >
          {unlocked ? (
            card.rarity.toUpperCase()
          ) : (
            <>
              {"LOCKED · "}
              <Ionicons name="star" size={11} color={theme.textDim} />
              {` ${card.stars}`}
            </>
          )}
        </Text>

        <View style={styles.bigImgFrame}>
          <Image
            source={PLANT_SOURCES[card.plantId]}
            style={[styles.bigImg, !unlocked && styles.bigImgLocked]}
          />
          {!unlocked && <Text style={styles.bigQ}>?</Text>}
        </View>

        <Text style={styles.bigName}>{unlocked ? card.name : "???"}</Text>

        <Text style={styles.bigFlavor}>
          {unlocked ? (
            card.flavor
          ) : (
            <>
              {"Reach "}
              <Ionicons name="star" size={13} color={theme.gold} />
              {` ${card.stars} to add this plant to your collection — ${card.stars - totalStars} `}
              <Ionicons name="star" size={13} color={theme.gold} />
              {" to go."}
            </>
          )}
        </Text>

        <View style={styles.bigBtn}>
          <Button label="Close" variant="solid" onPress={onClose} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** Cards tab: the full plant-card collection, locked ones face-down. */
export function CardsScreen({ totalStars }: Props) {
  const [inspected, setInspected] = useState<PlantCard | null>(null);

  const collected = CARDS.filter((c) => totalStars >= c.stars).length;
  const upcoming = nextCard(totalStars);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Plant cards</Text>
      <Text style={styles.subtitle}>
        {collected}/{CARDS.length} collected ·{" "}
        <Ionicons name="star" size={13} color={theme.gold} />
        {` ${totalStars}`}
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {CARDS.map((c) => (
          <CardTile
            key={c.plantId}
            card={c}
            unlocked={totalStars >= c.stars}
            onPress={() => setInspected(c)}
          />
        ))}
      </ScrollView>

      <Text style={styles.footer}>
        {upcoming ? (
          <>
            {"Earn stars in levels to collect cards — next card at "}
            <Ionicons name="star" size={12} color={theme.gold} />
            {` ${upcoming.stars}.`}
          </>
        ) : (
          "Every plant collected. The garden is complete!"
        )}
      </Text>

      {inspected && (
        <CardModal
          card={inspected}
          totalStars={totalStars}
          onClose={() => setInspected(null)}
        />
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
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: theme.textDim,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: 380,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 8,
  },
  tile: {
    width: "30%",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: theme.panel,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  tileLocked: {
    backgroundColor: theme.bg,
    borderColor: theme.panelLine,
  },
  tileImg: {
    width: 46,
    height: 46,
    resizeMode: "contain",
  },
  tileImgLocked: {
    tintColor: theme.frame,
    opacity: 0.9,
  },
  tileName: {
    color: theme.text,
    fontSize: 12.5,
    fontWeight: "800",
    marginTop: 5,
  },
  tileRarity: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 1,
  },
  tileStars: {
    color: theme.gold,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 1,
  },
  footer: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(8,16,11,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  bigCard: {
    width: "100%",
    maxWidth: 280,
    alignItems: "center",
    backgroundColor: theme.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 2.5,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  bigRarity: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  bigImgFrame: {
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.panel,
    borderRadius: radius.md,
    marginTop: 12,
  },
  bigImg: {
    width: 120,
    height: 120,
    resizeMode: "contain",
  },
  bigImgLocked: {
    tintColor: theme.frame,
    opacity: 0.9,
  },
  bigQ: {
    position: "absolute",
    color: theme.gold,
    fontSize: 44,
    fontWeight: "900",
  },
  bigName: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 12,
  },
  bigFlavor: {
    color: theme.textDim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
    fontStyle: "italic",
  },
  bigBtn: {
    alignSelf: "stretch",
    marginTop: 16,
  },
});
