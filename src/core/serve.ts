// The serve rule (SPEC-orders section 5). Acceptance reads only exact rationals.
import { add, cmp, eq, isRational, mul, rat, isInteger, type Rational } from "./rational";
import { checkDenominator } from "./geometry";
import type { Piece } from "./partition";

export type ServeOutcome = "placed" | "matched" | "duplicate" | "otherPartition" | "notYet" | "closed" | "invalid";

export interface Plate {
  readonly target: Rational;
  readonly partitionId: string | null;
  readonly served: ReadonlyArray<Piece>;
  readonly total: Rational;
  readonly matched: boolean;
}

export function emptyPlate(target: Rational): Plate {
  if (!isRational(target) || target.n <= 0) throw new RangeError("target must be a positive rational");
  return Object.freeze({ target, partitionId: null, served: Object.freeze([]), total: rat(0), matched: false });
}

export function serve(plate: Plate, piece: Piece): { plate: Plate; outcome: ServeOutcome } {
  if (!piece || !isRational(piece.size) || piece.size.n <= 0) return { plate, outcome: "invalid" };
  if (plate.matched) return { plate, outcome: "closed" };
  if (plate.served.some((p) => p.id === piece.id)) return { plate, outcome: "duplicate" };
  if (plate.partitionId !== null && plate.partitionId !== piece.partitionId) {
    return { plate, outcome: "otherPartition" };
  }
  const total = add(plate.total, piece.size);
  if (cmp(total, plate.target) > 0) return { plate, outcome: "notYet" };
  const matched = eq(total, plate.target);
  const next: Plate = Object.freeze({
    target: plate.target,
    partitionId: plate.partitionId ?? piece.partitionId,
    served: Object.freeze([...plate.served, piece]),
    total,
    matched,
  });
  return { plate: next, outcome: matched ? "matched" : "placed" };
}

export function canFill(target: Rational, d: number): boolean {
  checkDenominator(d);
  if (!isRational(target)) throw new RangeError("target must be a rational");
  if (target.n <= 0 || cmp(target, rat(1)) > 0) return false;
  return isInteger(mul(target, rat(d)));
}
