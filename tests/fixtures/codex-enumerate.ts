// Independent implementation of spec/SPEC-orders.md. Run from the worktree root:
// bun tests/fixtures/codex-enumerate.ts
import { writeFileSync } from "node:fs";

type Level = "P1" | "P2";
type Choice = {
  pieces: number;
  canFill: boolean;
  piecesNeeded: number | null;
};
type Order = {
  id: string;
  numerator: number;
  denominator: number;
  spoken: string;
  stacked: boolean;
  choices: Choice[];
  smartChoice: number;
  fewestPieces: number;
  notYetChoices: number[];
};

// All fraction arithmetic and decisions use integers, including the width test:
// 300 / d >= 32 is equivalent to 300 >= 32 * d for positive d.
const candidates = [2n, 3n, 4n, 5n, 6n, 8n, 10n, 12n];
const p1Dial = [2n, 4n];
const p2Dial = candidates.filter((d) => 300n >= 32n * d);

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

const numberWords = [
  "zero", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven",
];
const fractionNames = new Map<bigint, readonly [string, string]>([
  [2n, ["half", "halves"]],
  [3n, ["third", "thirds"]],
  [4n, ["quarter", "quarters"]],
  [5n, ["fifth", "fifths"]],
  [6n, ["sixth", "sixths"]],
  [8n, ["eighth", "eighths"]],
  [10n, ["tenth", "tenths"]],
  [12n, ["twelfth", "twelfths"]],
]);

function spoken(a: bigint, b: bigint): string {
  const names = fractionNames.get(b);
  if (!names || a < 1n || a >= b) throw new RangeError("Invalid fraction");
  let words: string;
  if (a === 1n) {
    words = b === 2n ? "half" : `${b === 8n ? "an" : "a"} ${names[0]}`;
  } else {
    words = `${numberWords[Number(a)]} ${names[1]}`;
  }
  return `${words} of the toast`;
}

function solve(level: Level, a: bigint, b: bigint, dial: bigint[]): Order {
  let bestDial: bigint | null = null;
  let bestCount: bigint | null = null;
  const choices: Choice[] = dial.map((d) => {
    const scaledNumerator = a * d;
    const canFill = scaledNumerator % b === 0n;
    const count = canFill ? scaledNumerator / b : null;
    if (count !== null && (
      bestCount === null || count < bestCount ||
      (count === bestCount && (bestDial === null || d < bestDial))
    )) {
      bestDial = d;
      bestCount = count;
    }
    return {
      pieces: Number(d),
      canFill,
      piecesNeeded: count === null ? null : Number(count),
    };
  });
  if (bestDial === null || bestCount === null) {
    throw new RangeError("No dial choice can fill this order");
  }
  // Conversion to JSON numbers happens only after the exact calculations.
  // All values are bounded here by the largest candidate, 12.
  return {
    id: `${level}-${a}-${b}`,
    numerator: Number(a),
    denominator: Number(b),
    spoken: spoken(a, b),
    stacked: level === "P2",
    choices,
    smartChoice: Number(bestDial),
    fewestPieces: Number(bestCount),
    notYetChoices: choices.filter((choice) => !choice.canFill).map((choice) => choice.pieces),
  };
}

const p1Fractions: Array<readonly [bigint, bigint]> = [
  [1n, 2n], [1n, 4n], [3n, 4n],
];
const p2Orders: Order[] = [];
// Dial order is denominator order; the inner loop is numerator order.
for (const b of p2Dial) {
  for (let a = 1n; a < b; a += 1n) {
    if (gcd(a, b) === 1n) p2Orders.push(solve("P2", a, b, p2Dial));
  }
}

const result = {
  levels: {
    P1: {
      dial: p1Dial.map(Number),
      orders: p1Fractions.map(([a, b]) => solve("P1", a, b, p1Dial)),
    },
    P2: {
      dial: p2Dial.map(Number),
      orders: p2Orders,
    },
  },
};

writeFileSync(new URL("./orders-codex.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote orders-codex.json: P1=${result.levels.P1.orders.length}, P2=${result.levels.P2.orders.length}`);
