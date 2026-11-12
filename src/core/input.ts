// Gesture tracker (SPEC-geometry section 5): first finger wins, cancel never cuts.
import { TAP_SLOP, type Vec2 } from "./geometry";

export type PointerPhase = "down" | "move" | "up" | "cancel" | "lostcapture";
export interface PointerSample {
  readonly phase: PointerPhase;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
}
export type GestureEvent =
  | { readonly kind: "start"; readonly pointerId: number; readonly at: Vec2 }
  | { readonly kind: "tap"; readonly pointerId: number; readonly at: Vec2 }
  | { readonly kind: "swipe"; readonly pointerId: number; readonly path: ReadonlyArray<Vec2>; readonly duration: number }
  | { readonly kind: "cancelled"; readonly pointerId: number };

export interface GestureTracker {
  feed(sample: PointerSample): GestureEvent | null;
  reset(): void;
  readonly activePointer: number | null;
}

export function createGestureTracker(opts: { tapSlop?: number } = {}): GestureTracker {
  const slopIn = opts?.tapSlop;
  const tapSlop = typeof slopIn === "number" && Number.isFinite(slopIn) && slopIn >= 0 ? slopIn : TAP_SLOP;
  let active: number | null = null;
  let path: Vec2[] = [];
  let t0 = 0;

  const finite = (s: PointerSample) => Number.isFinite(s.x) && Number.isFinite(s.y);

  return {
    get activePointer() {
      return active;
    },
    reset() {
      active = null;
      path = [];
    },
    feed(s: PointerSample): GestureEvent | null {
      if (!s) return null;
      switch (s.phase) {
        case "down": {
          if (active !== null) return null;
          if (!finite(s)) return null;
          active = s.pointerId;
          path = [{ x: s.x, y: s.y }];
          t0 = Number.isFinite(s.t) ? s.t : 0;
          return { kind: "start", pointerId: s.pointerId, at: { x: s.x, y: s.y } };
        }
        case "move": {
          if (active === null || s.pointerId !== active) return null;
          if (finite(s)) path.push({ x: s.x, y: s.y });
          return null;
        }
        case "up": {
          if (active === null || s.pointerId !== active) return null;
          if (finite(s)) path.push({ x: s.x, y: s.y });
          const id = active;
          const pts = path;
          active = null;
          path = [];
          let len = 0;
          for (let i = 1; i < pts.length; i++) {
            len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
          }
          if (len < tapSlop) return { kind: "tap", pointerId: id, at: pts[0]! };
          const t1 = Number.isFinite(s.t) ? s.t : t0;
          return { kind: "swipe", pointerId: id, path: pts, duration: t1 - t0 };
        }
        case "cancel":
        case "lostcapture": {
          if (active === null || s.pointerId !== active) return null;
          const id = active;
          active = null;
          path = [];
          return { kind: "cancelled", pointerId: id };
        }
        default:
          return null;
      }
    },
  };
}
