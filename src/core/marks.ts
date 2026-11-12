// Marks, never a fail (SPEC-orders section 8).
import type { Order } from "./orders";
import { solveOrder } from "./orders";

export interface Marks {
  readonly exact: boolean;
  readonly smart: boolean;
  readonly tidy: boolean;
}

const nonNegInt = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;

export function marksFor(
  order: Order,
  dial: ReadonlyArray<number>,
  history: { notYets: number; finalDenominator: number; swipesOnFinal: number },
): Marks {
  if (!history || !nonNegInt(history.notYets) || !nonNegInt(history.swipesOnFinal)) {
    throw new RangeError("notYets and swipesOnFinal must be non-negative integers");
  }
  if (!dial.includes(history.finalDenominator)) throw new RangeError("final denominator is not on the dial");
  const sol = solveOrder(order, dial);
  const choice = sol.choices.find((c) => c.pieces === history.finalDenominator)!;
  return {
    exact: history.notYets === 0,
    smart: choice.canFill && choice.piecesNeeded === sol.fewestPieces,
    tidy: history.swipesOnFinal === 1,
  };
}
