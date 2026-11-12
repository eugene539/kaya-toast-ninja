import { describe, test, expect } from "bun:test";
import {
  createGestureTracker, fitPlayfield, viewToDesign, designToView,
  worldToLocal, localToWorld, resolveSwipe, TOAST,
  type PointerPhase, type Vec2,
} from "@core";

const sample = (phase: PointerPhase, x = 0, y = 0, t = 0, pointerId = 1) =>
  ({ phase, pointerId, x, y, t });
const closePoint = (actual: Vec2, expected: Vec2) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

describe("pointer handling — SPEC-geometry §5", () => {
  test("down starts the first pointer at its down point", () => {
    const g = createGestureTracker();
    expect(g.activePointer).toBeNull();
    expect(g.feed(sample("down", 13, 21, 50, 7))).toEqual({
      kind: "start", pointerId: 7, at: { x: 13, y: 21 },
    });
    expect(g.activePointer).toBe(7);
  });

  test("a competing finger cannot move, end, or cancel the first gesture", () => {
    const g = createGestureTracker();
    g.feed(sample("down"));
    for (const phase of ["down", "move", "up", "cancel", "lostcapture"] as const) {
      expect(g.feed(sample(phase, 200, 300, 10, 2))).toBeNull();
      expect(g.activePointer).toBe(1);
    }
    expect(g.feed(sample("up", 20, 0, 25))).toEqual({
      kind: "swipe", pointerId: 1, path: [{ x: 0, y: 0 }, { x: 20, y: 0 }], duration: 25,
    });
  });

  test("repeated down by the active pointer preserves the original point and time", () => {
    const g = createGestureTracker();
    g.feed(sample("down", 0, 0, 100));
    expect(g.feed(sample("down", 500, 500, 110))).toBeNull();
    expect(g.feed(sample("up", 20, 0, 140))).toEqual({
      kind: "swipe", pointerId: 1, path: [{ x: 0, y: 0 }, { x: 20, y: 0 }], duration: 40,
    });
  });

  test("a path below default tapSlop returns the down point", () => {
    const g = createGestureTracker();
    g.feed(sample("down", 5, 8));
    g.feed(sample("move", 8, 12));
    expect(g.feed(sample("up", 8, 12, 20))).toEqual({
      kind: "tap", pointerId: 1, at: { x: 5, y: 8 },
    });
  });

  test("a path of exactly tapSlop is a swipe", () => {
    const g = createGestureTracker();
    g.feed(sample("down"));
    expect(g.feed(sample("up", 6, 8, 10))?.kind).toBe("swipe");
  });

  test("tapSlop measures total path length, not endpoint displacement", () => {
    const g = createGestureTracker();
    g.feed(sample("down"));
    g.feed(sample("move", 6));
    expect(g.feed(sample("up", 0, 0, 20))?.kind).toBe("swipe");
  });

  test("swipe contains every accepted down, move and up sample with elapsed time", () => {
    const g = createGestureTracker();
    g.feed(sample("down", 1, 2, 100));
    expect(g.feed(sample("move", 1, 2, 110))).toBeNull();
    g.feed(sample("move", 30, 40, 120));
    expect(g.feed(sample("up", 50, 60, 155))).toEqual({
      kind: "swipe", pointerId: 1,
      path: [{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 30, y: 40 }, { x: 50, y: 60 }],
      duration: 55,
    });
  });

  test("custom tapSlop controls the strict boundary", () => {
    const g = createGestureTracker({ tapSlop: 20 });
    g.feed(sample("down"));
    expect(g.feed(sample("up", 19))?.kind).toBe("tap");
    g.feed(sample("down"));
    expect(g.feed(sample("up", 20))?.kind).toBe("swipe");
  });

  test("up releases ownership so a new pointer can start", () => {
    const g = createGestureTracker();
    g.feed(sample("down"));
    g.feed(sample("up"));
    expect(g.activePointer).toBeNull();
    expect(g.feed(sample("down", 5, 6, 30, 2))?.kind).toBe("start");
    expect(g.activePointer).toBe(2);
  });

  for (const phase of ["cancel", "lostcapture"] as const) {
    test(`${phase} mid-swipe discards the path and yields no partial swipe`, () => {
      const g = createGestureTracker();
      g.feed(sample("down", -140));
      expect(g.feed(sample("move", 140))).toBeNull();
      expect(g.feed(sample(phase, 140))).toEqual({ kind: "cancelled", pointerId: 1 });
      expect(g.activePointer).toBeNull();
      expect(g.feed(sample("up", 150))).toBeNull();
      g.feed(sample("down", 9, 8, 100, 2));
      expect(g.feed(sample("up", 9, 8, 101, 2))).toEqual({
        kind: "tap", pointerId: 2, at: { x: 9, y: 8 },
      });
    });
  }

  test("lostcapture after up is ignored even while a different pointer is active", () => {
    const g = createGestureTracker();
    g.feed(sample("down"));
    g.feed(sample("up", 20));
    expect(g.feed(sample("lostcapture"))).toBeNull();
    g.feed(sample("down", 0, 0, 30, 2));
    expect(g.feed(sample("lostcapture"))).toBeNull();
    expect(g.activePointer).toBe(2);
  });

  test("samples without an active down cannot create a gesture", () => {
    const g = createGestureTracker();
    for (const phase of ["move", "up", "cancel", "lostcapture"] as const) {
      expect(g.feed(sample(phase, 100))).toBeNull();
      expect(g.activePointer).toBeNull();
    }
  });

  test("non-finite down coordinates are ignored entirely", () => {
    const g = createGestureTracker();
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(g.feed(sample("down", bad, 0))).toBeNull();
      expect(g.feed(sample("down", 0, bad))).toBeNull();
      expect(g.activePointer).toBeNull();
    }
    expect(g.feed(sample("down", 2, 3))?.kind).toBe("start");
  });

  test("non-finite move samples cannot add distance or replace the last good point", () => {
    const g = createGestureTracker();
    g.feed(sample("down", 4, 5));
    for (const [x, y] of [[NaN, 900], [900, Infinity], [-Infinity, 900]]) {
      expect(g.feed(sample("move", x, y))).toBeNull();
    }
    expect(g.feed(sample("up", 4, 5, 50))).toEqual({
      kind: "tap", pointerId: 1, at: { x: 4, y: 5 },
    });
  });

  test("a non-finite up still ends the swipe at the last good point", () => {
    const g = createGestureTracker();
    g.feed(sample("down", 0, 0, 10));
    g.feed(sample("move", 20, 0, 20));
    const event = g.feed(sample("up", NaN, 999, 35));
    expect(event?.kind).toBe("swipe");
    if (event?.kind !== "swipe") throw new Error("expected swipe");
    expect(event.duration).toBe(25);
    expect(event.path[0]).toEqual({ x: 0, y: 0 });
    expect(event.path[event.path.length - 1]).toEqual({ x: 20, y: 0 });
    expect(event.path.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(g.activePointer).toBeNull();
  });

  test("cancel with a non-finite point still cancels", () => {
    const g = createGestureTracker();
    g.feed(sample("down"));
    expect(g.feed(sample("cancel", Infinity, NaN))).toEqual({ kind: "cancelled", pointerId: 1 });
    expect(g.activePointer).toBeNull();
  });

  test("reset silently discards an active path for resize or rotation", () => {
    const g = createGestureTracker();
    g.feed(sample("down", -140));
    g.feed(sample("move", 140));
    g.reset();
    expect(g.activePointer).toBeNull();
    expect(g.feed(sample("up", 150))).toBeNull();
    g.reset();
    g.feed(sample("down", 10, 20, 10, 3));
    expect(g.feed(sample("up", 10, 20, 20, 3))).toEqual({
      kind: "tap", pointerId: 3, at: { x: 10, y: 20 },
    });
  });
});

describe("coordinate transforms — SPEC-geometry §§2–3", () => {
  test("native and double-size playfields have exact scale and zero offsets", () => {
    expect(fitPlayfield(390, 844)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(fitPlayfield(780, 1688)).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
  });

  test("wide and tall letterboxing use the minimum ratio and centred offsets", () => {
    expect(fitPlayfield(1000, 844)).toEqual({ scale: 1, offsetX: 305, offsetY: 0 });
    expect(fitPlayfield(390, 1000)).toEqual({ scale: 1, offsetX: 0, offsetY: 78 });
    expect(fitPlayfield(600, 400, 200, 200)).toEqual({ scale: 2, offsetX: 100, offsetY: 0 });
  });

  test("every fit dimension rejects zero, negative or non-finite input", () => {
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      for (let index = 0; index < 4; index++) {
        const args: [number, number, number, number] = [390, 844, 390, 844];
        args[index] = bad;
        expect(() => fitPlayfield(...args)).toThrow(RangeError);
      }
    }
  });

  test("view and design round trips survive resize and swapped dimensions", () => {
    for (const [w, h] of [[390, 844], [844, 390], [1280, 720], [720, 1280]]) {
      const vt = fitPlayfield(w!, h!);
      for (const p of [{ x: 0, y: 0 }, { x: 390, y: 844 }, { x: 123.4, y: 567.8 }]) {
        closePoint(viewToDesign(vt, designToView(vt, p)), p);
      }
      const viewPoint = { x: w! / 3, y: h! / 7 };
      closePoint(designToView(vt, viewToDesign(vt, viewPoint)), viewPoint);
    }
  });

  test("fresh portrait and landscape transforms map their centres to the design centre", () => {
    const portrait = fitPlayfield(390, 844);
    const landscape = fitPlayfield(844, 390);
    expect(landscape.scale).toBeCloseTo(390 / 844, 12);
    closePoint(viewToDesign(portrait, { x: 195, y: 422 }), { x: 195, y: 422 });
    closePoint(viewToDesign(landscape, { x: 422, y: 195 }), { x: 195, y: 422 });
  });

  test("letterbox bars map outside rather than clamping to the design playfield", () => {
    const wide = fitPlayfield(1000, 844);
    expect(viewToDesign(wide, { x: 0, y: 422 }).x).toBe(-305);
    expect(viewToDesign(wide, { x: 1000, y: 422 }).x).toBe(695);
    const tall = fitPlayfield(390, 1000);
    expect(viewToDesign(tall, { x: 195, y: 0 }).y).toBe(-78);
    expect(viewToDesign(tall, { x: 195, y: 1000 }).y).toBe(922);
  });

  test("world/local conversion translates and rotates clockwise in y-down space", () => {
    const pose = { x: 100, y: 200, angle: Math.PI / 2 };
    closePoint(localToWorld(pose, { x: 30, y: 0 }), { x: 100, y: 230 });
    closePoint(worldToLocal(pose, { x: 100, y: 230 }), { x: 30, y: 0 });
  });

  test("both world/local round trips meet 1e-9 at varied poses", () => {
    for (const angle of [0, -Math.PI / 2, Math.PI, 0.731]) {
      const pose = Object.freeze({ x: -1200, y: 2300, angle });
      const p = Object.freeze({ x: 5432.125, y: -4321.75 });
      for (const actual of [worldToLocal(pose, localToWorld(pose, p)), localToWorld(pose, worldToLocal(pose, p))]) {
        expect(Math.abs(actual.x - p.x)).toBeLessThanOrEqual(1e-9);
        expect(Math.abs(actual.y - p.y)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  test("one frozen down pose converts an entire sparse gesture consistently", () => {
    // The API exposes conversions, not a scene: this tests the frozen-pose pipeline.
    const downPose = Object.freeze({ x: 195, y: 300, angle: 0.81 });
    const local = [{ x: -200, y: 0 }, { x: 200, y: 0 }];
    const world = local.map(p => localToWorld(downPose, p));
    const restored = world.map(p => worldToLocal(downPose, p));
    restored.forEach((p, i) => closePoint(p, local[i]!));
    expect(resolveSwipe(TOAST, 4, restored)).toEqual({ kind: "across", lines: [1, 2, 3] });
    expect(downPose).toEqual({ x: 195, y: 300, angle: 0.81 });
  });
});
