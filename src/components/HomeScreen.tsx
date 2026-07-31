import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { nextCard, type PlantCard } from "../game/cards";
// The chest levels and their payout come from the economy module, so the chest
// the player is shown is always the chest that actually pays.
import { MILESTONE_COINS, MILESTONE_EVERY } from "../game/economy";
import { PLANT_SOURCES } from "../game/plants";
import { LEVEL_COUNT } from "../game/levels";
import type { Difficulty } from "../game/types";
import { formatDateKey, formatTime } from "../format";
import { radius, shadow, space, theme, typography } from "../theme";
import { Tappable } from "./Tappable";

// The plants in the wordmark's garden bed (and, faded, behind the Endless
// lock). Purely decorative, picked for contrasting silhouettes and hues at
// ~50pt. Filtered through PLANT_SOURCES so a renamed/dropped id (the art
// rebuild binned three of the originals, which just rendered as gaps) can
// never silently thin the bed out again.
const DECO_PLANTS = ["sunflower", "toadstool", "tulip", "monstera", "lavender"]
  .filter((id) => PLANT_SOURCES[id]);

/** Sprites that grow alongside the path, one per solved/current node. */
const PATH_PLANTS = ["sprout", "sunflower", "clover", "tulip", "daisy", "fern"]
  .filter((id) => PLANT_SOURCES[id]);

/** The saved mid-solve board behind the Continue button (see useGame.resume). */
export interface ResumeInfo {
  mode: "level" | "daily" | "endless";
  level: number;
  dailyKey: string | null;
  difficulty: Difficulty | null;
  placed: number;
  size: number;
  seconds: number;
  hearts: number;
}

interface Props {
  unlockedLevel: number;
  allComplete: boolean;
  totalStars: number;
  /** An unfinished board waiting to be picked up, if there is one. */
  resume: ResumeInfo | null;
  onResume: () => void;
  onPlay: () => void;
  /** Tap a node on the path — replay a solved level or start the current one. */
  onLevel: (level: number) => void;
  onEndless: (difficulty: Difficulty) => void;
  /** Jump to the Cards tab (showcase panel tap-through). */
  onCards: () => void;
  /**
   * Centre of the primary button in *window* coords, reported on layout. App
   * uses it as the launch point of the post-win star flight — measured rather
   * than assumed, since this row's height moves with the screen size.
   */
  onCtaMeasure?: (p: { x: number; y: number }) => void;
}

const ENDLESS_CHIPS: { difficulty: Difficulty; label: string }[] = [
  { difficulty: "easy", label: "Easy" },
  { difficulty: "medium", label: "Medium" },
  { difficulty: "hard", label: "Hard" },
];

// Play button "3D" bottom-edge height (matches the Button treatment).
const EDGE = 5;

// Endless mode stays locked until the player has reached this level.
const ENDLESS_UNLOCK_LEVEL = 15;

// ---------------------------------------------------------------------------
// Level path geometry. **Home never scrolls** — everything from the wordmark to
// the Endless row has to fit one screen, on a 4" phone as well as a tall one.
// So the path is the only elastic thing on the page: it takes `flex: 1`,
// measures what it was actually given (`onLayout`) and derives its row height
// and disc size from that, clamped. Everything else is deliberately compact.
// Nothing here may be a fixed height that assumes a screen size.
// ---------------------------------------------------------------------------
/** Levels visible at once: where the player is, and where they're going. */
const PATH_WINDOW = 2;
const STEM_W = 6;
/** Row-height bounds the measured path is clamped into. */
const ROW_MIN = 56;
const ROW_MAX = 118;
/** Disc bounds; the disc is the row minus breathing room. */
const NODE_MIN = 42;
const NODE_MAX = 68;
/** Break between the window's top level and the dangling milestone teaser. */
const GAP_H = 12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Springs children up + in, staggered by `delay` ms. */
function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(t, {
      toValue: 1,
      delay,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        opacity: t.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
          extrapolate: "clamp",
        }),
        transform: [
          {
            translateY: t.interpolate({
              inputRange: [0, 1],
              outputRange: [24, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** What the Continue button calls the board it saved. */
function resumeLabel(r: ResumeInfo): string {
  if (r.mode === "daily") {
    return r.dailyKey ? `Daily ${formatDateKey(r.dailyKey)}` : "Daily puzzle";
  }
  if (r.mode === "endless") {
    return `Endless · ${r.difficulty ? DIFF_LABEL[r.difficulty] : ""}`.trim();
  }
  return `Level ${r.level}`;
}

type NodeState = "done" | "current" | "locked";

interface PathNode {
  level: number;
  state: NodeState;
  milestone: boolean;
  /** A gap in the ladder sits above this node (the teaser milestone). */
  gapAbove: boolean;
}

/**
 * The window of levels the path shows, **top of the screen = highest level**
 * (the ladder is climbed upward): where the player is and where they're going.
 * At the top of the ladder there is nothing above, so it falls back to the
 * level just cleared. The next milestone is appended above the window as a
 * teaser — that dangling chest is the whole point of a path map.
 */
function pathNodes(unlockedLevel: number): PathNode[] {
  const current = Math.min(unlockedLevel, LEVEL_COUNT);
  const end = Math.min(LEVEL_COUNT, current + PATH_WINDOW - 1);
  const start = Math.max(1, end - PATH_WINDOW + 1);

  const nodes: PathNode[] = [];
  for (let level = end; level >= start; level--) {
    nodes.push({
      level,
      state:
        level < unlockedLevel ? "done" : level === unlockedLevel ? "current" : "locked",
      milestone: level % MILESTONE_EVERY === 0,
      gapAbove: false,
    });
  }

  // The teaser: the next chest above the window, if there is one.
  const teaser = (Math.floor(end / MILESTONE_EVERY) + 1) * MILESTONE_EVERY;
  if (teaser <= LEVEL_COUNT) {
    nodes.unshift({
      level: teaser,
      state: teaser < unlockedLevel ? "done" : "locked",
      milestone: true,
      gapAbove: false,
    });
    nodes[1].gapAbove = true;
  }
  return nodes;
}

/** One stop on the ladder: the disc, its status badge and its side callouts. */
function LevelNode({
  node,
  size,
  rowH,
  pulse,
  reward,
  totalStars,
  onPress,
  onReward,
}: {
  node: PathNode;
  /** Disc diameter, derived from the height the path was actually given. */
  size: number;
  rowH: number;
  pulse: Animated.Value;
  /** The card being chased — shown beside the current level only. */
  reward: PlantCard | null;
  totalStars: number;
  onPress: () => void;
  onReward: () => void;
}) {
  const { level, state, milestone } = node;
  const playable = state !== "locked";
  // The chest and its blurb are a *promise*, so they only ride a milestone the
  // player hasn't reached — once it's the current level (or behind them) the
  // node goes back to normal status dressing, keeping its gold ring.
  const teasing = milestone && state === "locked";
  // The current level's plant IS the next card (see One plant per board), so
  // standing it beside that node says "this is what you're growing" — which is
  // the job the Next-unlocks panel used to do, without a panel.
  const showReward = state === "current" && reward != null;
  const deco = state === "done" ? PATH_PLANTS[level % PATH_PLANTS.length] : null;

  return (
    <View style={[styles.row, { height: rowH }]}>
      {/* Left gutter: the card being chased, a plant already grown here, or
          the milestone's blurb. */}
      <View style={styles.gutterLeft}>
        {teasing ? (
          // Name the actual prize: "a rare reward" is a promise the player
          // can't act on, and the chest now pays a real, known amount.
          <View style={styles.callout}>
            <View style={styles.calloutHead}>
              <Ionicons name="gift" size={13} color={theme.gold} />
              <Text style={styles.calloutTitle}>Milestone</Text>
            </View>
            <Text style={styles.calloutSub}>
              {`Reach level ${level}\nfor ${MILESTONE_COINS} coins!`}
            </Text>
          </View>
        ) : showReward && reward ? (
          <Tappable onPress={onReward} style={styles.reward}>
            <Image
              source={PLANT_SOURCES[reward.plantId]}
              style={[styles.pathPlant, { width: size, height: size }]}
            />
            <Text style={styles.rewardName} numberOfLines={1}>
              {reward.name}
            </Text>
            <View style={styles.rewardStars}>
              <Ionicons name="star" size={11} color={theme.gold} />
              <Text style={styles.rewardStarsTxt}>
                {totalStars}/{reward.stars}
              </Text>
            </View>
          </Tappable>
        ) : deco ? (
          <Image
            source={PLANT_SOURCES[deco]}
            style={[styles.pathPlant, { width: size - 8, height: size - 8 }]}
          />
        ) : null}
      </View>

      <Tappable
        disabled={!playable}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Level ${level}${
          state === "locked" ? ", locked" : state === "done" ? ", completed" : ""
        }`}
        style={{ width: size, height: size }}
      >
        {({ pressed }) => (
          <Animated.View
            style={[
              styles.node,
              { width: size, height: size, borderRadius: size / 2 },
              milestone && styles.nodeMilestone,
              state === "done" && styles.nodeDone,
              state === "current" && styles.nodeCurrent,
              state === "locked" && !milestone && styles.nodeLocked,
              pressed && playable && styles.nodePressed,
              state === "current" && {
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.06],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text
              style={[
                styles.nodeNum,
                { fontSize: size * 0.4 },
                state === "locked" && !milestone && styles.nodeNumLocked,
              ]}
            >
              {level}
            </Text>
          </Animated.View>
        )}
      </Tappable>

      {/* Right gutter: status badge, plus the "you are here" flag. */}
      <View style={styles.gutterRight}>
        {teasing ? (
          <View style={styles.chest}>
            <Ionicons name="gift" size={24} color={theme.gold} />
          </View>
        ) : state === "done" ? (
          <View style={styles.badgeDone}>
            <Ionicons name="checkmark" size={16} color={theme.onAccent} />
          </View>
        ) : state === "locked" ? (
          <View style={styles.badgeLocked}>
            <Ionicons name="lock-closed" size={14} color={theme.textDim} />
          </View>
        ) : null}

        {state === "current" && (
          <View style={styles.flag}>
            <View style={styles.flagPoint} />
            <Text style={styles.flagTitle}>Current level</Text>
            <Text style={styles.flagSub}>Keep planting!</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function HomeScreen({
  unlockedLevel,
  allComplete,
  totalStars,
  resume,
  onResume,
  onPlay,
  onLevel,
  onEndless,
  onCards,
  onCtaMeasure,
}: Props) {
  // The card being chased — and, by design, the species growing on the board
  // right now. Null once the collection is complete.
  const reward = nextCard(totalStars);
  const current = Math.min(unlockedLevel, LEVEL_COUNT);
  const nodes = pathNodes(unlockedLevel);
  const unlocked = unlockedLevel >= ENDLESS_UNLOCK_LEVEL;

  // The Endless difficulty popover — closed by default, so the row stays two
  // buttons wide until the player actually asks for the mode.
  const [endlessOpen, setEndlessOpen] = useState(false);

  // Where the star flight takes off from. Measured in *window* coords (the
  // flight layer is mounted at the app root), on every layout of the button.
  const ctaRef = useRef<View>(null);
  const measureCta = () =>
    ctaRef.current?.measureInWindow((x, y, w, h) =>
      onCtaMeasure?.({ x: x + w / 2, y: y + h / 2 }),
    );

  // A short screen (SE-class phones) can't carry the full wordmark *and* a
  // readable path without scrolling, and the path is what the screen is for —
  // so the branding drops to a plain title and the panels lose their headers.
  const compact = useWindowDimensions().height < 720;

  // Home never scrolls, so the path is sized from the space left over after
  // everything else has taken its (compact, fixed) share — see the geometry
  // block above. `pathH` is 0 for exactly one frame; the fallback keeps that
  // frame from collapsing, and Rise is still fading the map in when it lands.
  const [pathH, setPathH] = useState(0);
  const gapH = nodes.some((n) => n.gapAbove) ? GAP_H : 0;
  const rowH = clamp(
    ((pathH || ROW_MAX * nodes.length + gapH) - gapH) / nodes.length,
    ROW_MIN,
    ROW_MAX,
  );
  const nodeSize = clamp(rowH - 24, NODE_MIN, NODE_MAX);

  // Idle "breathing" pulse, shared by the primary CTA and the current node —
  // one heartbeat, so the eye is led from the map straight to the button.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.wrap}>
      {/* Wordmark on a planted bed: the sprites overlap and sit *in* a mound
          of soil instead of floating as a detached row of icons. */}
      <Rise delay={0}>
        {!compact && (
          <View style={styles.logo}>
            <View style={styles.bed}>
              {DECO_PLANTS.map((id, i) => (
                <Image
                  key={id}
                  source={PLANT_SOURCES[id]}
                  style={[
                    styles.bedPlant,
                    {
                      // Staggered heights + slight lean, so the bed reads as
                      // planted rather than as a row of stamps.
                      marginBottom: i % 2 === 0 ? 6 : 0,
                      transform: [{ rotate: `${(i - 2) * 4}deg` }],
                      zIndex: i % 2 === 0 ? 2 : 1,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.mound} />
          </View>
        )}
        <Text style={[styles.title, compact && styles.titleCompact]}>
          Plantdoku
        </Text>
      </Rise>

      {/* The level path: the screen's centrepiece, and the only elastic thing
          on the page. Highest level at the top, so the ladder is climbed
          upward and the level just cleared sits underfoot. */}
      <View
        style={styles.pathRegion}
        onLayout={(e) => setPathH(e.nativeEvent.layout.height)}
      >
        <Rise delay={180}>
          <View style={styles.path}>
            {/* The vine the nodes are threaded on. It runs centre-to-centre,
                so its ends are always hidden behind the first/last disc. */}
            <View
              pointerEvents="none"
              style={[styles.stemWrap, { top: rowH / 2, bottom: rowH / 2 }]}
            >
              <View style={styles.stem} />
            </View>
            {nodes.map((node) => (
              <View key={node.level}>
                {node.gapAbove && <View style={styles.gap} />}
                <LevelNode
                  node={node}
                  size={nodeSize}
                  rowH={rowH}
                  pulse={pulse}
                  reward={reward}
                  totalStars={totalStars}
                  onPress={() => onLevel(node.level)}
                  onReward={onCards}
                />
              </View>
            ))}
          </View>
        </Rise>
      </View>

      {/* ONE primary action: a saved board *is* the button, with its progress
          on the face, rather than a second card competing for the same tap.
          Play and Endless share one row at 3:1. Endless is a *quarter*, in the
          cream key rather than green, so the screen still has exactly one
          primary action — it is a door, not a peer. The row always renders, so
          finishing the ladder can't take Endless away with it. */}
      <Rise delay={260}>
        <View style={styles.ctaRow}>
          {allComplete && !resume ? (
            <View
              ref={ctaRef}
              onLayout={measureCta}
              style={[styles.ctaMain, styles.doneCard]}
            >
              <Ionicons name="trophy" size={28} color={theme.gold} />
              <Text style={styles.doneTitle}>All levels complete!</Text>
              <Text style={styles.doneSub}>More levels coming soon.</Text>
            </View>
          ) : (
            <Animated.View
              ref={ctaRef}
              onLayout={measureCta}
              style={[
                styles.ctaMain,
                {
                  transform: [
                    {
                      scale: pulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.02],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Tappable
                onPress={resume ? onResume : onPlay}
                accessibilityRole="button"
                style={styles.playEdge}
              >
                {({ pressed }) => (
                  <View style={[styles.play, pressed && styles.playPressed]}>
                    <View style={styles.playRow}>
                      <Ionicons name="leaf" size={22} color={theme.onAccent} />
                      <Text style={styles.playLabel} numberOfLines={1}>
                        {resume ? `Continue ${resumeLabel(resume)}` : `Play level ${current}`}
                      </Text>
                    </View>
                    <Text style={styles.playSub} numberOfLines={1}>
                      {resume
                        ? `${resume.placed}/${resume.size} planted · ${formatTime(
                            resume.seconds,
                          )} elapsed`
                        : `Level ${current} of ${LEVEL_COUNT}`}
                    </Text>
                  </View>
                )}
              </Tappable>
            </Animated.View>
          )}

          <View style={styles.ctaSide}>
            {/* The three difficulties don't fit a quarter, so they lift out as
                a small popover above it rather than living on the page — which
                is the clutter this row exists to remove. */}
            {endlessOpen && unlocked && (
              <View style={styles.endlessPop}>
                {ENDLESS_CHIPS.map(({ difficulty, label }) => (
                  <Tappable
                    key={difficulty}
                    onPress={() => {
                      setEndlessOpen(false);
                      onEndless(difficulty);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text style={styles.chipTxt}>{label}</Text>
                  </Tappable>
                ))}
              </View>
            )}
            <Tappable
              disabled={!unlocked}
              onPress={() => setEndlessOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                unlocked
                  ? "Endless garden"
                  : `Endless garden, unlocks at level ${ENDLESS_UNLOCK_LEVEL}`
              }
              style={styles.endlessEdge}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.endless,
                    pressed && unlocked && styles.playPressed,
                    !unlocked && styles.endlessLocked,
                  ]}
                >
                  <Ionicons
                    name={unlocked ? "infinite" : "lock-closed"}
                    size={22}
                    color={unlocked ? theme.accentDark : theme.textDim}
                  />
                  <Text
                    style={[
                      styles.endlessTxt,
                      !unlocked && styles.endlessTxtLocked,
                    ]}
                    numberOfLines={1}
                  >
                    {unlocked
                      ? "Endless"
                      : `${Math.min(unlockedLevel, ENDLESS_UNLOCK_LEVEL)}/${ENDLESS_UNLOCK_LEVEL}`}
                  </Text>
                </View>
              )}
            </Tappable>
          </View>
        </View>
      </Rise>

      {/* The one case where a second entry point earns its place: the saved
          board is a daily or an endless run, so the level ladder would
          otherwise be unreachable from this screen. Deliberately a quiet
          link, not a peer of the button above. */}
      {resume && resume.mode !== "level" && !allComplete && (
        <Rise delay={300}>
          <Tappable onPress={onPlay} hitSlop={6} style={styles.altLink}>
            <Text style={styles.altLinkTxt}>
              {`Play level ${current} of ${LEVEL_COUNT}`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textDim} />
          </Tappable>
        </Rise>
      )}

    </View>
  );
}

const CARD_W = { alignSelf: "center" as const, width: "100%" as const, maxWidth: 380 };

// Cards sit on a photographic garden backdrop now, so they are a warm white
// *veil* rather than flat panel white — the illustration stays faintly visible
// through them, which is what keeps the screen reading as one scene.
const VEIL = "rgba(255,252,242,0.93)";

const styles = StyleSheet.create({
  // A fixed column, never a ScrollView: everything has to be reachable without
  // a scroll, so the path (`pathRegion`) absorbs whatever height is left.
  wrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: space(2),
    paddingBottom: space(2),
  },
  logo: {
    alignItems: "center",
    marginBottom: space(1),
  },
  bed: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  bedPlant: {
    width: 52,
    height: 52,
    marginHorizontal: -6,
    resizeMode: "contain",
  },
  // The soil the plants stand in — ties the sprites into one object.
  mound: {
    width: 176,
    height: 13,
    marginTop: -5,
    borderRadius: 6.5,
    backgroundColor: theme.soil,
    opacity: 0.85,
  },
  title: {
    ...typography.screenTitle,
    color: theme.text,
    textAlign: "center",
    marginBottom: space(3),
  },
  titleCompact: {
    fontSize: 28,
    marginBottom: space(2),
  },


  // ---- level path ---------------------------------------------------------
  // The elastic region. `minHeight: 0` lets it actually give ground on a short
  // screen instead of pushing the button and the panels off the bottom.
  pathRegion: {
    flex: 1,
    minHeight: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
  path: {
    ...CARD_W,
  },
  stemWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  stem: {
    flex: 1,
    width: STEM_W,
    borderRadius: STEM_W / 2,
    backgroundColor: theme.accent,
    opacity: 0.55,
  },
  // The break between the window's top level and the dangling milestone —
  // "there is more ladder up there than fits on this screen".
  gap: {
    height: GAP_H,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  gutterLeft: {
    flex: 1,
    alignItems: "flex-end",
    paddingRight: space(3),
  },
  gutterRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space(2),
    gap: space(2),
  },
  pathPlant: {
    resizeMode: "contain",
  },
  // The card being chased, standing in the current level's gutter. No card
  // frame or panel: it is a plant growing beside the path, and the ★ line is
  // the only thing that says it's a collectible.
  reward: {
    alignItems: "center",
    maxWidth: "100%",
  },
  rewardName: {
    ...typography.caption,
    fontSize: 12.5,
    color: theme.text,
    marginTop: -2,
  },
  rewardStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 1,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: VEIL,
  },
  rewardStarsTxt: {
    ...typography.caption,
    fontSize: 11,
    color: theme.textDim,
    fontVariant: ["tabular-nums"],
  },
  node: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: theme.panel,
    backgroundColor: theme.panel,
    ...shadow.card,
  },
  nodeDone: {
    backgroundColor: theme.accent,
  },
  // The one node the player is meant to tap: brighter fill, gold ring, pulse.
  nodeCurrent: {
    backgroundColor: theme.accent,
    borderColor: theme.gold,
    ...shadow.raised,
  },
  nodeLocked: {
    backgroundColor: "#E6EADF",
  },
  nodeMilestone: {
    backgroundColor: theme.gold,
    borderColor: "#FFE9AE",
  },
  nodePressed: {
    opacity: 0.82,
  },
  nodeNum: {
    fontWeight: "900",
    color: theme.panel,
  },
  nodeNumLocked: {
    color: theme.textDim,
  },
  badgeDone: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
    borderWidth: 2,
    borderColor: theme.panel,
  },
  badgeLocked: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6EADF",
    borderWidth: 2,
    borderColor: theme.panel,
  },
  chest: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: VEIL,
    borderWidth: 1.5,
    borderColor: theme.gold,
    ...shadow.card,
  },
  // "You are here" — a pointed flag rather than a card, so it reads as an
  // annotation on the map instead of one more panel.
  flag: {
    flexShrink: 1,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    backgroundColor: VEIL,
    borderRadius: radius.chip,
    ...shadow.card,
  },
  flagPoint: {
    position: "absolute",
    left: -5,
    top: "50%",
    marginTop: -5,
    width: 10,
    height: 10,
    backgroundColor: VEIL,
    transform: [{ rotate: "45deg" }],
  },
  flagTitle: {
    ...typography.caption,
    fontSize: 14,
    fontWeight: "900",
    color: theme.accentDark,
  },
  flagSub: {
    ...typography.caption,
    fontSize: 12,
    color: theme.textDim,
    marginTop: 1,
  },
  callout: {
    flexShrink: 1,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    backgroundColor: VEIL,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  calloutHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  calloutTitle: {
    ...typography.caption,
    fontWeight: "900",
    color: theme.text,
  },
  calloutSub: {
    ...typography.caption,
    fontSize: 12,
    color: theme.textDim,
    marginTop: 2,
  },

  // ---- primary action -----------------------------------------------------
  // Play : Endless = 3 : 1. Endless is a quarter and stays cream, so the row
  // reads as one primary action with a door beside it.
  ctaRow: {
    ...CARD_W,
    flexDirection: "row",
    alignItems: "stretch",
    gap: space(2),
    marginTop: space(2),
  },
  // `flex: n` in RN is grow n / shrink 1 / **basis 0**, so these are a true 3:1
  // split of the row's width and the Play label can't widen its own column.
  ctaMain: {
    flex: 3,
  },
  ctaSide: {
    flex: 1,
  },
  // NOT `flex: 1`. `ctaMain` is an auto-height column, and a flex child of an
  // auto-height parent resolves to zero — the button then overflowed its own
  // collapsed row and drew on top of the Next-unlocks card below it. Play is
  // content-sized, and it is what gives the row its height; the Endless side
  // stretches to match (see `endlessEdge`).
  playEdge: {
    alignSelf: "stretch",
    borderRadius: radius.btn,
    backgroundColor: theme.accentDark,
    ...shadow.raised,
  },
  play: {
    alignItems: "center",
    backgroundColor: theme.accent,
    paddingVertical: space(3),
    borderRadius: radius.btn,
    marginBottom: EDGE,
  },
  playPressed: {
    marginTop: EDGE,
    marginBottom: 0,
  },
  playRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
  },
  playLabel: {
    flexShrink: 1,
    color: theme.onAccent,
    fontSize: 21,
    fontWeight: "900",
  },
  playSub: {
    ...typography.caption,
    color: theme.onAccent,
    opacity: 0.8,
    marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
  altLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: space(2),
    paddingVertical: space(2),
  },
  altLinkTxt: {
    ...typography.caption,
    color: theme.textDim,
  },
  doneCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: VEIL,
    borderRadius: radius.lg,
    paddingVertical: space(3),
    ...shadow.card,
  },
  doneTitle: {
    ...typography.cardTitle,
    fontSize: 17,
    color: theme.text,
    marginTop: space(1),
  },
  doneSub: {
    ...typography.caption,
    color: theme.textDim,
    marginTop: 2,
  },

  // ---- endless (the quarter beside Play) ----------------------------------
  // `flex: 1` is safe here, unlike on `playEdge`: `ctaSide` has no explicit
  // height, so the row's `alignItems: "stretch"` gives it Play's height, and
  // this then fills it — which is what keeps the two buttons the same size.
  endlessEdge: {
    flex: 1,
    borderRadius: radius.btn,
    backgroundColor: theme.panelEdge,
    ...shadow.card,
  },
  endless: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: VEIL,
    borderRadius: radius.btn,
    marginBottom: EDGE,
  },
  endlessLocked: {
    backgroundColor: "rgba(240,244,232,0.93)",
  },
  endlessTxt: {
    ...typography.caption,
    fontSize: 12,
    color: theme.accentDark,
    fontVariant: ["tabular-nums"],
  },
  endlessTxtLocked: {
    color: theme.textDim,
  },
  // The difficulties, lifted off the page into a popover above the button —
  // `bottom: 100%` so it opens upward into the path's air, never off-screen.
  endlessPop: {
    position: "absolute",
    right: 0,
    bottom: "100%",
    marginBottom: space(2),
    padding: space(2),
    gap: space(2),
    backgroundColor: VEIL,
    borderRadius: radius.md,
    ...shadow.modal,
  },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    minWidth: 92,
    paddingVertical: space(1),
    paddingHorizontal: space(2),
    borderRadius: radius.chip,
    backgroundColor: theme.bgAlt,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  chipPressed: {
    backgroundColor: theme.panelLine,
  },
  chipTxt: {
    ...typography.caption,
    fontSize: 14.5,
    color: theme.text,
  },
});
