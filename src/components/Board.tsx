import React, { useRef } from "react";
import {
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import type { CellState, Puzzle } from "../game/types";
import { cellKey } from "../game/validator";
import { radius, theme } from "../theme";
import { Cell } from "./Cell";

const FRAME = 6;
const DRAG_THRESHOLD = 10; // px of movement before a touch becomes a drag
const DOUBLE_MS = 260; // max gap between taps to count as a double tap

interface Props {
  puzzle: Puzzle;
  states: CellState[][];
  conflicts: Set<string>;
  onPaint: (r: number, c: number) => void; // swipe → mark ✕
  onPlace: (r: number, c: number) => void; // double tap → plant
  onTap: (r: number, c: number) => void; // single tap → toggle ✕ / clear
}

export function Board({
  puzzle,
  states,
  conflicts,
  onPaint,
  onPlace,
  onTap,
}: Props) {
  const { width } = useWindowDimensions();
  const { size, regions, plants, colors } = puzzle;

  const boardW = Math.min(width - 24, 460);
  const cellPx = Math.floor((boardW - FRAME * 2) / size);

  // Refs so the once-created PanResponder always sees current geometry/handlers.
  const geom = useRef({ cellPx, size });
  geom.current = { cellPx, size };
  const cb = useRef({ onPaint, onPlace, onTap });
  cb.current = { onPaint, onPlace, onTap };

  // Gesture working state.
  const grantCell = useRef(-1);
  const lastPanCell = useRef(-1);
  const didDrag = useRef(false);
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
    // locationX/Y are relative to the responder (the board frame, since it is
    // the touch target via pointerEvents="box-only"), so no page-coordinate or
    // status-bar offset can creep in.
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
        grantCell.current = cellFromLocation(locationX, locationY);
        lastPanCell.current = grantCell.current;
        didDrag.current = false;
      },

      onPanResponderMove: (e, g) => {
        if (!didDrag.current && Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD) {
          didDrag.current = true;
          clearPending(); // this is a drag, not a tap
          if (grantCell.current >= 0) cb.current.onPaint(...rc(grantCell.current));
        }
        if (didDrag.current) {
          const cell = cellFromLocation(
            e.nativeEvent.locationX,
            e.nativeEvent.locationY,
          );
          if (cell >= 0 && cell !== lastPanCell.current) {
            lastPanCell.current = cell;
            cb.current.onPaint(...rc(cell));
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
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: FRAME,
    backgroundColor: theme.frame,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
});
