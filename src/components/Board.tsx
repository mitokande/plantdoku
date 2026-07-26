import React, { useEffect, useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import type { CellState, Coord, Puzzle } from "../game/types";
import { cellKey } from "../game/validator";
import { radius, shadow, theme } from "../theme";
import { Cell } from "./Cell";

// The tray rim around the grid, kept deliberately slim so it frames the puzzle
// instead of competing with it. FRAME is the full rim width
// the touch math sees (dark border + padding); locationX/Y are border-box
// relative on both RN and web, so cells start exactly FRAME px from the view's
// edge.
const FRAME = 7;
const FRAME_BORDER = 2;
// position:absolute children are placed relative to the *padding* edge (i.e.
// already inset by the border), unlike locationX/Y above which is border-box
// relative — so absolute overlays over the grid (ring, hintCell) must offset
// by padding alone, or they'd double-count the border and drift off-cell.
const OVERLAY_INSET = FRAME - FRAME_BORDER;

// Shared with GameScreen so the tutorial spotlight can compute cell rects
// that exactly match the rendered grid.
export const BOARD_FRAME = FRAME;
export function boardMetrics(windowWidth: number, size: number) {
  const boardW = Math.min(windowWidth - 24, 460);
  const cellPx = Math.floor((boardW - FRAME * 2) / size);
  return { cellPx, frameW: cellPx * size + FRAME * 2 };
}

const DRAG_THRESHOLD = 10; // px of movement before a touch becomes a drag
// Two independent timers. DOUBLE_MS is the max gap from a tap's lift to the next
// tap's *touch-down* to count as a double-tap. Measuring to touch-down (not the
// second lift) excludes the second tap's press duration — the thing that made
// double-taps feel hard — so the window can stay forgiving. SINGLE_MS is how
// long a *lone* tap waits before its ✕ (and its haptic/audio) commits — the
// dead-air on an isolated mark, so it's tuned low for snappy marking. Keep
// SINGLE_MS ≤ DOUBLE_MS: a double-tap whose second touch-down lands after
// SINGLE_MS briefly flashes a ✕ before the plant (the plant's pop masks it) —
// quicker double-taps stay clean. Rapid marking never waits this out anyway: a
// pending ✕ commits the instant the next touch lands on a different cell.
const DOUBLE_MS = 260; // max lift→next-touch-down gap to count as a double tap
const SINGLE_MS = 90; // a lone tap's ✕ commit delay (low = snappier marking)
// A third, independent way to place: hold a cell still for HOLD_MS. It races
// the tap/double-tap logic above rather than replacing it — a finger that
// moves past DRAG_THRESHOLD before HOLD_MS elapses becomes a drag instead
// (long-press requires staying put), and once it fires, further move events
// on that touch are ignored until release so the same gesture can't also
// paint a trail of ✕ marks.
const HOLD_MS = 450;

interface Props {
  puzzle: Puzzle;
  states: CellState[][];
  mistakes: Set<string>; // rejected guesses, drawn as red ✕ cells
  onPaint: (r: number, c: number) => void; // swipe → mark ✕
  onErase: (r: number, c: number) => void; // swipe from an ✕ → unmark
  onPlace: (r: number, c: number) => void; // double tap or hold → plant
  onTap: (r: number, c: number) => void; // single tap → toggle ✕ / clear
  highlight?: [number, number] | null; // tutorial: pulse a ring over this cell
  hintCells?: Coord[] | null; // tutorial: static outline over these cells
}

/** Pulsing attention ring drawn over one cell (tutorial coach mark). */
function HighlightRing({ x, y, px }: { x: number; y: number; px: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
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
  }, [pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: x,
          top: y,
          width: px,
          height: px,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
          transform: [
            {
              scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }),
            },
          ],
        },
      ]}
    />
  );
}

export function Board({
  puzzle,
  states,
  mistakes,
  onPaint,
  onErase,
  onPlace,
  onTap,
  highlight,
  hintCells,
}: Props) {
  const { width } = useWindowDimensions();
  const { size, regions, plants, colors } = puzzle;

  const { cellPx, frameW } = boardMetrics(width, size);

  // Identity of the board on screen, used to key the grid below. Two boards of
  // the same size otherwise reconcile cell-for-cell: React keeps every `Cell`
  // instance (and its native views) and just feeds it new props, so any
  // per-cell rendering state from the previous board rides along into the next
  // one. Keying by the solution forces a clean grid per puzzle instead.
  const boardKey = `${size}:${puzzle.solution.join(",")}`;

  // Refs so the once-created PanResponder always sees current geometry/handlers.
  const geom = useRef({ cellPx, size });
  geom.current = { cellPx, size };
  const cb = useRef({ onPaint, onErase, onPlace, onTap });
  cb.current = { onPaint, onErase, onPlace, onTap };
  const statesRef = useRef(states);
  statesRef.current = states;

  // Gesture working state.
  const grantCell = useRef(-1);
  const grantLoc = useRef({ x: -1, y: -1 }); // board-relative touch-down point
  const lastPanCell = useRef(-1);
  const didDrag = useRef(false);
  const dragErases = useRef(false); // drag started on an ✕ → drag unmarks
  const lastTap = useRef({ cell: -1, time: 0 });
  const armedPlace = useRef(false); // touch-down detected a double-tap; release places
  const pendingErase = useRef<{
    cell: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false); // this touch already placed via long-press

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const responderRef = useRef<ReturnType<typeof PanResponder.create> | null>(
    null,
  );
  if (!responderRef.current) {
    const rc = (cell: number): [number, number] => {
      const n = geom.current.size;
      return [Math.floor(cell / n), cell % n];
    };
    // The grant's locationX/Y are relative to the board frame (the touch
    // necessarily starts on it, and box-only makes it the target), so no
    // page-coordinate or status-bar offset can creep in. Later positions are
    // derived as grant point + gestureState dx/dy — see onPanResponderMove.
    const cellFromLocation = (locationX: number, locationY: number): number => {
      const { cellPx: px, size: n } = geom.current;
      const c = Math.floor((locationX - FRAME) / px);
      const r = Math.floor((locationY - FRAME) / px);
      if (r < 0 || c < 0 || r >= n || c >= n) return -1;
      return r * n + c;
    };
    const clearPending = () => {
      if (pendingErase.current) {
        clearTimeout(pendingErase.current.timer);
        pendingErase.current = null;
      }
    };

    responderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        grantLoc.current = { x: locationX, y: locationY };
        const cell = cellFromLocation(locationX, locationY);
        grantCell.current = cell;
        // Decide the double-tap here, at the second touch-down: same cell as the
        // last tap, within DOUBLE_MS of its lift. Deciding at touch-down (not at
        // release) is what makes it forgiving, and lets us cancel the pending ✕
        // before it can flash.
        const lt = lastTap.current;
        armedPlace.current =
          cell >= 0 && lt.cell === cell && Date.now() - lt.time < DOUBLE_MS;
        // Resolve a still-pending ✕ from the previous tap: drop it if this is its
        // second tap (we'll place instead); otherwise commit it now — a touch
        // landing elsewhere means it can no longer become a double tap, so don't
        // make it wait out the timer (rapid marking stays instant).
        if (pendingErase.current) {
          clearTimeout(pendingErase.current.timer);
          const pc = pendingErase.current.cell;
          pendingErase.current = null;
          if (!armedPlace.current) cb.current.onTap(...rc(pc));
        }
        lastPanCell.current = cell;
        didDrag.current = false;
        dragErases.current = false;
        // Long-press: if this touch stays put on the cell for HOLD_MS, place a
        // plant there — independent of however the tap/double-tap above gets
        // resolved (release clears this timer first).
        holdFired.current = false;
        if (holdTimer.current) clearTimeout(holdTimer.current);
        holdTimer.current =
          cell >= 0
            ? setTimeout(() => {
                holdTimer.current = null;
                holdFired.current = true;
                armedPlace.current = false;
                cb.current.onPlace(...rc(cell));
              }, HOLD_MS)
            : null;
      },

      onPanResponderMove: (e, g) => {
        if (holdFired.current) return; // already placed; ignore the rest of this touch
        if (!didDrag.current && Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD) {
          didDrag.current = true;
          armedPlace.current = false; // a drag is never a place
          clearPending(); // this is a drag, not a tap
          if (holdTimer.current) {
            clearTimeout(holdTimer.current);
            holdTimer.current = null;
          }
          if (grantCell.current >= 0) {
            // The start cell decides the drag's mode: ✕ → erase, else paint.
            const [r, c] = rc(grantCell.current);
            dragErases.current = statesRef.current[r][c] === "marked";
            (dragErases.current ? cb.current.onErase : cb.current.onPaint)(r, c);
          }
        }
        if (didDrag.current) {
          // Current position = grant point + accumulated pan delta. Move
          // events' own locationX/Y are NOT usable here: once the finger
          // leaves the board, the event target is whatever view it is over,
          // so its local coordinates would wrap back into the grid.
          const cell = cellFromLocation(
            grantLoc.current.x + g.dx,
            grantLoc.current.y + g.dy,
          );
          if (cell >= 0 && cell !== lastPanCell.current) {
            lastPanCell.current = cell;
            (dragErases.current ? cb.current.onErase : cb.current.onPaint)(
              ...rc(cell),
            );
          }
        }
      },

      onPanResponderRelease: () => {
        if (holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
        }
        if (holdFired.current) {
          holdFired.current = false;
          return; // the long-press already placed the plant
        }
        if (didDrag.current) return; // drag already handled
        const cell = grantCell.current;
        if (cell < 0) return;
        if (armedPlace.current) {
          // Second tap of a double-tap (decided at touch-down) → place a plant.
          armedPlace.current = false;
          lastTap.current = { cell: -1, time: 0 };
          cb.current.onPlace(...rc(cell));
          return;
        }
        // First tap → toggle ✕, but wait briefly in case a double tap follows.
        lastTap.current = { cell, time: Date.now() };
        clearPending();
        const timer = setTimeout(() => {
          cb.current.onTap(...rc(cell));
          pendingErase.current = null;
        }, SINGLE_MS);
        pendingErase.current = { cell, timer };
      },
    });
  }
  const responder = responderRef.current;

  return (
    <View
      {...responder.panHandlers}
      pointerEvents="box-only"
      style={[styles.frame, { width: frameW }]}
    >
      {/* Shows through the tile gaps: a step darker than the tray face, so each
          light pastel tile gets a soft separating line and reads as its own
          raised object. */}
      <View pointerEvents="none" style={styles.bedGap} />
      <View pointerEvents="none" style={styles.frameGloss} />
      {Array.from({ length: size }, (_, r) => (
        <View key={`${boardKey}-${r}`} style={styles.row}>
          {Array.from({ length: size }, (_, c) => {
            const region = regions[r][c];
            return (
              <Cell
                key={`${boardKey}-${c}`}
                px={cellPx}
                state={states[r][c]}
                plantId={plants[region]}
                color={colors[region]}
                mistake={mistakes.has(cellKey(r, c))}
              />
            );
          })}
        </View>
      ))}
      {hintCells?.map(([r, c]) => (
        <View
          key={`h${r}-${c}`}
          pointerEvents="none"
          style={[
            styles.hintCell,
            {
              left: OVERLAY_INSET + c * cellPx,
              top: OVERLAY_INSET + r * cellPx,
              width: cellPx,
              height: cellPx,
            },
          ]}
        />
      ))}
      {highlight && (
        <HighlightRing
          x={OVERLAY_INSET + highlight[1] * cellPx}
          y={OVERLAY_INSET + highlight[0] * cellPx}
          px={cellPx}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: FRAME - FRAME_BORDER,
    backgroundColor: theme.bed,
    borderWidth: FRAME_BORDER,
    borderColor: theme.bedEdge,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadow.card,
  },
  // Absolute children sit relative to the padding edge, so 0/0/0/0 hugs the
  // inside of the border — i.e. exactly the grid's footprint.
  bedGap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.bedGap,
    borderRadius: radius.sm,
  },
  // 1px light ring just inside the border — the tray's carved highlight.
  frameGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: theme.bedRim,
    borderRadius: radius.md - FRAME_BORDER,
  },
  row: {
    flexDirection: "row",
  },
  ring: {
    position: "absolute",
    borderWidth: 3,
    borderColor: theme.gold,
    borderRadius: radius.sm,
  },
  hintCell: {
    position: "absolute",
    borderWidth: 2.5,
    borderColor: theme.gold,
    borderRadius: radius.sm,
    backgroundColor: "rgba(240, 180, 41, 0.20)",
  },
});
