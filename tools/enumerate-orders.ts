// The builders' enumeration and solve of the P1 and P2 order space (Docs/10 section 4.1(b)).
// Usage: bun tools/enumerate-orders.ts [out.json]   (prints JSON to stdout when no path is given)
import { dialFor, orderSpace, solveOrder, type Level } from "../src/core/index";

export interface EnumOrder {
  id: string;
  numerator: number;
  denominator: number;
  spoken: string;
  stacked: boolean;
  choices: Array<{ pieces: number; canFill: boolean; piecesNeeded: number | null }>;
  smartChoice: number;
  fewestPieces: number;
  notYetChoices: number[];
}
export interface Enumeration {
  levels: Record<Level, { dial: number[]; orders: EnumOrder[] }>;
}

export function enumerate(): Enumeration {
  const levels = {} as Enumeration["levels"];
  for (const level of ["P1", "P2"] as const) {
    const dial = dialFor(level);
    const orders = orderSpace(level).map((o) => {
      const s = solveOrder(o, dial);
      return {
        id: o.id,
        numerator: o.numerator,
        denominator: o.denominator,
        spoken: o.spoken,
        stacked: o.stacked,
        choices: s.choices.map((c) => ({ pieces: c.pieces, canFill: c.canFill, piecesNeeded: c.piecesNeeded })),
        smartChoice: s.smartChoice,
        fewestPieces: s.fewestPieces,
        notYetChoices: s.choices.filter((c) => !c.canFill).map((c) => c.pieces),
      };
    });
    levels[level] = { dial, orders };
  }
  return { levels };
}

if (import.meta.main) {
  const json = JSON.stringify(enumerate(), null, 2) + "\n";
  const out = process.argv[2];
  if (out) await Bun.write(out, json);
  else process.stdout.write(json);
}
