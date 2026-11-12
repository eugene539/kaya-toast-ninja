import { describe, test, expect } from "bun:test";
import {
  DESIGN, TOAST, MIN_GAP, DEFAULT_GAP, MAX_FAN_DEGREES, DEFAULT_FAN_DEGREES,
  MIN_PIECE_WIDTH, SNAP_LINE_MIN_WIDTH, TAP_SLOP,
  polygonArea, toastPolygon, clipHalfPlane, stripPolygon, snapLineX,
  forgivenessRadius, snapToLine, resolveSwipe, groupsOf, isSeparated, layoutCut, plateSlots,
  type PieceLayout,
} from "@core";

const p = (x: number, y: number) => ({ x, y });
const none = { kind: "none", lines: [] } as const;

describe("rectangles and clipping — SPEC-geometry §§1,4", () => {
  test("public design, toast and interaction constants match the specified values", () => {
    expect(DESIGN).toEqual({ width: 390, height: 844 });
    expect(TOAST).toEqual({ width: 300, height: 240 });
    expect([MIN_GAP, DEFAULT_GAP, MAX_FAN_DEGREES, DEFAULT_FAN_DEGREES,
      MIN_PIECE_WIDTH, SNAP_LINE_MIN_WIDTH, TAP_SLOP]).toEqual([4, 6, 10, 6, 32, 2, 10]);
  });

  test("toastPolygon is the centred rectangle for supplied dimensions", () => {
    const corners = toastPolygon({ width: 80, height: 60 });
    expect(corners).toHaveLength(4);
    expect(corners).toEqual(expect.arrayContaining([p(-40, -30), p(40, -30), p(40, 30), p(-40, 30)]));
    expect(polygonArea(corners)).toBe(4800);
  });

  test("empty, point, segment and collinear polygons have zero area", () => {
    for (const poly of [[], [p(2, 3)], [p(2, 3), p(7, 9)], [p(0, 0), p(1, 1), p(2, 2)]]) {
      expect(polygonArea(poly)).toBe(0);
    }
  });

  test("polygonArea is absolute regardless of winding", () => {
    const triangle = [p(-3, 2), p(5, 2), p(-3, 8)];
    expect(polygonArea(triangle)).toBe(24);
    expect(polygonArea([...triangle].reverse())).toBe(24);
  });

  test("clipping empty polygons returns an empty polygon", () => {
    expect(clipHalfPlane([], 1, 0, 0)).toEqual([]);
  });

  test("clipping wholly outside polygons returns an empty polygon", () => {
    expect(clipHalfPlane(toastPolygon(TOAST), 1, 0, -151)).toEqual([]);
    expect(clipHalfPlane(toastPolygon(TOAST), 0, -1, -121)).toEqual([]);
  });

  test("half-plane clipping keeps the boundary and produces finite intersections", () => {
    const clipped = clipHalfPlane(toastPolygon(TOAST), 1, 0, 0);
    expect(polygonArea(clipped)).toBeCloseTo(36000, 6);
    expect(clipped.every(v => v.x <= 0 && Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true);
    const diagonal = clipHalfPlane(toastPolygon(TOAST), 1, 1, 0);
    expect(polygonArea(diagonal)).toBeCloseTo(36000, 6);
    expect(diagonal.every(v => v.x + v.y <= 1e-9 && Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true);
  });

  test("every supported denominator yields four-corner strips of equal area and correct extent", () => {
    for (let d = 2; d <= 12; d++) {
      let total = 0;
      for (let k = 0; k < d; k++) {
        const poly = stripPolygon(TOAST, d, k);
        expect(poly).toHaveLength(4);
        expect(Math.min(...poly.map(v => v.x))).toBeCloseTo(-150 + k * 300 / d, 9);
        expect(Math.max(...poly.map(v => v.x))).toBeCloseTo(-150 + (k + 1) * 300 / d, 9);
        expect(Math.min(...poly.map(v => v.y))).toBe(-120);
        expect(Math.max(...poly.map(v => v.y))).toBe(120);
        const area = polygonArea(poly);
        expect(Math.abs(area - 72000 / d)).toBeLessThanOrEqual(1e-6);
        total += area;
      }
      expect(total).toBeCloseTo(72000, 6);
    }
    expect(polygonArea(stripPolygon({ width: 120, height: 80 }, 3, 1))).toBe(3200);
  });

  test("snap and strip functions reject invalid denominators", () => {
    for (const d of [1, 13, 0, -2, 2.5, NaN, Infinity]) {
      expect(() => snapLineX(TOAST, d, 1)).toThrow(RangeError);
      expect(() => stripPolygon(TOAST, d, 0)).toThrow(RangeError);
    }
  });

  test("snap and strip indices must be integers in their respective ranges", () => {
    for (const i of [0, 4, -1, 1.5, NaN, Infinity]) {
      expect(() => snapLineX(TOAST, 4, i)).toThrow(RangeError);
    }
    for (const k of [-1, 4, 0.5, NaN, Infinity]) {
      expect(() => stripPolygon(TOAST, 4, k)).toThrow(RangeError);
    }
    expect([1, 2, 3].map(i => snapLineX(TOAST, 4, i))).toEqual([-75, 0, 75]);
  });

  test("forgiveness is exactly W/(3d), including both snap boundaries", () => {
    expect(forgivenessRadius(TOAST, 4)).toBe(25);
    expect(forgivenessRadius({ width: 180, height: 400 }, 6)).toBe(10);
    expect(snapToLine(TOAST, 4, -100)).toBe(1);
    expect(snapToLine(TOAST, 4, -50)).toBe(1);
    expect(snapToLine(TOAST, 4, -75)).toBe(1);
  });

  test("snapToLine does not fill the dead zones or snap to toast edges", () => {
    for (const x of [-150, 150, -100.001, -49.999, -37.5, 200]) {
      expect(snapToLine(TOAST, 4, x)).toBeNull();
    }
  });
});

describe("swipe resolution — SPEC-geometry §6", () => {
  test("one sparse segment cuts every crossed line in ascending order", () => {
    expect(resolveSwipe(TOAST, 8, [p(200, 0), p(-200, 0)])).toEqual({
      kind: "across", lines: [1, 2, 3, 4, 5, 6, 7],
    });
  });

  test("crossing only lines two and three of eighths cuts exactly those lines", () => {
    expect(resolveSwipe(TOAST, 8, [p(-90, 0), p(-30, 0)])).toEqual({ kind: "across", lines: [2, 3] });
  });

  test("intermediate segments count even when both endpoints are outside above the toast", () => {
    expect(resolveSwipe(TOAST, 4, [p(-140, -200), p(140, 0), p(-140, -200)])).toEqual({
      kind: "across", lines: [2, 3],
    });
  });

  test("zigzags crossing the same lines repeatedly cut each just once", () => {
    expect(resolveSwipe(TOAST, 4, [p(-140, 0), p(140, 0), p(-140, 20), p(140, 40)])).toEqual({
      kind: "across", lines: [1, 2, 3],
    });
  });

  test("alreadyCut lines are excluded from new cuts", () => {
    expect(resolveSwipe(TOAST, 8, [p(-200, 0), p(200, 0)], [6, 2, 4])).toEqual({
      kind: "across", lines: [1, 3, 5, 7],
    });
  });

  test("an across crossing remains across when all crossed lines were already cut", () => {
    expect(resolveSwipe(TOAST, 2, [p(-10, -100), p(10, 100)], [1])).toEqual({ kind: "across", lines: [] });
  });

  test("off-toast swipes cannot cut either across or along", () => {
    expect(resolveSwipe(TOAST, 4, [p(200, -200), p(200, 200)])).toEqual(none);
    expect(resolveSwipe(TOAST, 4, [p(-200, 200), p(200, 200)])).toEqual(none);
  });

  test("horizontal swipes along the exact top or bottom edge do not cut", () => {
    for (const y of [-120, 120]) {
      expect(resolveSwipe(TOAST, 4, [p(-200, y), p(200, y)])).toEqual(none);
    }
  });

  test("a segment grazing a toast corner does not cut", () => {
    expect(resolveSwipe(TOAST, 4, [p(-200, -70), p(-100, -170)])).toEqual(none);
  });

  test("crossings of line extensions above or below the toast do not cut", () => {
    for (const y of [-120.001, 120.001]) {
      expect(resolveSwipe(TOAST, 4, [p(-140, y), p(140, y)])).toEqual(none);
    }
  });

  test("the side convention counts arrival from the left but not departure to the right", () => {
    expect(resolveSwipe(TOAST, 2, [p(-10, 0), p(0, 0)])).toEqual({ kind: "across", lines: [1] });
    expect(resolveSwipe(TOAST, 2, [p(0, 0), p(10, 0)])).toEqual(none);
    expect(resolveSwipe(TOAST, 2, [p(0, 0), p(-10, 0)])).toEqual({ kind: "across", lines: [1] });
  });

  test("non-finite points and consecutive duplicates are removed before segments are joined", () => {
    expect(resolveSwipe(TOAST, 4, [p(-140, 0), p(-140, 0), p(NaN, 20), p(20, Infinity), p(140, 0)])).toEqual({
      kind: "across", lines: [1, 2, 3],
    });
  });

  test("fewer than two distinct finite points cannot cut", () => {
    for (const path of [[], [p(0, 0)], [p(0, 0), p(0, 0)], [p(NaN, 0), p(0, Infinity)], [p(0, 0), p(-Infinity, 0)]]) {
      expect(resolveSwipe(TOAST, 4, path)).toEqual(none);
    }
  });

  test("near-parallel paths qualify at the inclusive forgiveness boundary", () => {
    expect(resolveSwipe(TOAST, 4, [p(1, -60), p(25, 60)])).toEqual({ kind: "along", lines: [2] });
    expect(resolveSwipe(TOAST, 4, [p(-25, -60), p(-25, 60)])).toEqual({ kind: "along", lines: [2] });
  });

  test("one inside point outside the forgiveness corridor prevents along", () => {
    expect(resolveSwipe(TOAST, 4, [p(1, -100), p(25.001, 0), p(1, 100)])).toEqual(none);
  });

  test("along requires at least half height, inclusive at exactly half", () => {
    expect(resolveSwipe(TOAST, 4, [p(10, -60), p(10, 60)])).toEqual({ kind: "along", lines: [2] });
    expect(resolveSwipe(TOAST, 4, [p(10, -59.999), p(10, 60)])).toEqual(none);
  });

  test("coverage is measured after clipping rather than by the full path height", () => {
    // At y=-120 the segment enters at x=10; inside y span is only 60.
    expect(resolveSwipe(TOAST, 2, [p(10, -500), p(10, -60)])).toEqual(none);
  });

  test("outside endpoints can yield a full-height along cut after clipping", () => {
    expect(resolveSwipe(TOAST, 4, [p(20, -500), p(20, 500)])).toEqual({ kind: "along", lines: [2] });
    // Outside x=-90 is beyond line 1's corridor; only the clipped part matters.
    expect(resolveSwipe(TOAST, 2, [p(-90, -300), p(30, -60), p(30, 100)])).toEqual({ kind: "along", lines: [1] });
  });

  test("an across crossing takes precedence over an otherwise qualifying along corridor", () => {
    expect(resolveSwipe(TOAST, 4, [p(-1, -100), p(1, 100)])).toEqual({ kind: "across", lines: [2] });
  });

  test("an along cut of an already cut line yields along with no new lines", () => {
    expect(resolveSwipe(TOAST, 4, [p(10, -100), p(10, 100)], [2])).toEqual({ kind: "along", lines: [] });
  });

  test("resolution does not mutate points, path, toast or alreadyCut", () => {
    const path = Object.freeze([Object.freeze(p(-140, 0)), Object.freeze(p(140, 0))]);
    const cuts = Object.freeze([2]);
    const toast = Object.freeze({ width: 300, height: 240 });
    expect(resolveSwipe(toast, 4, path, cuts)).toEqual({ kind: "across", lines: [1, 3] });
    expect(path).toEqual([p(-140, 0), p(140, 0)]);
    expect(cuts).toEqual([2]);
    expect(toast).toEqual({ width: 300, height: 240 });
  });
});

// Bounds of the actual rotated rectangles, not merely distances between centres.
function groupBounds(layout: PieceLayout[], d: number) {
  const groups = [...new Set(layout.map(v => v.group))];
  return groups.map(group => {
    const members = layout.filter(v => v.group === group);
    const boxes = members.map(v => {
      const a = v.angle * Math.PI / 180;
      const halfX = Math.abs(Math.cos(a)) * 300 / d / 2 + Math.abs(Math.sin(a)) * 120;
      return { left: v.x - halfX, right: v.x + halfX };
    });
    return { left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)) };
  });
}

describe("groups, cut layout and slots — SPEC-geometry §§7–9", () => {
  test("groupsOf returns maximal joined runs in strip order even for unsorted cuts", () => {
    expect(groupsOf(8, [6, 2, 3])).toEqual([
      { start: 0, end: 1 }, { start: 2, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 7 },
    ]);
  });

  test("no cuts form one group and all cuts form individual strips", () => {
    expect(groupsOf(4, [])).toEqual([{ start: 0, end: 3 }]);
    expect(groupsOf(4, [1, 2, 3])).toEqual([
      { start: 0, end: 0 }, { start: 1, end: 1 }, { start: 2, end: 2 }, { start: 3, end: 3 },
    ]);
  });

  test("separation requires both internal neighbours, but only one at an edge", () => {
    expect([0, 1, 2, 3].map(k => isSeparated(4, [1, 3], k))).toEqual([true, false, false, true]);
    expect([0, 1, 2, 3].map(k => isSeparated(4, [1, 2], k))).toEqual([true, true, false, false]);
    expect([0, 1].map(k => isSeparated(2, [], k))).toEqual([false, false]);
    expect([0, 1].map(k => isSeparated(2, [1], k))).toEqual([true, true]);
  });

  test("invalid cut sets throw RangeError in groupsOf and isSeparated", () => {
    for (const cuts of [[0], [4], [-1], [1, 1], [1.5], [NaN], [Infinity]]) {
      expect(() => groupsOf(4, cuts)).toThrow(RangeError);
      expect(() => isSeparated(4, cuts, 0)).toThrow(RangeError);
    }
  });

  test("an uncut layout retains every original centre and zero angle", () => {
    expect(layoutCut(TOAST, 4, [], { gap: 100, fanDegrees: 10 })).toEqual([
      { index: 0, group: 0, x: -112.5, y: 0, angle: 0 },
      { index: 1, group: 0, x: -37.5, y: 0, angle: 0 },
      { index: 2, group: 0, x: 37.5, y: 0, angle: 0 },
      { index: 3, group: 0, x: 112.5, y: 0, angle: 0 },
    ]);
  });

  test("rotated groups keep order, equal bounding-box gaps and a centred row without overlap", () => {
    for (const cuts of [[1, 2, 3, 4, 5, 6, 7], [1, 4, 6], [2]]) {
      const layout = layoutCut(TOAST, 8, cuts, { gap: 7, fanDegrees: 10 });
      expect(layout.map(v => v.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      const groups = groupsOf(8, cuts);
      const boxes = groupBounds(layout, 8);
      groups.forEach((group, g) => {
        for (let k = group.start; k <= group.end; k++) {
          expect(layout[k]!.group).toBe(g);
          expect(layout[k]!.angle).toBeCloseTo(-5 + 10 * g / (groups.length - 1), 10);
        }
        if (g > 0) {
          expect(boxes[g]!.left).toBeGreaterThan(boxes[g - 1]!.right);
          expect(boxes[g]!.left - boxes[g - 1]!.right).toBeCloseTo(7, 9);
        }
      });
      expect(boxes[0]!.left + boxes[boxes.length - 1]!.right).toBeCloseTo(0, 9);
    }
  });

  test("joined strips rotate rigidly about a group centre whose y stays zero", () => {
    const layout = layoutCut(TOAST, 8, [2, 6], { fanDegrees: 10 });
    for (const g of [0, 1, 2]) {
      const members = layout.filter(v => v.group === g);
      const centreY = members.reduce((sum, v) => sum + v.y, 0) / members.length;
      expect(centreY).toBeCloseTo(0, 10);
      for (let i = 1; i < members.length; i++) {
        const a = members[i - 1]!;
        const b = members[i]!;
        expect(b.angle).toBe(a.angle);
        expect(b.x - a.x).toBeCloseTo(37.5 * Math.cos(a.angle * Math.PI / 180), 9);
        expect(b.y - a.y).toBeCloseTo(37.5 * Math.sin(a.angle * Math.PI / 180), 9);
      }
    }
  });

  test("gap clamps to MIN_GAP and preserves larger requested gaps", () => {
    for (const gap of [-100, 0, 3, 4, 30]) {
      const boxes = groupBounds(layoutCut(TOAST, 4, [1, 2, 3], { gap, fanDegrees: 0 }), 4);
      for (let g = 1; g < boxes.length; g++) {
        expect(boxes[g]!.left - boxes[g - 1]!.right).toBeCloseTo(Math.max(4, gap), 10);
      }
    }
  });

  test("fan clamps to zero or ten and interpolates evenly between groups", () => {
    for (const [requested, expected] of [[-20, 0], [0, 0], [6, 6], [10, 10], [100, 10]]) {
      const angles = layoutCut(TOAST, 4, [1, 2, 3], { fanDegrees: requested! }).map(v => v.angle);
      angles.forEach((angle, g) => expect(angle).toBeCloseTo(-expected! / 2 + expected! * g / 3, 10));
      expect(Math.max(...angles) - Math.min(...angles)).toBeLessThanOrEqual(10);
    }
  });

  test("missing and non-finite layout options use the documented defaults", () => {
    const explicit = layoutCut(TOAST, 4, [1, 3], { gap: 6, fanDegrees: 6 });
    expect(layoutCut(TOAST, 4, [1, 3])).toEqual(explicit);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(layoutCut(TOAST, 4, [1, 3], { gap: bad })).toEqual(explicit);
      expect(layoutCut(TOAST, 4, [1, 3], { fanDegrees: bad })).toEqual(explicit);
      expect(layoutCut(TOAST, 4, [1, 3], { gap: bad, fanDegrees: bad })).toEqual(explicit);
    }
  });

  test("plateSlots splits an offset rectangle into full-height slots left to right", () => {
    expect(plateSlots({ x: 10, y: -20, width: 300, height: 240 }, 4)).toEqual([
      { x: 10, y: -20, width: 75, height: 240 }, { x: 85, y: -20, width: 75, height: 240 },
      { x: 160, y: -20, width: 75, height: 240 }, { x: 235, y: -20, width: 75, height: 240 },
    ]);
    const slots = plateSlots({ x: -7, y: 3, width: 100, height: 50 }, 3);
    expect(slots).toHaveLength(3);
    slots.forEach((slot, j) => {
      expect(slot.x).toBeCloseTo(-7 + j * 100 / 3, 10);
      expect(slot.width).toBeCloseTo(100 / 3, 10);
      expect(slot.y).toBe(3);
      expect(slot.height).toBe(50);
    });
  });

  test("clipping, groups, layout and slots preserve frozen inputs", () => {
    const poly = Object.freeze(toastPolygon(TOAST).map(v => Object.freeze(v)));
    const before = poly.map(v => ({ ...v }));
    const cuts = Object.freeze([3, 1]);
    const opts = Object.freeze({ gap: -10, fanDegrees: 99 });
    const rect = Object.freeze({ x: 10, y: 20, width: 300, height: 240 });
    clipHalfPlane(poly, 1, 0, 0);
    polygonArea(poly);
    groupsOf(4, cuts);
    layoutCut(TOAST, 4, cuts, opts);
    plateSlots(rect, 4);
    expect(poly).toEqual(before);
    expect(cuts).toEqual([3, 1]);
    expect(opts).toEqual({ gap: -10, fanDegrees: 99 });
    expect(rect).toEqual({ x: 10, y: 20, width: 300, height: 240 });
  });
});
