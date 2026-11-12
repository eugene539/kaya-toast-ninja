import { describe, test, expect } from "bun:test";
import {
  DIAL_CANDIDATES, dialFor, dialAllowedByWidth, orderSpace, makeOrder, spokenOrder,
  labelFor, solveOrder, marksFor, createRng, generateShift, DEMO_ORDERS,
  type Level, type Order,
} from "@core";

// Independent enumeration, explicitly listed by SPEC-orders §2.
const p1: ReadonlyArray<readonly [number, number, string]> = [
  [1, 2, "half"], [1, 4, "a quarter"], [3, 4, "three quarters"],
];
const p2: ReadonlyArray<readonly [number, number, string]> = [
  [1, 2, "half"], [1, 3, "a third"], [2, 3, "two thirds"],
  [1, 4, "a quarter"], [3, 4, "three quarters"],
  [1, 5, "a fifth"], [2, 5, "two fifths"], [3, 5, "three fifths"], [4, 5, "four fifths"],
  [1, 6, "a sixth"], [5, 6, "five sixths"],
  [1, 8, "an eighth"], [3, 8, "three eighths"], [5, 8, "five eighths"], [7, 8, "seven eighths"],
];
const expectedOrders = (level: Level, rows: typeof p1): Order[] => rows.map(([a, b, words]) => ({
  id: `${level}-${a}-${b}`, level, numerator: a, denominator: b,
  value: { n: a, d: b }, spoken: `${words} of the toast`, stacked: level === "P2",
}));

describe("dial and exact order spaces — SPEC-orders §§1–2,6", () => {
  test("dial candidates and both level dials have exactly the specified ascending entries", () => {
    expect(DIAL_CANDIDATES).toEqual([2, 3, 4, 5, 6, 8, 10, 12]);
    expect(dialFor("P1")).toEqual([2, 4]);
    expect(dialFor("P2")).toEqual([2, 3, 4, 5, 6, 8]);
  });

  test("300-wide toast with minimum width 32 allows five but excludes ten and twelve", () => {
    expect(dialAllowedByWidth(DIAL_CANDIDATES, 300, 32)).toEqual([2, 3, 4, 5, 6, 8]);
    expect(dialAllowedByWidth([12, 10, 8, 6, 5, 4, 3, 2], 300, 32)).toEqual([2, 3, 4, 5, 6, 8]);
  });

  test("width threshold is inclusive and wider toast admits the deferred candidates", () => {
    expect(dialAllowedByWidth(DIAL_CANDIDATES, 320, 32)).toEqual([2, 3, 4, 5, 6, 8, 10]);
    expect(dialAllowedByWidth(DIAL_CANDIDATES, 384, 32)).toEqual([2, 3, 4, 5, 6, 8, 10, 12]);
    expect(dialAllowedByWidth([2, 4], 63, 32)).toEqual([]);
    expect(dialAllowedByWidth([4, 2], 128, 32)).toEqual([2, 4]);
  });

  test("P1 consists of precisely three orders with exact ids, words, values and flags", () => {
    expect(orderSpace("P1")).toEqual(expectedOrders("P1", p1));
  });

  test("P2 consists of precisely fifteen simplest proper orders in denominator/numerator order", () => {
    expect(orderSpace("P2")).toEqual(expectedOrders("P2", p2));
  });

  test("makeOrder reproduces every member of both explicit order spaces", () => {
    for (const [level, rows] of [["P1", p1], ["P2", p2]] as const) {
      for (const expected of expectedOrders(level, rows)) {
        expect(makeOrder(level, expected.numerator, expected.denominator)).toEqual(expected);
      }
    }
  });

  test("P1 refuses equivalence forms, thirds, zero, wholes and invalid integer arguments", () => {
    for (const [a, b] of [[2, 4], [1, 3], [1, 8], [0, 4], [4, 4], [-1, 4], [1.5, 4], [1, NaN]]) {
      expect(() => makeOrder("P1", a!, b!)).toThrow(RangeError);
    }
  });

  test("P2 refuses non-simplest forms, off-dial denominators and improper or invalid numerators", () => {
    for (const [a, b] of [[2, 4], [4, 8], [3, 6], [1, 7], [1, 9], [1, 10], [1, 11], [1, 12],
      [0, 8], [8, 8], [9, 8], [-1, 8], [1.5, 8], [NaN, 8], [1, Infinity], [1, 3.5]]) {
      expect(() => makeOrder("P2", a!, b!)).toThrow(RangeError);
    }
  });
});

describe("spoken and written forms — SPEC-orders §3", () => {
  test("all eight allowed unit-fraction names use the prescribed article", () => {
    for (const [b, words] of [[2, "half"], [3, "a third"], [4, "a quarter"], [5, "a fifth"],
      [6, "a sixth"], [8, "an eighth"], [10, "a tenth"], [12, "a twelfth"]] as const) {
      expect(spokenOrder(1, b)).toBe(`${words} of the toast`);
    }
  });

  test("plural names and number words include non-simplest spoken fractions through eleven", () => {
    const rows = [
      [2, 3, "two thirds"], [3, 4, "three quarters"], [4, 5, "four fifths"],
      [5, 6, "five sixths"], [6, 8, "six eighths"], [7, 8, "seven eighths"],
      [8, 10, "eight tenths"], [9, 10, "nine tenths"], [10, 12, "ten twelfths"],
      [11, 12, "eleven twelfths"], [2, 4, "two quarters"],
    ] as const;
    for (const [a, b, words] of rows) expect(spokenOrder(a, b)).toBe(`${words} of the toast`);
  });

  test("every permitted spoken fraction names the whole, including denominators not on the dial", () => {
    for (const b of [2, 3, 4, 5, 6, 8, 10, 12]) {
      for (let a = 1; a < b; a++) expect(spokenOrder(a, b).endsWith(" of the toast")).toBe(true);
    }
  });

  test("spokenOrder rejects unsupported denominators and numerators outside proper integers", () => {
    for (const b of [0, 1, 7, 9, 11, 13, 3.5, NaN, Infinity]) {
      expect(() => spokenOrder(1, b)).toThrow(RangeError);
    }
    for (const a of [0, -1, 8, 9, 1.5, NaN, Infinity]) {
      expect(() => spokenOrder(a, 8)).toThrow(RangeError);
    }
  });

  test("P1 labels contain only half, quarter or three quarters and no stacked fraction", () => {
    expect(orderSpace("P1").map(labelFor)).toEqual([
      { words: "half", stacked: null }, { words: "quarter", stacked: null },
      { words: "three quarters", stacked: null },
    ]);
  });

  test("every P2 label strips the article and whole suffix but retains its own numerator/denominator", () => {
    for (const [a, b, words] of p2) {
      expect(labelFor(makeOrder("P2", a, b))).toEqual({
        words: words.replace(/^(a|an) /, ""), stacked: { numerator: a, denominator: b },
      });
    }
  });
});

describe("solving and marks — SPEC-orders §§7–8", () => {
  test("half has explicit per-dial choices, preferring one half over finer partitions", () => {
    expect(solveOrder(makeOrder("P2", 1, 2), [2, 3, 4, 5, 6, 8])).toEqual({
      orderId: "P2-1-2",
      choices: [
        { pieces: 2, canFill: true, piecesNeeded: 1 }, { pieces: 3, canFill: false, piecesNeeded: null },
        { pieces: 4, canFill: true, piecesNeeded: 2 }, { pieces: 5, canFill: false, piecesNeeded: null },
        { pieces: 6, canFill: true, piecesNeeded: 3 }, { pieces: 8, canFill: true, piecesNeeded: 4 },
      ], smartChoice: 2, fewestPieces: 1,
    });
  });

  test("three eighths is unfillable on sixths and needs three pieces of eighths", () => {
    expect(solveOrder(makeOrder("P2", 3, 8), [6, 8])).toEqual({
      orderId: "P2-3-8", choices: [
        { pieces: 6, canFill: false, piecesNeeded: null }, { pieces: 8, canFill: true, piecesNeeded: 3 },
      ], smartChoice: 8, fewestPieces: 3,
    });
  });

  test("every enumerated order solves by exact divisibility with its own denominator smartest", () => {
    for (const [level, rows, dial] of [["P1", p1, [2, 4]], ["P2", p2, [2, 3, 4, 5, 6, 8]]] as const) {
      for (const [a, b] of rows) {
        const result = solveOrder(makeOrder(level, a, b), dial);
        expect(result).toEqual({
          orderId: `${level}-${a}-${b}`,
          choices: dial.map(d => ({ pieces: d, canFill: (a * d) % b === 0,
            piecesNeeded: (a * d) % b === 0 ? a * d / b : null })),
          smartChoice: b, fewestPieces: a,
        });
      }
    }
  });

  test("choices retain caller dial order while smartChoice minimises pieces needed", () => {
    expect(solveOrder(makeOrder("P2", 1, 2), [8, 6, 4])).toEqual({
      orderId: "P2-1-2", choices: [
        { pieces: 8, canFill: true, piecesNeeded: 4 }, { pieces: 6, canFill: true, piecesNeeded: 3 },
        { pieces: 4, canFill: true, piecesNeeded: 2 },
      ], smartChoice: 4, fewestPieces: 2,
    });
  });

  test("solveOrder throws when the provided dial has no filling choice", () => {
    expect(() => solveOrder(makeOrder("P2", 3, 8), [2, 3, 4, 5, 6])).toThrow(RangeError);
    expect(() => solveOrder(makeOrder("P1", 1, 2), [])).toThrow(RangeError);
  });

  test("Exact is true precisely when the order had zero Not yets", () => {
    const order = makeOrder("P2", 1, 2);
    for (const notYets of [0, 1, 4]) {
      expect(marksFor(order, [2, 4], { notYets, finalDenominator: 2, swipesOnFinal: 1 })).toEqual({
        exact: notYets === 0, smart: true, tidy: true,
      });
    }
  });

  test("Smart rewards fewest served pieces even when a finer partition matched exactly", () => {
    const order = makeOrder("P1", 1, 2);
    expect(marksFor(order, [2, 4], { notYets: 0, finalDenominator: 4, swipesOnFinal: 1 })).toEqual({
      exact: true, smart: false, tidy: true,
    });
    expect(marksFor(order, [4, 8], { notYets: 0, finalDenominator: 4, swipesOnFinal: 1 }).smart).toBe(true);
  });

  test("Tidy is true only for exactly one swipe that cut new lines on the final partition", () => {
    for (const swipesOnFinal of [0, 1, 2, 9]) {
      expect(marksFor(makeOrder("P2", 3, 8), [8], { notYets: 0, finalDenominator: 8, swipesOnFinal })).toEqual({
        exact: true, smart: true, tidy: swipesOnFinal === 1,
      });
    }
  });

  test("the three marks remain independent after a Not yet, finer cut and multiple final swipes", () => {
    expect(marksFor(makeOrder("P2", 1, 2), [2, 4, 8], {
      notYets: 2, finalDenominator: 8, swipesOnFinal: 3,
    })).toEqual({ exact: false, smart: false, tidy: false });
    expect(marksFor(makeOrder("P2", 1, 2), [2, 4, 8], {
      notYets: 2, finalDenominator: 2, swipesOnFinal: 1,
    })).toEqual({ exact: false, smart: true, tidy: true });
  });

  test("marks reject negative, fractional and non-finite history counts", () => {
    const order = makeOrder("P2", 1, 2);
    for (const bad of [-1, 0.5, NaN, Infinity, -Infinity]) {
      expect(() => marksFor(order, [2, 4], { notYets: bad, finalDenominator: 2, swipesOnFinal: 1 })).toThrow(RangeError);
      expect(() => marksFor(order, [2, 4], { notYets: 0, finalDenominator: 2, swipesOnFinal: bad })).toThrow(RangeError);
    }
  });

  test("marks reject a final denominator absent from the supplied dial", () => {
    for (const finalDenominator of [3, 8, 0, 2.5, NaN, Infinity]) {
      expect(() => marksFor(makeOrder("P2", 1, 2), [2, 4], {
        notYets: 0, finalDenominator, swipesOnFinal: 1,
      })).toThrow(RangeError);
    }
  });
});

describe("deterministic generators — SPEC-orders §9", () => {
  test("createRng matches mulberry32 reference words for zero, one and the maximum 32-bit seed", () => {
    const vectors = [
      [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
      [1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403]],
      [0xffffffff, [3850105811, 813802916, 3073704848, 4054706436, 3630262831]],
    ] as const;
    for (const [seed, words] of vectors) {
      const rng = createRng(seed);
      for (const word of words) expect(rng.next()).toBe(word / 4294967296);
    }
  });

  test("generators with the same seed advance independently but produce identical sequences", () => {
    const first = createRng(12345);
    const second = createRng(12345);
    const expected = Array.from({ length: 1000 }, () => first.next());
    expect(Array.from({ length: 1000 }, () => second.next())).toEqual(expected);
  });

  test("every sampled RNG value is finite and inside the half-open interval [0,1)", () => {
    for (const seed of [0, 1, 99, 0xffffffff]) {
      const rng = createRng(seed);
      for (let i = 0; i < 2000; i++) {
        const value = rng.next();
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  test("generateShift rejects non-integer counts and counts outside one through fifty", () => {
    for (const count of [0, -1, 51, 1.5, NaN, Infinity]) {
      expect(() => generateShift("P2", count, createRng(1))).toThrow(RangeError);
    }
  });

  test("both levels generate the requested count, only members, and no immediate repeats", () => {
    for (const [level, rows] of [["P1", p1], ["P2", p2]] as const) {
      const members = expectedOrders(level, rows);
      for (const count of [1, 2, 50]) {
        for (const seed of [0, 1, 19, 0xffffffff]) {
          const shift = generateShift(level, count, createRng(seed));
          expect(shift).toHaveLength(count);
          shift.forEach((order, i) => {
            expect(members).toContainEqual(order);
            if (i > 0) expect(order.id).not.toBe(shift[i - 1]!.id);
          });
        }
      }
    }
  });

  test("the same seed gives the same full fifty-order shift at either level", () => {
    for (const level of ["P1", "P2"] as const) {
      expect(generateShift(level, 50, createRng(98765))).toEqual(generateShift(level, 50, createRng(98765)));
    }
  });

  test("DEMO_ORDERS are exactly the P2 half, quarter and three eighths in that order", () => {
    expect(DEMO_ORDERS).toEqual(expectedOrders("P2", [
      [1, 2, "half"], [1, 4, "a quarter"], [3, 8, "three eighths"],
    ]));
  });

  test("width filtering, labels, solutions and marks preserve their frozen inputs", () => {
    const candidates = Object.freeze([12, 8, 2, 5]);
    const dial = Object.freeze([8, 4, 2]);
    const order = Object.freeze({ ...makeOrder("P2", 1, 2), value: Object.freeze({ n: 1, d: 2 }) });
    const before = { ...order, value: { ...order.value } };
    const history = Object.freeze({ notYets: 1, finalDenominator: 4, swipesOnFinal: 1 });
    dialAllowedByWidth(candidates, 300, 32);
    labelFor(order);
    solveOrder(order, dial);
    marksFor(order, dial, history);
    expect(candidates).toEqual([12, 8, 2, 5]);
    expect(dial).toEqual([8, 4, 2]);
    expect(order).toEqual(before);
    expect(history).toEqual({ notYets: 1, finalDenominator: 4, swipesOnFinal: 1 });
  });
});
