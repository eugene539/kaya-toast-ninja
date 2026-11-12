// Geometry, transforms and the plate (SPEC-geometry sections 1 to 4 and 9).
// Floating areas here are for drawing only; no acceptance decision reads them.

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

export const DESIGN = Object.freeze({ width: 390, height: 844 } as const);
export const TOAST: ToastSpec = Object.freeze({ width: 300, height: 240 });
export const MIN_GAP = 4 as const;
export const DEFAULT_GAP = 6 as const;
export const MAX_FAN_DEGREES = 10 as const;
export const DEFAULT_FAN_DEGREES = 6 as const;
export const MIN_PIECE_WIDTH = 32 as const;
export const SNAP_LINE_MIN_WIDTH = 2 as const;
export const TAP_SLOP = 10 as const;

export function checkDenominator(d: number): void {
  if (typeof d !== "number" || !Number.isInteger(d) || d < 2 || d > 12) {
    throw new RangeError("denominator must be an integer from 2 to 12");
  }
}

function checkToast(t: ToastSpec): void {
  if (!t || !(t.width > 0) || !(t.height > 0) || !Number.isFinite(t.width) || !Number.isFinite(t.height)) {
    throw new RangeError("toast width and height must be positive and finite");
  }
}

export function polygonArea(poly: Polygon): number {
  if (!poly || poly.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  const area = Math.abs(s) / 2;
  return Number.isFinite(area) ? area : 0;
}

export function clipHalfPlane(poly: Polygon, nx: number, ny: number, c: number): Polygon {
  if (!poly || poly.length === 0) return [];
  if (![nx, ny, c].every(Number.isFinite)) return [];
  const out: Vec2[] = [];
  const f = (p: Vec2) => nx * p.x + ny * p.y - c;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const fc = f(cur);
    const fp = f(prev);
    if (!Number.isFinite(fc) || !Number.isFinite(fp)) continue;
    const curIn = fc <= 0;
    const prevIn = fp <= 0;
    if (curIn !== prevIn) {
      const tt = fp / (fp - fc);
      out.push({ x: prev.x + (cur.x - prev.x) * tt, y: prev.y + (cur.y - prev.y) * tt });
    }
    if (curIn) out.push({ x: cur.x, y: cur.y });
  }
  // Drop consecutive duplicates created on the boundary.
  const dedup: Vec2[] = [];
  for (const p of out) {
    const last = dedup[dedup.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) dedup.push(p);
  }
  if (dedup.length > 1) {
    const a = dedup[0]!;
    const b = dedup[dedup.length - 1]!;
    if (a.x === b.x && a.y === b.y) dedup.pop();
  }
  return dedup;
}

export function toastPolygon(toast: ToastSpec): Polygon {
  checkToast(toast);
  const w = toast.width / 2;
  const h = toast.height / 2;
  return [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ];
}

/** Boundary x of strip edge k (0 .. d), exact at both ends. */
export function edgeX(toast: ToastSpec, d: number, k: number): number {
  if (k <= 0) return -toast.width / 2;
  if (k >= d) return toast.width / 2;
  return -toast.width / 2 + (k * toast.width) / d;
}

export function snapLineX(toast: ToastSpec, d: number, i: number): number {
  checkToast(toast);
  checkDenominator(d);
  if (!Number.isInteger(i) || i < 1 || i > d - 1) throw new RangeError("line index out of range");
  return edgeX(toast, d, i);
}

export function stripPolygon(toast: ToastSpec, d: number, k: number): Polygon {
  checkToast(toast);
  checkDenominator(d);
  if (!Number.isInteger(k) || k < 0 || k > d - 1) throw new RangeError("strip index out of range");
  let poly = toastPolygon(toast);
  // Keep x >= left  <=>  -x <= -left ; keep x <= right.
  poly = clipHalfPlane(poly, -1, 0, -edgeX(toast, d, k));
  poly = clipHalfPlane(poly, 1, 0, edgeX(toast, d, k + 1));
  return poly;
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export interface ViewTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

function positiveFinite(...xs: number[]): boolean {
  return xs.every((x) => typeof x === "number" && Number.isFinite(x) && x > 0);
}

export function fitPlayfield(
  viewW: number,
  viewH: number,
  designW: number = DESIGN.width,
  designH: number = DESIGN.height,
): ViewTransform {
  if (!positiveFinite(viewW, viewH, designW, designH)) {
    throw new RangeError("view and design sizes must be positive and finite");
  }
  const scale = Math.min(viewW / designW, viewH / designH);
  return Object.freeze({
    scale,
    offsetX: (viewW - designW * scale) / 2,
    offsetY: (viewH - designH * scale) / 2,
  });
}

export function viewToDesign(vt: ViewTransform, p: Vec2): Vec2 {
  return { x: (p.x - vt.offsetX) / vt.scale, y: (p.y - vt.offsetY) / vt.scale };
}

export function designToView(vt: ViewTransform, p: Vec2): Vec2 {
  return { x: p.x * vt.scale + vt.offsetX, y: p.y * vt.scale + vt.offsetY };
}

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export function worldToLocal(pose: Pose, p: Vec2): Vec2 {
  const dx = p.x - pose.x;
  const dy = p.y - pose.y;
  const c = Math.cos(-pose.angle);
  const s = Math.sin(-pose.angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function localToWorld(pose: Pose, p: Vec2): Vec2 {
  const c = Math.cos(pose.angle);
  const s = Math.sin(pose.angle);
  return { x: p.x * c - p.y * s + pose.x, y: p.x * s + p.y * c + pose.y };
}

// ---------------------------------------------------------------------------
// Plate
// ---------------------------------------------------------------------------

export function plateSlots(rect: Rect, d: number): Rect[] {
  checkDenominator(d);
  const out: Rect[] = [];
  for (let j = 0; j < d; j++) {
    const x0 = j === 0 ? rect.x : rect.x + (j * rect.width) / d;
    const x1 = j === d - 1 ? rect.x + rect.width : rect.x + ((j + 1) * rect.width) / d;
    out.push({ x: x0, y: rect.y, width: x1 - x0, height: rect.height });
  }
  return out;
}
