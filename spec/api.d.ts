/**
 * spec/api.d.ts: the public types and functions of src/core (Kaya Toast Ninja).
 *
 * Tests import these from "@core". The rules behind each function are in
 * spec/SPEC-geometry.md and spec/SPEC-orders.md. Pure TypeScript: no Phaser, no DOM.
 * Every function is pure (returns new values, never mutates its inputs) unless it says otherwise.
 */

// ---------------------------------------------------------------------------
// Rationals (SPEC-orders section 4 and 5)
// ---------------------------------------------------------------------------

/** An exact fraction, always normalised: d > 0, gcd(|n|, d) = 1, zero is 0/1. */
export interface Rational {
  readonly n: number;
  readonly d: number;
}

/** Builds a normalised rational; d defaults to 1. Throws RangeError if d is 0 or either part is not a safe integer. */
export function rat(n: number, d?: number): Rational;
export function add(a: Rational, b: Rational): Rational;
export function sub(a: Rational, b: Rational): Rational;
export function mul(a: Rational, b: Rational): Rational;
/** Throws RangeError when b is zero. */
export function div(a: Rational, b: Rational): Rational;
export function eq(a: Rational, b: Rational): boolean;
/** -1 if a < b, 0 if equal, 1 if a > b. Exact (no floating point). */
export function cmp(a: Rational, b: Rational): -1 | 0 | 1;
export function isInteger(a: Rational): boolean;
/** True for a value built by rat(): integer parts, d > 0, normalised. */
export function isRational(x: unknown): x is Rational;
/** Floating value, for drawing only. */
export function toNumber(a: Rational): number;

// ---------------------------------------------------------------------------
// Geometry (SPEC-geometry sections 1 to 4)
// ---------------------------------------------------------------------------

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}
export type Polygon = ReadonlyArray<Vec2>;

export interface ToastSpec {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const DESIGN: { readonly width: 390; readonly height: 844 };
export const TOAST: ToastSpec; // { width: 300, height: 240 }
export const MIN_GAP: 4;
export const DEFAULT_GAP: 6;
export const MAX_FAN_DEGREES: 10;
export const DEFAULT_FAN_DEGREES: 6;
export const MIN_PIECE_WIDTH: 32;
export const SNAP_LINE_MIN_WIDTH: 2;
export const TAP_SLOP: 10;

/** Absolute area; 0 for fewer than 3 points. */
export function polygonArea(poly: Polygon): number;
/** Keeps the part of poly where nx * x + ny * y <= c (Sutherland-Hodgman against one edge). */
export function clipHalfPlane(poly: Polygon, nx: number, ny: number, c: number): Polygon;
/** The toast rectangle in toast-local space, centred on the origin. */
export function toastPolygon(toast: ToastSpec): Polygon;
/** x of snap line i (1 .. d-1) in toast-local space. RangeError outside. */
export function snapLineX(toast: ToastSpec, d: number, i: number): number;
/** Strip k (0 .. d-1) as a polygon in toast-local space. RangeError outside. */
export function stripPolygon(toast: ToastSpec, d: number, k: number): Polygon;

// ---------------------------------------------------------------------------
// Transforms (SPEC-geometry sections 2 and 3)
// ---------------------------------------------------------------------------

export interface ViewTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}
export function fitPlayfield(viewW: number, viewH: number, designW?: number, designH?: number): ViewTransform;
export function viewToDesign(vt: ViewTransform, p: Vec2): Vec2;
export function designToView(vt: ViewTransform, p: Vec2): Vec2;

/** Pose of the hanging toast in design space; angle in radians. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}
export function worldToLocal(pose: Pose, p: Vec2): Vec2;
export function localToWorld(pose: Pose, p: Vec2): Vec2;

// ---------------------------------------------------------------------------
// Gestures (SPEC-geometry section 5)
// ---------------------------------------------------------------------------

export type PointerPhase = "down" | "move" | "up" | "cancel" | "lostcapture";

export interface PointerSample {
  readonly phase: PointerPhase;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  /** Milliseconds. */
  readonly t: number;
}

export type GestureEvent =
  | { readonly kind: "start"; readonly pointerId: number; readonly at: Vec2 }
  | { readonly kind: "tap"; readonly pointerId: number; readonly at: Vec2 }
  | {
      readonly kind: "swipe";
      readonly pointerId: number;
      readonly path: ReadonlyArray<Vec2>;
      readonly duration: number;
    }
  | { readonly kind: "cancelled"; readonly pointerId: number };

/** Stateful (the only stateful object in the core). */
export interface GestureTracker {
  feed(sample: PointerSample): GestureEvent | null;
  reset(): void;
  readonly activePointer: number | null;
}
export function createGestureTracker(opts?: { tapSlop?: number }): GestureTracker;

// ---------------------------------------------------------------------------
// Swipes, forgiveness, groups and layout (SPEC-geometry sections 6 to 9)
// ---------------------------------------------------------------------------

export type SwipeKind = "across" | "along" | "none";
export interface SwipeResult {
  readonly kind: SwipeKind;
  /** Newly cut line indices, ascending, unique, none from alreadyCut. */
  readonly lines: ReadonlyArray<number>;
}
/** path is in toast-local space. */
export function resolveSwipe(
  toast: ToastSpec,
  d: number,
  path: ReadonlyArray<Vec2>,
  alreadyCut?: ReadonlyArray<number>,
): SwipeResult;
/** A still-joined group as drawn: strips start..end, centre (x, y) in toast-local space, angle in degrees. */
export interface GroupPose {
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}
/** SPEC-geometry 6.1: resolves a later swipe against the separated groups as drawn. */
export function resolveSwipeOnGroups(
  toast: ToastSpec,
  d: number,
  path: ReadonlyArray<Vec2>,
  cutLines: ReadonlyArray<number>,
  groups: ReadonlyArray<GroupPose>,
): SwipeResult;
export function forgivenessRadius(toast: ToastSpec, d: number): number;
export function snapToLine(toast: ToastSpec, d: number, x: number): number | null;

export interface Group {
  readonly start: number;
  readonly end: number;
}
export function groupsOf(d: number, cutLines: ReadonlyArray<number>): Group[];
export function isSeparated(d: number, cutLines: ReadonlyArray<number>, k: number): boolean;

export interface PieceLayout {
  readonly index: number;
  readonly group: number;
  /** Centre in toast-local space after separation. */
  readonly x: number;
  readonly y: number;
  /** Degrees. */
  readonly angle: number;
}
export function layoutCut(
  toast: ToastSpec,
  d: number,
  cutLines: ReadonlyArray<number>,
  opts?: { gap?: number; fanDegrees?: number },
): PieceLayout[];

export function plateSlots(rect: Rect, d: number): Rect[];

// ---------------------------------------------------------------------------
// Partitions, the serve rule and marks (SPEC-orders sections 4, 5 and 8)
// ---------------------------------------------------------------------------

export interface Piece {
  readonly id: string;
  readonly partitionId: string;
  readonly denominator: number;
  readonly index: number;
  readonly size: Rational;
}
export interface Partition {
  readonly id: string;
  readonly denominator: number;
  readonly pieces: ReadonlyArray<Piece>;
}
export function makePartition(partitionId: string, d: number): Partition;

export type ServeOutcome = "placed" | "matched" | "duplicate" | "otherPartition" | "notYet" | "closed" | "invalid";

export interface Plate {
  readonly target: Rational;
  readonly partitionId: string | null;
  readonly served: ReadonlyArray<Piece>;
  readonly total: Rational;
  readonly matched: boolean;
}
export function emptyPlate(target: Rational): Plate;
export function serve(plate: Plate, piece: Piece): { plate: Plate; outcome: ServeOutcome };
export function canFill(target: Rational, d: number): boolean;

export interface Marks {
  readonly exact: boolean;
  readonly smart: boolean;
  readonly tidy: boolean;
}
export function marksFor(
  order: Order,
  dial: ReadonlyArray<number>,
  history: { notYets: number; finalDenominator: number; swipesOnFinal: number },
): Marks;

// ---------------------------------------------------------------------------
// Orders and generators (SPEC-orders sections 1 to 3, 6, 7 and 9)
// ---------------------------------------------------------------------------

export type Level = "P1" | "P2";

export interface Order {
  readonly id: string;
  readonly level: Level;
  readonly numerator: number;
  readonly denominator: number;
  readonly value: Rational;
  readonly spoken: string;
  readonly stacked: boolean;
}

export const DIAL_CANDIDATES: ReadonlyArray<number>; // 2, 3, 4, 5, 6, 8, 10, 12
export function dialAllowedByWidth(candidates: ReadonlyArray<number>, toastWidth: number, minWidth: number): number[];
export function dialFor(level: Level): number[];
export function orderSpace(level: Level): Order[];
export function makeOrder(level: Level, numerator: number, denominator: number): Order;
export function spokenOrder(numerator: number, denominator: number): string;
export function labelFor(order: Order): {
  words: string;
  stacked: { numerator: number; denominator: number } | null;
};

export interface DialChoiceSolution {
  readonly pieces: number;
  readonly canFill: boolean;
  readonly piecesNeeded: number | null;
}
export interface OrderSolution {
  readonly orderId: string;
  readonly choices: ReadonlyArray<DialChoiceSolution>;
  readonly smartChoice: number;
  readonly fewestPieces: number;
}
export function solveOrder(order: Order, dial: ReadonlyArray<number>): OrderSolution;

export interface Rng {
  next(): number;
}
export function createRng(seed: number): Rng;
export function generateShift(level: Level, count: number, rng: Rng): Order[];
export const DEMO_ORDERS: ReadonlyArray<Order>;
