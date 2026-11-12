// Orders: forms, spaces, solving and the shift generator (SPEC-orders sections 1 to 3, 6, 7, 9).
import { rat, mul, isInteger, type Rational } from "./rational";
import { MIN_PIECE_WIDTH, TOAST } from "./geometry";
import { canFill } from "./serve";
import { P1_ORDERS } from "./generator/p1";
import { p2Fractions } from "./generator/p2";

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

export const DIAL_CANDIDATES: ReadonlyArray<number> = Object.freeze([2, 3, 4, 5, 6, 8, 10, 12]);

export function dialAllowedByWidth(candidates: ReadonlyArray<number>, toastWidth: number, minWidth: number): number[] {
  return [...new Set(candidates)]
    .filter((d) => Number.isInteger(d) && d >= 2 && toastWidth / d >= minWidth)
    .sort((a, b) => a - b);
}

const P1_DIAL = Object.freeze([2, 4]);

export function dialFor(level: Level): number[] {
  if (level === "P1") return [...P1_DIAL];
  if (level === "P2") return dialAllowedByWidth(DIAL_CANDIDATES, TOAST.width, MIN_PIECE_WIDTH);
  throw new RangeError("unknown level");
}

const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const NAMES: Record<number, [string, string]> = {
  2: ["half", "halves"],
  3: ["third", "thirds"],
  4: ["quarter", "quarters"],
  5: ["fifth", "fifths"],
  6: ["sixth", "sixths"],
  8: ["eighth", "eighths"],
  10: ["tenth", "tenths"],
  12: ["twelfth", "twelfths"],
};

function bareWords(a: number, b: number): { article: string; words: string } {
  const name = NAMES[b];
  if (!name || !Number.isInteger(a) || a < 1 || a >= b) throw new RangeError("not a speakable order");
  if (a === 1) {
    if (b === 2) return { article: "", words: "half" };
    return { article: b === 8 ? "an " : "a ", words: name[0] };
  }
  return { article: "", words: `${WORDS[a]} ${name[1]}` };
}

export function spokenOrder(numerator: number, denominator: number): string {
  const { article, words } = bareWords(numerator, denominator);
  return `${article}${words} of the toast`;
}

function buildOrder(level: Level, a: number, b: number): Order {
  return Object.freeze({
    id: `${level}-${a}-${b}`,
    level,
    numerator: a,
    denominator: b,
    value: rat(a, b),
    spoken: spokenOrder(a, b),
    stacked: level === "P2",
  });
}

const SPACES: Record<Level, ReadonlyArray<Order>> = {
  P1: Object.freeze(P1_ORDERS.map(([a, b]) => buildOrder("P1", a, b))),
  P2: Object.freeze(p2Fractions(dialFor("P2")).map(([a, b]) => buildOrder("P2", a, b))),
};

export function orderSpace(level: Level): Order[] {
  const s = SPACES[level];
  if (!s) throw new RangeError("unknown level");
  return [...s];
}

export function makeOrder(level: Level, numerator: number, denominator: number): Order {
  const s = SPACES[level];
  if (!s) throw new RangeError("unknown level");
  const o = s.find((x) => x.numerator === numerator && x.denominator === denominator);
  if (!o) throw new RangeError("order is outside the level's order space");
  return o;
}

export function labelFor(order: Order): { words: string; stacked: { numerator: number; denominator: number } | null } {
  const { words } = bareWords(order.numerator, order.denominator);
  return {
    words,
    stacked: order.stacked ? { numerator: order.numerator, denominator: order.denominator } : null,
  };
}

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

export function solveOrder(order: Order, dial: ReadonlyArray<number>): OrderSolution {
  const choices: DialChoiceSolution[] = dial.map((d) => {
    const ok = canFill(order.value, d);
    const need = mul(order.value, rat(d));
    return { pieces: d, canFill: ok, piecesNeeded: ok && isInteger(need) ? need.n : null };
  });
  let best: DialChoiceSolution | null = null;
  for (const c of choices) {
    if (!c.canFill || c.piecesNeeded === null) continue;
    if (!best || c.piecesNeeded < best.piecesNeeded! || (c.piecesNeeded === best.piecesNeeded && c.pieces < best.pieces)) {
      best = c;
    }
  }
  if (!best) throw new RangeError("no dial number can fill this order");
  return { orderId: order.id, choices, smartChoice: best.pieces, fewestPieces: best.piecesNeeded! };
}

export interface Rng {
  next(): number;
}

export function createRng(seed: number): Rng {
  let a = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function generateShift(level: Level, count: number, rng: Rng): Order[] {
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new RangeError("count must be 1 to 50");
  const space = orderSpace(level);
  const out: Order[] = [];
  for (let i = 0; i < count; i++) {
    const prev = out[out.length - 1];
    const pool = prev ? space.filter((o) => o.id !== prev.id) : space;
    const r = rng.next();
    const k = Math.min(pool.length - 1, Math.floor(r * pool.length));
    out.push(pool[k]!);
  }
  return out;
}

export const DEMO_ORDERS: ReadonlyArray<Order> = Object.freeze([
  makeOrder("P2", 1, 2),
  makeOrder("P2", 1, 4),
  makeOrder("P2", 3, 8),
]);
