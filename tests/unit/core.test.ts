import { describe, expect, test } from "bun:test";
import * as C from "@core";

const T = C.TOAST;

describe("rational", () => {
  test("normalises sign and gcd", () => {
    expect(C.rat(2, -4)).toEqual({ n: -1, d: 2 });
    expect(C.rat(0, -7)).toEqual({ n: 0, d: 1 });
    expect(C.rat(6, 8)).toEqual({ n: 3, d: 4 });
  });
  test("rejects zero and non-integers", () => {
    expect(() => C.rat(1, 0)).toThrow(RangeError);
    expect(() => C.rat(0.5, 2)).toThrow(RangeError);
    expect(() => C.rat(Number.NaN)).toThrow(RangeError);
  });
  test("arithmetic is exact", () => {
    expect(C.add(C.rat(1, 6), C.rat(1, 3))).toEqual(C.rat(1, 2));
    expect(C.sub(C.rat(3, 8), C.rat(1, 8))).toEqual(C.rat(1, 4));
    expect(C.mul(C.rat(3, 8), C.rat(8))).toEqual(C.rat(3));
    expect(C.div(C.rat(1, 2), C.rat(1, 4))).toEqual(C.rat(2));
    expect(() => C.div(C.rat(1), C.rat(0))).toThrow(RangeError);
    expect(C.cmp(C.rat(3, 6), C.rat(3, 8))).toBe(1);
    expect(C.cmp(C.rat(2, 6), C.rat(3, 8))).toBe(-1);
    expect(C.eq(C.rat(4, 8), C.rat(1, 2))).toBe(true);
  });
  test("isRational", () => {
    expect(C.isRational(C.rat(1, 3))).toBe(true);
    expect(C.isRational({ n: 2, d: 4 })).toBe(false);
    expect(C.isRational({ n: 1, d: 0 })).toBe(false);
    expect(C.isRational(null)).toBe(false);
  });
});

describe("geometry", () => {
  test("snap lines are evenly spaced inside the toast", () => {
    expect(C.snapLineX(T, 2, 1)).toBe(0);
    expect(C.snapLineX(T, 8, 3)).toBeCloseTo(-150 + 112.5, 9);
    expect(() => C.snapLineX(T, 8, 0)).toThrow(RangeError);
    expect(() => C.snapLineX(T, 8, 8)).toThrow(RangeError);
    expect(() => C.snapLineX(T, 1, 1)).toThrow(RangeError);
    expect(() => C.snapLineX(T, 13, 1)).toThrow(RangeError);
  });
  test("strips tile the toast with equal floating areas", () => {
    for (const d of [2, 3, 4, 5, 6, 8, 10, 12]) {
      let sum = 0;
      for (let k = 0; k < d; k++) {
        const a = C.polygonArea(C.stripPolygon(T, d, k));
        expect(a).toBeCloseTo((300 * 240) / d, 6);
        sum += a;
      }
      expect(sum).toBeCloseTo(300 * 240, 6);
    }
  });
  test("clipping edge cases", () => {
    const sq = C.toastPolygon(T);
    expect(C.clipHalfPlane([], 1, 0, 0)).toEqual([]);
    expect(C.clipHalfPlane(sq, 1, 0, -1000)).toEqual([]);
    expect(C.polygonArea(C.clipHalfPlane(sq, 1, 0, 1000))).toBeCloseTo(72000, 6);
    expect(C.polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
  test("letterbox transform round trips, recomputed after rotation", () => {
    const portrait = C.fitPlayfield(1024, 1366);
    const landscape = C.fitPlayfield(1366, 1024);
    expect(portrait.scale).toBeCloseTo(1366 / 844 < 1024 / 390 ? 1366 / 844 : 1024 / 390, 9);
    expect(landscape.scale).toBeCloseTo(1024 / 844, 9);
    for (const vt of [portrait, landscape, C.fitPlayfield(390, 844)]) {
      const p = { x: 123.4, y: 567.8 };
      const q = C.viewToDesign(vt, C.designToView(vt, p));
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
    expect(C.viewToDesign(landscape, { x: 1, y: 500 }).x).toBeLessThan(0);
    expect(() => C.fitPlayfield(0, 100)).toThrow(RangeError);
    expect(() => C.fitPlayfield(Infinity, 100)).toThrow(RangeError);
  });
  test("pose transforms round trip", () => {
    const pose = { x: 195, y: 330, angle: 0.3 };
    const p = { x: 40, y: -20 };
    const w = C.localToWorld(pose, p);
    const back = C.worldToLocal(pose, w);
    expect(back.x).toBeCloseTo(40, 9);
    expect(back.y).toBeCloseTo(-20, 9);
  });
  test("plate slots", () => {
    const s = C.plateSlots({ x: 10, y: 20, width: 180, height: 144 }, 8);
    expect(s).toHaveLength(8);
    expect(s[0]!.x).toBe(10);
    expect(s[7]!.x + s[7]!.width).toBe(190);
    expect(s[3]!.width).toBeCloseTo(22.5, 9);
  });
});

describe("gestures", () => {
  const S = (phase: C.PointerPhase, pointerId: number, x: number, y: number, t = 0) => ({ phase, pointerId, x, y, t });
  test("swipe and tap", () => {
    const g = C.createGestureTracker();
    expect(g.feed(S("down", 1, 0, 0))?.kind).toBe("start");
    g.feed(S("move", 1, 30, 0, 10));
    const e = g.feed(S("up", 1, 60, 0, 20));
    expect(e?.kind).toBe("swipe");
    if (e?.kind === "swipe") {
      expect(e.path).toHaveLength(3);
      expect(e.duration).toBe(20);
    }
    g.feed(S("down", 2, 5, 5));
    expect(g.feed(S("up", 2, 7, 5))?.kind).toBe("tap");
  });
  test("first finger wins, second ignored", () => {
    const g = C.createGestureTracker();
    g.feed(S("down", 1, 0, 0));
    expect(g.feed(S("down", 2, 50, 50))).toBeNull();
    expect(g.feed(S("up", 2, 90, 90))).toBeNull();
    expect(g.activePointer).toBe(1);
    const e = g.feed(S("up", 1, 100, 0));
    expect(e?.kind).toBe("swipe");
  });
  test("cancel and lost capture never cut", () => {
    const g = C.createGestureTracker();
    g.feed(S("down", 1, 0, 0));
    g.feed(S("move", 1, 100, 0));
    expect(g.feed(S("lostcapture", 1, 100, 0))?.kind).toBe("cancelled");
    expect(g.activePointer).toBeNull();
    expect(g.feed(S("up", 1, 200, 0))).toBeNull();
    g.feed(S("down", 3, 0, 0));
    expect(g.feed(S("up", 3, 100, 0))?.kind).toBe("swipe");
    expect(g.feed(S("lostcapture", 3, 100, 0))).toBeNull();
  });
  test("non-finite samples dropped", () => {
    const g = C.createGestureTracker();
    expect(g.feed(S("down", 1, Number.NaN, 0))).toBeNull();
    g.feed(S("down", 1, 0, 0));
    g.feed(S("move", 1, Number.POSITIVE_INFINITY, 0));
    const e = g.feed(S("up", 1, 50, 0));
    expect(e?.kind === "swipe" && e.path.length).toBe(2);
  });
});

describe("swipes", () => {
  test("a horizontal swipe across cuts every line", () => {
    expect(C.resolveSwipe(T, 8, [{ x: -200, y: 0 }, { x: 200, y: 0 }])).toEqual({ kind: "across", lines: [1, 2, 3, 4, 5, 6, 7] });
  });
  test("a partial swipe cuts only the lines it crosses", () => {
    const x2 = C.snapLineX(T, 8, 2);
    const x3 = C.snapLineX(T, 8, 3);
    const r = C.resolveSwipe(T, 8, [{ x: x2 - 5, y: 10 }, { x: x3 + 5, y: 12 }]);
    expect(r).toEqual({ kind: "across", lines: [2, 3] });
  });
  test("sparse fast samples still cut everything crossed", () => {
    const r = C.resolveSwipe(T, 6, [{ x: -1000, y: -50 }, { x: 1000, y: 50 }]);
    expect(r.lines).toEqual([1, 2, 3, 4, 5]);
  });
  test("off-toast and corner grazes cut nothing", () => {
    expect(C.resolveSwipe(T, 4, [{ x: -200, y: -130 }, { x: 200, y: -130 }]).kind).toBe("none");
    expect(C.resolveSwipe(T, 4, [{ x: -200, y: -120 }, { x: 200, y: -120 }]).kind).toBe("none");
    expect(C.resolveSwipe(T, 4, [{ x: -160, y: -110 }, { x: -140, y: -130 }]).kind).toBe("none");
  });
  test("along with forgiveness snaps to the nearest line", () => {
    const x = C.snapLineX(T, 4, 1);
    const r = C.forgivenessRadius(T, 4);
    expect(r).toBe(25);
    expect(C.resolveSwipe(T, 4, [{ x: x + 20, y: -130 }, { x: x + 20, y: 130 }])).toEqual({ kind: "along", lines: [1] });
    expect(C.resolveSwipe(T, 4, [{ x: x + 26, y: -130 }, { x: x + 26, y: 130 }]).kind).toBe("none");
    expect(C.resolveSwipe(T, 4, [{ x: x + 10, y: 0 }, { x: x + 10, y: 50 }]).kind).toBe("none");
    expect(C.resolveSwipe(T, 4, [{ x: x + 10, y: -130 }, { x: x + 10, y: 130 }], [1])).toEqual({ kind: "along", lines: [] });
    expect(C.snapToLine(T, 4, x - 24)).toBe(1);
    expect(C.snapToLine(T, 4, x - 26)).toBeNull();
  });
  test("zigzag counts once and already-cut lines are excluded", () => {
    const r = C.resolveSwipe(T, 2, [{ x: -10, y: 0 }, { x: 10, y: 0 }, { x: -10, y: 5 }, { x: 10, y: 5 }]);
    expect(r).toEqual({ kind: "across", lines: [1] });
    expect(C.resolveSwipe(T, 2, [{ x: -10, y: 0 }, { x: 10, y: 0 }], [1])).toEqual({ kind: "across", lines: [] });
  });
  test("degenerate paths", () => {
    expect(C.resolveSwipe(T, 4, []).kind).toBe("none");
    expect(C.resolveSwipe(T, 4, [{ x: 0, y: 0 }, { x: 0, y: 0 }]).kind).toBe("none");
    expect(C.resolveSwipe(T, 4, [{ x: Number.NaN, y: 0 }, { x: 10, y: 0 }]).kind).toBe("none");
  });
});

describe("groups and layout", () => {
  test("groups", () => {
    expect(C.groupsOf(4, [])).toEqual([{ start: 0, end: 3 }]);
    expect(C.groupsOf(4, [2])).toEqual([{ start: 0, end: 1 }, { start: 2, end: 3 }]);
    expect(C.groupsOf(3, [1, 2])).toHaveLength(3);
    expect(() => C.groupsOf(4, [4])).toThrow(RangeError);
    expect(() => C.groupsOf(4, [1, 1])).toThrow(RangeError);
    expect(C.isSeparated(4, [1], 0)).toBe(true);
    expect(C.isSeparated(4, [1], 1)).toBe(false);
    expect(C.isSeparated(4, [1, 2], 1)).toBe(true);
  });
  test("layout: equal gaps, bounded fan, order kept, no overlap", () => {
    for (const d of [2, 3, 4, 5, 6, 8]) {
      const all = Array.from({ length: d - 1 }, (_, i) => i + 1);
      const L = C.layoutCut(T, d, all, { fanDegrees: 10, gap: 4 });
      const w = 300 / d;
      const boxes = L.map((p) => {
        const a = (Math.abs(p.angle) * Math.PI) / 180;
        const hw = (w / 2) * Math.cos(a) + 120 * Math.sin(a);
        return [p.x - hw, p.x + hw] as const;
      });
      for (let i = 1; i < d; i++) {
        expect(L[i]!.x).toBeGreaterThan(L[i - 1]!.x);
        expect(boxes[i]![0] - boxes[i - 1]![1]).toBeCloseTo(4, 9);
      }
      for (const p of L) expect(Math.abs(p.angle)).toBeLessThanOrEqual(5);
    }
  });
  test("layout clamps gap and fan", () => {
    const L = C.layoutCut(T, 2, [1], { gap: 0, fanDegrees: 99 });
    expect(L[0]!.angle).toBe(-5);
    const uncut = C.layoutCut(T, 4, []);
    expect(uncut.map((p) => p.x)).toEqual([-112.5, -37.5, 37.5, 112.5]);
  });
});

describe("serve", () => {
  const three8 = C.rat(3, 8);
  test("three eighths on sixths says Not yet on the third piece", () => {
    let p = C.emptyPlate(three8);
    const P = C.makePartition("t1", 6);
    const outs: string[] = [];
    for (const piece of P.pieces.slice(0, 3)) {
      const r = C.serve(p, piece);
      outs.push(r.outcome);
      p = r.plate;
    }
    expect(outs).toEqual(["placed", "placed", "notYet"]);
    expect(p.served).toHaveLength(2);
  });
  test("three eighths on eighths matches, then closes", () => {
    let p = C.emptyPlate(three8);
    const P = C.makePartition("t2", 8);
    const r1 = C.serve(p, P.pieces[5]!);
    expect(C.serve(r1.plate, P.pieces[5]!).outcome).toBe("duplicate");
    p = C.serve(C.serve(r1.plate, P.pieces[0]!).plate, P.pieces[7]!).plate;
    expect(p.matched).toBe(true);
    expect(C.serve(p, P.pieces[1]!).outcome).toBe("closed");
  });
  test("pieces from two partitions are refused", () => {
    const a = C.makePartition("a", 4);
    const b = C.makePartition("b", 4);
    const p = C.serve(C.emptyPlate(C.rat(3, 4)), a.pieces[0]!).plate;
    expect(C.serve(p, b.pieces[1]!).outcome).toBe("otherPartition");
  });
  test("invalid sizes and canFill", () => {
    const bad = { id: "x:0", partitionId: "x", denominator: 2, index: 0, size: { n: 0, d: 1 } };
    expect(C.serve(C.emptyPlate(C.rat(1, 2)), bad).outcome).toBe("invalid");
    expect(C.canFill(C.rat(1, 2), 4)).toBe(true);
    expect(C.canFill(C.rat(3, 8), 6)).toBe(false);
    expect(C.canFill(C.rat(1, 3), 6)).toBe(true);
  });
});

describe("orders", () => {
  test("dials", () => {
    expect(C.dialFor("P1")).toEqual([2, 4]);
    expect(C.dialFor("P2")).toEqual([2, 3, 4, 5, 6, 8]);
    expect(C.dialAllowedByWidth(C.DIAL_CANDIDATES, 300, 32)).toEqual([2, 3, 4, 5, 6, 8]);
    expect(C.dialAllowedByWidth(C.DIAL_CANDIDATES, 360, 30)).toEqual([2, 3, 4, 5, 6, 8, 10, 12]);
  });
  test("spaces", () => {
    expect(C.orderSpace("P1").map((o) => o.id)).toEqual(["P1-1-2", "P1-1-4", "P1-3-4"]);
    expect(C.orderSpace("P2")).toHaveLength(15);
    for (const o of [...C.orderSpace("P1"), ...C.orderSpace("P2")]) {
      expect(o.spoken.endsWith(" of the toast")).toBe(true);
      expect(o.stacked).toBe(o.level === "P2");
    }
    expect(() => C.makeOrder("P2", 2, 4)).toThrow(RangeError);
    expect(() => C.makeOrder("P1", 3, 8)).toThrow(RangeError);
  });
  test("spoken and labels", () => {
    expect(C.spokenOrder(1, 2)).toBe("half of the toast");
    expect(C.spokenOrder(1, 4)).toBe("a quarter of the toast");
    expect(C.spokenOrder(1, 8)).toBe("an eighth of the toast");
    expect(C.spokenOrder(3, 8)).toBe("three eighths of the toast");
    expect(C.spokenOrder(11, 12)).toBe("eleven twelfths of the toast");
    expect(() => C.spokenOrder(1, 7)).toThrow(RangeError);
    expect(C.labelFor(C.makeOrder("P2", 3, 8))).toEqual({ words: "three eighths", stacked: { numerator: 3, denominator: 8 } });
    expect(C.labelFor(C.makeOrder("P1", 1, 4))).toEqual({ words: "quarter", stacked: null });
  });
  test("solve and marks", () => {
    const o = C.makeOrder("P2", 1, 3);
    const s = C.solveOrder(o, C.dialFor("P2"));
    expect(s.smartChoice).toBe(3);
    expect(s.choices.find((c) => c.pieces === 6)).toEqual({ pieces: 6, canFill: true, piecesNeeded: 2 });
    const dial = C.dialFor("P2");
    expect(C.marksFor(o, dial, { notYets: 0, finalDenominator: 3, swipesOnFinal: 1 })).toEqual({ exact: true, smart: true, tidy: true });
    expect(C.marksFor(o, dial, { notYets: 1, finalDenominator: 6, swipesOnFinal: 2 })).toEqual({ exact: false, smart: false, tidy: false });
    expect(() => C.marksFor(o, dial, { notYets: -1, finalDenominator: 3, swipesOnFinal: 1 })).toThrow(RangeError);
    expect(() => C.marksFor(o, dial, { notYets: 0, finalDenominator: 7, swipesOnFinal: 1 })).toThrow(RangeError);
  });
  test("generator", () => {
    const a = C.generateShift("P2", 50, C.createRng(42)).map((o) => o.id);
    const b = C.generateShift("P2", 50, C.createRng(42)).map((o) => o.id);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
    expect(() => C.generateShift("P1", 0, C.createRng(1))).toThrow(RangeError);
    const r = C.createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v >= 0 && v < 1).toBe(true);
    }
    expect(C.DEMO_ORDERS.map((o) => o.spoken)).toEqual(["half of the toast", "a quarter of the toast", "three eighths of the toast"]);
  });
});

describe("rational exactness near the safe limit (Codex review round 1)", () => {
  test("add and sub never round intermediates", () => {
    const m = Number.MAX_SAFE_INTEGER;
    expect(C.add(C.rat(m, 2), C.rat(-m, 3))).toEqual({ n: m, d: 6 });
    expect(C.sub(C.rat(m, 2), C.rat(m, 3))).toEqual({ n: m, d: 6 });
    expect(() => C.add(C.rat(m), C.rat(m))).toThrow(RangeError);
    expect(C.mul(C.rat(m, 3), C.rat(3, m))).toEqual({ n: 1, d: 1 });
  });
});

describe("later swipes resolve against the groups as drawn (Codex review round 1)", () => {
  const d = 8;
  const cut = [1, 2, 3, 4, 5];
  const layout = C.layoutCut(T, d, cut, { gap: 5, fanDegrees: 2 });
  const groups = C.groupsOf(d, cut).map((g) => {
    const s = layout.filter((L) => L.index >= g.start && L.index <= g.end);
    return { start: g.start, end: g.end, x: s.reduce((t, L) => t + L.x, 0) / s.length, y: s.reduce((t, L) => t + L.y, 0) / s.length, angle: s[0]!.angle };
  });
  const last = groups[groups.length - 1]!;
  // Where line 6 is drawn now: the group's turn applied about its drawn centre.
  const ox = (C.snapLineX(T, d, 5) + 150) / 2;
  const a = (last.angle * Math.PI) / 180;
  const off = C.snapLineX(T, d, 6) - ox;
  const drawn = { x: last.x + off * Math.cos(a), y: last.y + off * Math.sin(a) };
  test("crossing the drawn line 6 cuts it, though the unseparated line 6 is elsewhere", () => {
    const path = [{ x: drawn.x - 6, y: drawn.y }, { x: drawn.x + 6, y: drawn.y }];
    expect(drawn.x - C.snapLineX(T, d, 6)).toBeGreaterThan(10);
    expect(C.resolveSwipeOnGroups(T, d, path, cut, groups)).toEqual({ kind: "across", lines: [6] });
  });
  test("a full sweep cuts the rest; nothing cut means plain resolveSwipe", () => {
    const sweep = [{ x: -220, y: 0 }, { x: 220, y: 0 }];
    expect(C.resolveSwipeOnGroups(T, d, sweep, cut, groups).lines).toEqual([6, 7]);
    const whole = [{ start: 0, end: 7, x: 0, y: 0, angle: 0 }];
    expect(C.resolveSwipeOnGroups(T, d, sweep, [], whole)).toEqual(C.resolveSwipe(T, d, sweep, []));
  });
});
