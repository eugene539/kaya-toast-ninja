import { describe, test, expect } from "bun:test";
import {
  rat, add, sub, mul, div, eq, cmp, isInteger, isRational, toNumber,
  makePartition, emptyPlate, serve, canFill, forgivenessRadius,
  type Piece, type Plate, type Rational,
} from "@core";

const pieceAt = (d: number, k = 0, id = "toast") => makePartition(id, d).pieces[k]!;
const frozenPlate = (plate: Plate): Plate => Object.freeze({
  ...plate, target: Object.freeze({ ...plate.target }), total: Object.freeze({ ...plate.total }),
  served: Object.freeze(plate.served.map(p => Object.freeze({ ...p, size: Object.freeze({ ...p.size }) }))),
});

describe("exact rationals — api.d.ts", () => {
  test("rat reduces by gcd and preserves integer values", () => {
    expect(rat(42, 56)).toEqual({ n: 3, d: 4 });
    expect(rat(7, 1)).toEqual({ n: 7, d: 1 });
    expect(rat(12, 4)).toEqual({ n: 3, d: 1 });
  });

  test("normalisation moves the sign to the numerator", () => {
    expect(rat(6, -8)).toEqual({ n: -3, d: 4 });
    expect(rat(-6, 8)).toEqual({ n: -3, d: 4 });
    expect(rat(-6, -8)).toEqual({ n: 3, d: 4 });
  });

  test("all zero rationals normalise to 0/1", () => {
    expect(rat(0, 12)).toEqual({ n: 0, d: 1 });
    expect(rat(0, -12)).toEqual({ n: 0, d: 1 });
  });

  test("rat rejects zero denominator and every non-safe-integer part", () => {
    expect(() => rat(1, 0)).toThrow(RangeError);
    for (const bad of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => rat(bad, 2)).toThrow(RangeError);
      expect(() => rat(1, bad)).toThrow(RangeError);
    }
  });

  test("addition is exact and normalises its result", () => {
    expect(add(rat(1, 6), rat(1, 3))).toEqual({ n: 1, d: 2 });
    expect(add(rat(-1, 8), rat(1, 8))).toEqual({ n: 0, d: 1 });
  });

  test("subtraction preserves negative exact differences", () => {
    expect(sub(rat(1, 3), rat(3, 8))).toEqual({ n: -1, d: 24 });
    expect(sub(rat(5, 6), rat(1, 6))).toEqual({ n: 2, d: 3 });
  });

  test("multiplication reduces exact products", () => {
    expect(mul(rat(3, 8), rat(4, 9))).toEqual({ n: 1, d: 6 });
    expect(mul(rat(-2, 3), rat(3, 4))).toEqual({ n: -1, d: 2 });
  });

  test("division normalises reciprocal products and rejects division by zero", () => {
    expect(div(rat(3, 8), rat(-3, 4))).toEqual({ n: -1, d: 2 });
    expect(() => div(rat(1, 2), rat(0, 1))).toThrow(RangeError);
  });

  test("comparison and equality return exact signs for negative, zero and equal values", () => {
    expect(cmp(rat(-1, 3), rat(-1, 4))).toBe(-1);
    expect(cmp(rat(0, 1), rat(-1, 100))).toBe(1);
    expect(cmp(rat(2, 4), rat(1, 2))).toBe(0);
    expect(eq(rat(6, 8), rat(3, 4))).toBe(true);
    expect(eq(rat(1, 3), rat(3, 8))).toBe(false);
  });

  test("cmp distinguishes safe-integer fractions whose numeric quotients coincide", () => {
    const m = Number.MAX_SAFE_INTEGER;
    const a = rat(m - 1, m);
    const b = rat(m - 2, m - 1);
    expect(cmp(a, b)).toBe(1);
    expect(cmp(b, a)).toBe(-1);
    expect(eq(a, b)).toBe(false);
  });

  test("isInteger and toNumber reflect the normalised rational value", () => {
    expect(isInteger(rat(6, 3))).toBe(true);
    expect(isInteger(rat(0, 8))).toBe(true);
    expect(isInteger(rat(3, 8))).toBe(false);
    expect(toNumber(rat(3, 8))).toBe(0.375);
    expect(toNumber(rat(-1, 4))).toBe(-0.25);
  });

  test("isRational rejects malformed and non-normalised representations", () => {
    for (const value of [rat(-3, 8), rat(0, 1), rat(9, 1)]) expect(isRational(value)).toBe(true);
    for (const value of [null, undefined, 1, "1/2", {}, { n: 1 }, { n: 1, d: 0 },
      { n: 1, d: -2 }, { n: 2, d: 4 }, { n: 0, d: 2 }, { n: 0.5, d: 2 }, { n: NaN, d: 1 }]) {
      expect(isRational(value)).toBe(false);
    }
  });

  test("rational operations preserve frozen operands", () => {
    const a = Object.freeze(rat(3, 8));
    const b = Object.freeze(rat(1, 6));
    add(a, b); sub(a, b); mul(a, b); div(a, b); cmp(a, b); eq(a, b); toNumber(a); isInteger(a);
    expect(a).toEqual({ n: 3, d: 8 });
    expect(b).toEqual({ n: 1, d: 6 });
  });
});

describe("partitions and rational-only acceptance — SPEC-orders §§4–5", () => {
  test("partitions identify each strip and assign exactly 1/d for every supported denominator", () => {
    for (let d = 2; d <= 12; d++) {
      const partition = makePartition("batch", d);
      expect(partition.id).toBe("batch");
      expect(partition.denominator).toBe(d);
      expect(partition.pieces).toEqual(Array.from({ length: d }, (_, index) => ({
        id: `batch:${index}`, partitionId: "batch", denominator: d, index, size: { n: 1, d },
      })));
    }
  });

  test("partitions reject empty ids and denominators outside integer 2 through 12", () => {
    expect(() => makePartition("", 4)).toThrow(RangeError);
    for (const d of [0, 1, 13, -2, 2.5, NaN, Infinity]) {
      expect(() => makePartition("batch", d)).toThrow(RangeError);
    }
  });

  test("emptyPlate has zero rational total, no partition, no pieces and is unmatched", () => {
    expect(emptyPlate(rat(3, 8))).toEqual({
      target: { n: 3, d: 8 }, partitionId: null, served: [], total: { n: 0, d: 1 }, matched: false,
    });
  });

  test("serving a smaller piece places it and establishes its partition", () => {
    const piece = pieceAt(8);
    expect(serve(emptyPlate(rat(3, 8)), piece)).toEqual({
      outcome: "placed", plate: {
        target: { n: 3, d: 8 }, partitionId: "toast", served: [piece], total: { n: 1, d: 8 }, matched: false,
      },
    });
  });

  test("a match uses exact rational equality and closes the plate", () => {
    const pieces = makePartition("eighths", 8).pieces;
    let plate = emptyPlate(rat(3, 8));
    for (let k = 0; k < 3; k++) {
      const result = serve(plate, pieces[k]!);
      expect(result.outcome).toBe(k === 2 ? "matched" : "placed");
      plate = result.plate;
    }
    expect(plate.total).toEqual({ n: 3, d: 8 });
    expect(plate.matched).toBe(true);
    expect(plate.served).toEqual(pieces.slice(0, 3));
    expect(serve(plate, pieces[3]!)).toEqual({ outcome: "closed", plate });
  });

  test("a finer cut can match the same target without changing its form or amount", () => {
    const quarters = makePartition("quarters", 4).pieces;
    const first = serve(emptyPlate(rat(1, 2)), quarters[0]!);
    expect(first.outcome).toBe("placed");
    const second = serve(first.plate, quarters[1]!);
    expect(second.outcome).toBe("matched");
    expect(second.plate.total).toEqual({ n: 1, d: 2 });
  });

  test("duplicate ids are refused even when passed as new piece objects", () => {
    const piece = pieceAt(8);
    const plate = serve(emptyPlate(rat(3, 8)), piece).plate;
    expect(serve(plate, { ...piece, size: { ...piece.size } })).toEqual({ outcome: "duplicate", plate });
  });

  test("pieces from another partition are refused even with the same denominator and size", () => {
    const plate = serve(emptyPlate(rat(3, 4)), pieceAt(4, 0, "first")).plate;
    expect(serve(plate, pieceAt(4, 1, "second"))).toEqual({ outcome: "otherPartition", plate });
  });

  test("three eighths on sixths places two then returns notYet with the plate unchanged", () => {
    const sixths = makePartition("sixths", 6).pieces;
    const first = serve(emptyPlate(rat(3, 8)), sixths[0]!);
    expect(first.outcome).toBe("placed");
    const second = serve(first.plate, sixths[1]!);
    expect(second.outcome).toBe("placed");
    expect(second.plate.total).toEqual({ n: 1, d: 3 });
    const before = frozenPlate(second.plate);
    expect(serve(before, sixths[2]!)).toEqual({ outcome: "notYet", plate: before });
    expect(before.served).toHaveLength(2);
    expect(before.matched).toBe(false);
  });

  test("overshooting an empty plate does not acquire the rejected partition", () => {
    const plate = emptyPlate(rat(1, 8));
    expect(serve(plate, pieceAt(2))).toEqual({ outcome: "notYet", plate });
    expect(plate.partitionId).toBeNull();
  });

  test("non-positive or malformed rational piece sizes are invalid and leave the plate unchanged", () => {
    const plate = frozenPlate(emptyPlate(rat(1, 2)));
    for (const size of [rat(0, 1), rat(-1, 4), { n: 1, d: 0 }, { n: 1, d: -4 },
      { n: 0.5, d: 4 }, { n: NaN, d: 4 }, { n: 1, d: Infinity }, null]) {
      const piece = { ...pieceAt(4), size: size as Rational };
      expect(serve(plate, piece)).toEqual({ outcome: "invalid", plate });
    }
  });

  test("serve precedence is invalid, closed, duplicate, otherPartition, then overshoot", () => {
    const half = pieceAt(2);
    const closed = serve(emptyPlate(rat(1, 2)), half).plate;
    expect(serve(closed, { ...half, size: rat(0, 1) }).outcome).toBe("invalid");
    expect(serve(closed, half).outcome).toBe("closed");
    expect(serve(closed, pieceAt(2, 0, "other")).outcome).toBe("closed");
    const plate = serve(emptyPlate(rat(3, 8)), pieceAt(6)).plate;
    const duplicateFromElsewhere: Piece = { ...pieceAt(2, 0, "other"), id: plate.served[0]!.id };
    expect(serve(plate, duplicateFromElsewhere).outcome).toBe("duplicate");
    expect(serve(plate, pieceAt(2, 0, "other")).outcome).toBe("otherPartition");
  });

  test("polygons, positions and fan angles cannot change acceptance", () => {
    const plain = pieceAt(4);
    const plate = emptyPlate(rat(1, 4));
    const decorated = {
      ...plain, polygon: [{ x: -1e8, y: 1e8 }], area: 0, x: Infinity, y: NaN, angle: 180,
    };
    const a = serve(plate, plain);
    const b = serve(plate, decorated);
    expect(a.outcome).toBe("matched");
    expect(b.outcome).toBe(a.outcome);
    expect(b.plate.total).toEqual(a.plate.total);
    expect(b.plate.matched).toBe(a.plate.matched);
  });

  test("forgiveness never makes a rational overshoot acceptable", () => {
    const plate = emptyPlate(rat(1, 8));
    for (const width of [30, 300, 3000]) {
      const decorated = { ...pieceAt(6), forgiveness: forgivenessRadius({ width, height: 240 }, 6) };
      expect(serve(plate, decorated)).toEqual({ outcome: "notYet", plate });
    }
  });

  test("canFill is the exact integer-product rule, including the whole", () => {
    for (let b = 2; b <= 12; b++) {
      for (let a = 1; a <= b; a++) {
        for (let d = 2; d <= 12; d++) {
          expect(canFill(rat(a, b), d)).toBe((a * d) % b === 0);
        }
      }
    }
    expect(canFill(rat(3, 8), 6)).toBe(false);
    expect(canFill(rat(3, 8), 8)).toBe(true);
    expect(canFill(rat(3, 2), 2)).toBe(false);
  });

  test("equal-piece serving matches when canFill is true and overshoots otherwise", () => {
    for (const [a, b] of [[1, 2], [3, 4], [3, 8], [5, 6]]) {
      for (const d of [2, 3, 4, 5, 6, 8]) {
        const target = rat(a!, b!);
        const partition = makePartition("fresh", d);
        let plate = emptyPlate(target);
        let terminal = "";
        for (const piece of partition.pieces) {
          const result = serve(plate, piece);
          if (result.outcome !== "placed") {
            terminal = result.outcome;
            break;
          }
          plate = result.plate;
        }
        expect(terminal).toBe(canFill(target, d) ? "matched" : "notYet");
      }
    }
  });

  test("successful and refused serves preserve the input plate, served array and pieces", () => {
    const target = Object.freeze(rat(3, 4));
    const empty = frozenPlate(emptyPlate(target));
    const first = Object.freeze({ ...pieceAt(4), size: Object.freeze(rat(1, 4)) });
    const placed = serve(empty, first);
    expect(empty).toEqual({ target, partitionId: null, served: [], total: rat(0, 1), matched: false });
    const plate = frozenPlate(placed.plate);
    const before = { ...plate, served: [...plate.served] };
    serve(plate, pieceAt(4, 1));
    serve(plate, first);
    serve(plate, pieceAt(4, 1, "other"));
    expect(plate).toEqual(before);
    expect(first).toEqual({ id: "toast:0", partitionId: "toast", denominator: 4, index: 0, size: rat(1, 4) });
  });
});
