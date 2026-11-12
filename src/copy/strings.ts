// Every string a child reads or hears in the Phase 0 prototype, with spoken-line ids.
// House rules (tools/copy-lint.ts): British English, no en or em dashes, no emoji, no slashed
// fractions (every fraction is stacked through StackedFraction), no blades, no superlatives.

export const COPY = {
  title: "Kaya Toast Ninja",
  tapToStart: "Tap to start",
  intoHowMany: "Into how many?",
  swipeAcross: "Swipe across the toast.",
  keepCutting: "Keep cutting.",
  flickPieces: "Flick the pieces onto the plate.",
  notYet: "Not yet. Try another number of pieces.",
  matched: "Lovely!",
  next: "Next",
  playAgain: "Play again",
  allServed: "All three orders served.",
  please: ", please.",
  orderOf: (k: number, total: number) => `Order ${k} of ${total}`,
  markExact: "Exact",
  markSmart: "Smart",
  markTidy: "Tidy",
  // Spoken (and shown) when a child taps an earned mark: what it was for, in a few words.
  markExactWhy: "Exact. Right the first time.",
  markSmartWhy: "Smart. The fewest pieces.",
  markTidyWhy: "Tidy. One swipe did it.",
  dialCaption: "pieces",
  startAgain: "New toast. Swipe across it.",
} as const;

/** The customer's line: the spoken order with a capital letter and "please". */
export function customerLine(spoken: string): string {
  return spoken.charAt(0).toUpperCase() + spoken.slice(1) + COPY.please;
}

/** Spoken-line ids for the recorded voice (Phase 1). Placeholder synthesis reads the same text. */
export const SPOKEN_LINE_IDS = {
  intoHowMany: "nelli.into-how-many",
  notYet: "nelli.not-yet",
  matched: "nelli.lovely",
} as const;
