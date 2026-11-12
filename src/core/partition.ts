// Partitions, cut groups and the PLAN-v6 cut layout (SPEC-geometry 7 and 8, SPEC-orders 4).
import { rat, type Rational } from "./rational";
import {
  checkDenominator,
  DEFAULT_FAN_DEGREES,
  DEFAULT_GAP,
  edgeX,
  MAX_FAN_DEGREES,
  MIN_GAP,
  type ToastSpec,
} from "./geometry";

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

export function makePartition(partitionId: string, d: number): Partition {
  if (typeof partitionId !== "string" || partitionId.length === 0) {
    throw new RangeError("partition id must be a non-empty string");
  }
  checkDenominator(d);
  const pieces: Piece[] = [];
  for (let k = 0; k < d; k++) {
    pieces.push(
      Object.freeze({ id: `${partitionId}:${k}`, partitionId, denominator: d, index: k, size: rat(1, d) }),
    );
  }
  return Object.freeze({ id: partitionId, denominator: d, pieces: Object.freeze(pieces) });
}

export interface Group {
  readonly start: number;
  readonly end: number;
}

function checkCutLines(d: number, cutLines: ReadonlyArray<number>): Set<number> {
  checkDenominator(d);
  if (!Array.isArray(cutLines)) throw new RangeError("cut lines must be an array");
  const set = new Set<number>();
  for (const i of cutLines) {
    if (typeof i !== "number" || !Number.isInteger(i) || i < 1 || i > d - 1) {
      throw new RangeError("cut line index out of range");
    }
    if (set.has(i)) throw new RangeError("duplicate cut line");
    set.add(i);
  }
  return set;
}

export function groupsOf(d: number, cutLines: ReadonlyArray<number>): Group[] {
  const set = checkCutLines(d, cutLines);
  const groups: Group[] = [];
  let start = 0;
  for (let i = 1; i <= d - 1; i++) {
    if (set.has(i)) {
      groups.push({ start, end: i - 1 });
      start = i;
    }
  }
  groups.push({ start, end: d - 1 });
  return groups;
}

export function isSeparated(d: number, cutLines: ReadonlyArray<number>, k: number): boolean {
  const set = checkCutLines(d, cutLines);
  if (!Number.isInteger(k) || k < 0 || k > d - 1) throw new RangeError("strip index out of range");
  const leftOk = k === 0 || set.has(k);
  const rightOk = k === d - 1 || set.has(k + 1);
  return leftOk && rightOk;
}

export interface PieceLayout {
  readonly index: number;
  readonly group: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export function layoutCut(
  toast: ToastSpec,
  d: number,
  cutLines: ReadonlyArray<number>,
  opts: { gap?: number; fanDegrees?: number } = {},
): PieceLayout[] {
  const groups = groupsOf(d, cutLines);
  const gapIn = opts?.gap;
  const fanIn = opts?.fanDegrees;
  const gap = typeof gapIn === "number" && Number.isFinite(gapIn) ? Math.max(MIN_GAP, gapIn) : DEFAULT_GAP;
  const fan =
    typeof fanIn === "number" && Number.isFinite(fanIn)
      ? Math.min(MAX_FAN_DEGREES, Math.max(0, fanIn))
      : DEFAULT_FAN_DEGREES;
  const H = toast.height;
  const G = groups.length;
  if (G === 1) {
    const out: PieceLayout[] = [];
    for (let k = 0; k < d; k++) {
      out.push({ index: k, group: 0, x: (edgeX(toast, d, k) + edgeX(toast, d, k + 1)) / 2, y: 0, angle: 0 });
    }
    return out;
  }
  const angles = groups.map((_, g) => -fan / 2 + (fan * g) / (G - 1));
  const halfWidths = groups.map((grp, g) => {
    const w = edgeX(toast, d, grp.end + 1) - edgeX(toast, d, grp.start);
    const a = (Math.abs(angles[g]!) * Math.PI) / 180;
    return (w / 2) * Math.cos(a) + (H / 2) * Math.sin(a);
  });
  const total = halfWidths.reduce((s, hw) => s + 2 * hw, 0) + gap * (G - 1);
  let cursor = -total / 2;
  const out: PieceLayout[] = [];
  groups.forEach((grp, g) => {
    const hw = halfWidths[g]!;
    const cx = cursor + hw;
    cursor += 2 * hw + gap;
    const origCx = (edgeX(toast, d, grp.start) + edgeX(toast, d, grp.end + 1)) / 2;
    const a = (angles[g]! * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let k = grp.start; k <= grp.end; k++) {
      const local = (edgeX(toast, d, k) + edgeX(toast, d, k + 1)) / 2 - origCx;
      out.push({ index: k, group: g, x: cx + local * c + 0, y: local * s + 0, angle: angles[g]! + 0 });
    }
  });
  return out;
}
