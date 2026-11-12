// P1 order space (SPEC-orders section 2): half, a quarter, three quarters. Words only.
export const P1_ORDERS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [1, 2],
  [1, 4],
  [3, 4],
] as const);
