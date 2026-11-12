// Resolving a swipe into cuts, and finger forgiveness (SPEC-geometry section 6).
// Forgiveness only chooses which line a swipe snaps to; it never touches acceptance.
import { checkDenominator, edgeX, type ToastSpec, type Vec2 } from "./geometry";

export type SwipeKind = "across" | "along" | "none";
export interface SwipeResult {
  readonly kind: SwipeKind;
  readonly lines: ReadonlyArray<number>;
}

const NONE: SwipeResult = Object.freeze({ kind: "none", lines: Object.freeze([]) as ReadonlyArray<number> });

export function forgivenessRadius(toast: ToastSpec, d: number): number {
  checkDenominator(d);
  return toast.width / (3 * d);
}

export function snapToLine(toast: ToastSpec, d: number, x: number): number | null {
  const r = forgivenessRadius(toast, d);
  if (!Number.isFinite(x)) return null;
  for (let i = 1; i <= d - 1; i++) {
    if (Math.abs(x - edgeX(toast, d, i)) <= r) return i;
  }
  return null;
}

function cleanPath(path: ReadonlyArray<Vec2>): Vec2[] {
  const out: Vec2[] = [];
  if (!Array.isArray(path)) return out;
  for (const p of path) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Liang-Barsky clip of segment p->q to the closed rectangle; null when nothing is inside. */
function clipSegment(p: Vec2, q: Vec2, hw: number, hh: number): [Vec2, Vec2] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const checks: Array<[number, number]> = [
    [-dx, p.x + hw],
    [dx, hw - p.x],
    [-dy, p.y + hh],
    [dy, hh - p.y],
  ];
  for (const [pp, qq] of checks) {
    if (pp === 0) {
      if (qq < 0) return null;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    { x: p.x + dx * t0, y: p.y + dy * t0 },
    { x: p.x + dx * t1, y: p.y + dy * t1 },
  ];
}

export function resolveSwipe(
  toast: ToastSpec,
  d: number,
  path: ReadonlyArray<Vec2>,
  alreadyCut: ReadonlyArray<number> = [],
): SwipeResult {
  checkDenominator(d);
  const cut = new Set(Array.isArray(alreadyCut) ? alreadyCut : []);
  const pts = cleanPath(path);
  if (pts.length < 2) return NONE;
  const hw = toast.width / 2;
  const hh = toast.height / 2;

  // Rule A: across.
  const crossed = new Set<number>();
  for (let s = 0; s < pts.length - 1; s++) {
    const p = pts[s]!;
    const q = pts[s + 1]!;
    for (let i = 1; i <= d - 1; i++) {
      const xi = edgeX(toast, d, i);
      const sp = p.x < xi ? -1 : 1;
      const sq = q.x < xi ? -1 : 1;
      if (sp === sq) continue;
      const t = (xi - p.x) / (q.x - p.x);
      const y = p.y + (q.y - p.y) * t;
      if (y > -hh && y < hh) crossed.add(i);
    }
  }
  if (crossed.size > 0) {
    const lines = [...crossed].filter((i) => !cut.has(i)).sort((a, b) => a - b);
    return { kind: "across", lines };
  }

  // Rule B: along.
  const inside: Vec2[] = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const c = clipSegment(pts[s]!, pts[s + 1]!, hw, hh);
    if (c) inside.push(c[0], c[1]);
  }
  if (inside.length === 0) return NONE;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of inside) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (maxY - minY < toast.height / 2) return NONE;
  const r = toast.width / (3 * d);
  for (let i = 1; i <= d - 1; i++) {
    const xi = edgeX(toast, d, i);
    if (Math.abs(minX - xi) <= r && Math.abs(maxX - xi) <= r) {
      return { kind: "along", lines: cut.has(i) ? [] : [i] };
    }
  }
  return NONE;
}
