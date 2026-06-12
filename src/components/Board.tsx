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
import { radius, theme } from "../theme";
import { Cell } from "./Cell";

// Wooden rim around the grid. FRAME is the full rim width the touch math
// sees (dark border + padding); locationX/Y are border-box relative on both
// RN and web, so cells start exactly FRAME px from the view's edge.
const FRAME = 10;
const FRAME_BORDER = 3;
const DRAG_THRESHOLD = 10; // px of movement before a touch becomes a drag
const DOUBLE_MS = 260; // max gap between taps to count as a double tap

interface Props {
  puzzle: Puzzle;
  states: CellState[][];
  conflicts: Set<string>;
  onPaint: (r: number, c: number) => void; // swipe → mark ✕
  onErase: (r: number, c: number) => void; // swipe from an ✕ → unmark
  onPlace: (r: number, c: number) => void; // double tap → plant
  onTap: (r: number, c: number) => void; // single tap → toggle ✕ / clear
  highlight?: [number, number] | null; // tutorial/hint: pulse a ring over this cell
  hintCells?: Coord[] | null; // teaching hint: static outline over these cells
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
  conflicts,
  onPaint,
  onErase,
  onPlace,
  onTap,
  highlight,
  hintCells,
}: Props) {
  const { width } = useWindowDimensions();
  const { size, regions, plants, colors } = puzzle;

  const boardW = Math.min(width - 24, 460);
  const cellPx = Math.floor((boardW - FRAME * 2) / size);

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
  const pendingErase = useRef<{
    cell: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

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
        grantCell.current = cellFromLocation(locationX, locationY);
        lastPanCell.current = grantCell.current;
        didDrag.current = false;
        dragErases.current = false;
      },

      onPanResponderMove: (e, g) => {
        if (!didDrag.current && Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD) {
          didDrag.current = true;
          clearPending(); // this is a drag, not a tap
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
        if (didDrag.current) return; // drag already handled
        const cell = grantCell.current;
        if (cell < 0) return;
        const now = Date.now();
        const lt = lastTap.current;
        if (lt.cell === cell && now - lt.time < DOUBLE_MS) {
          // Second tap on the same cell → place a plant.
          clearPending();
          lastTap.current = { cell: -1, time: 0 };
          cb.current.onPlace(...rc(cell));
        } else {
          // First tap → toggle ✕, but wait briefly in case a double tap follows.
          lastTap.current = { cell, time: now };
          clearPending();
          const timer = setTimeout(() => {
            cb.current.onTap(...rc(cell));
            pendingErase.current = null;
          }, DOUBLE_MS);
          pendingErase.current = { cell, timer };
        }
      },
    });
  }
  const responder = responderRef.current;

  return (
    <View
      {...responder.panHandlers}
      pointerEvents="box-only"
      style={[styles.frame, { width: cellPx * size + FRAME * 2 }]}
    >
      <View pointerEvents="none" style={styles.frameGloss} />
      {Array.from({ length: size }, (_, r) => (
        <View key={r} style={styles.row}>
          {Array.from({ length: size }, (_, c) => {
            const region = regions[r][c];
            return (
              <Cell
                key={c}
                px={cellPx}
                state={states[r][c]}
                plantId={plants[region]}
                color={colors[region]}
                conflict={conflicts.has(cellKey(r, c))}
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
              left: FRAME + c * cellPx,
              top: FRAME + r * cellPx,
              width: cellPx,
              height: cellPx,
            },
          ]}
        />
      ))}
      {highlight && (
        <HighlightRing
          x={FRAME + highlight[1] * cellPx}
          y={FRAME + highlight[0] * cellPx}
          px={cellPx}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: FRAME - FRAME_BORDER,
    backgroundColor: theme.wood,
    borderWidth: FRAME_BORDER,
    borderColor: theme.woodDark,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  // 1px light ring just inside the dark border — the "carved wood" highlight.
  // Absolute children sit relative to the padding edge, so 0/0/0/0 hugs the
  // inside of the border.
  frameGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: theme.woodLight,
    borderRadius: radius.lg - FRAME_BORDER,
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
    backgroundColor: "rgba(255, 214, 90, 0.14)",
  },
});
