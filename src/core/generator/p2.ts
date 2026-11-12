// P2 order space (SPEC-orders section 2): proper fractions in simplest form over the P2 dial.
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function p2Fractions(dial: ReadonlyArray<number>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const b of [...dial].sort((x, y) => x - y)) {
    for (let a = 1; a < b; a++) if (gcd(a, b) === 1) out.push([a, b]);
  }
  return out;
}
