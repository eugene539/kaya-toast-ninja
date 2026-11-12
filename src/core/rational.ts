// Exact rationals (SPEC-orders sections 4 and 5). Acceptance never uses floating point.

export interface Rational {
  readonly n: number;
  readonly d: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function checkInt(x: number, what: string): void {
  if (typeof x !== "number" || !Number.isSafeInteger(x)) {
    throw new RangeError(`${what} must be a safe integer`);
  }
}

export function rat(n: number, d: number = 1): Rational {
  checkInt(n, "numerator");
  checkInt(d, "denominator");
  if (d === 0) throw new RangeError("denominator must not be zero");
  if (n === 0) return Object.freeze({ n: 0, d: 1 });
  const g = gcd(n, d);
  let nn = n / g;
  let dd = d / g;
  if (dd < 0) {
    nn = -nn;
    dd = -dd;
  }
  // Avoid -0.
  return Object.freeze({ n: nn === 0 ? 0 : nn, d: dd });
}

function checkR(a: Rational): void {
  if (!isRational(a)) throw new RangeError("not a rational");
}

export function add(a: Rational, b: Rational): Rational {
  checkR(a);
  checkR(b);
  const g = gcd(a.d, b.d);
  return rat(a.n * (b.d / g) + b.n * (a.d / g), (a.d / g) * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  checkR(b);
  return add(a, rat(-b.n, b.d));
}

export function mul(a: Rational, b: Rational): Rational {
  checkR(a);
  checkR(b);
  const g1 = gcd(a.n, b.d) || 1;
  const g2 = gcd(b.n, a.d) || 1;
  return rat((a.n / g1) * (b.n / g2), (a.d / g2) * (b.d / g1));
}

export function div(a: Rational, b: Rational): Rational {
  checkR(b);
  if (b.n === 0) throw new RangeError("division by zero");
  return mul(a, rat(b.d, b.n));
}

export function eq(a: Rational, b: Rational): boolean {
  checkR(a);
  checkR(b);
  return a.n === b.n && a.d === b.d;
}

export function cmp(a: Rational, b: Rational): -1 | 0 | 1 {
  checkR(a);
  checkR(b);
  // Cross-multiply in BigInt: exact for every pair of safe-integer rationals, no overflow.
  const l = BigInt(a.n) * BigInt(b.d);
  const r = BigInt(b.n) * BigInt(a.d);
  return l < r ? -1 : l > r ? 1 : 0;
}

export function isInteger(a: Rational): boolean {
  checkR(a);
  return a.d === 1;
}

export function isRational(x: unknown): x is Rational {
  if (typeof x !== "object" || x === null) return false;
  const r = x as { n?: unknown; d?: unknown };
  if (typeof r.n !== "number" || typeof r.d !== "number") return false;
  if (!Number.isSafeInteger(r.n) || !Number.isSafeInteger(r.d)) return false;
  if (r.d <= 0) return false;
  if (r.n === 0) return r.d === 1 && !Object.is(r.n, -0);
  return gcd(r.n, r.d) === 1;
}

export function toNumber(a: Rational): number {
  checkR(a);
  return a.n / a.d;
}
