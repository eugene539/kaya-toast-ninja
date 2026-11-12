# SPEC-orders: order generators, answer forms, spoken forms, the serve rule and marks

Status: Phase 0, version 1 (12 Nov 2026). The Maths lens ruling is in section 9. Every rule
is overrulable by the owner; until then it is the rule the code, the tests and the enumeration
follow. Functions named here are declared in `spec/api.d.ts` and imported as `@core`.

Fractions are written `a/b` in this file only, for brevity. A child never sees a slash: every
fraction on screen is stacked (numerator over a bar over denominator), and P1 sees no symbols.

## 1. Levels and the dial

| Level | Dial (`dialFor(level)`) | Who |
|---|---|---|
| `P1` | 2, 4 | Primary 1: fair sharing into 2 and 4; the words "half" and "quarter"; words only, no symbols |
| `P2` | 2, 3, 4, 5, 6, 8 | Primary 2: unit and like fractions of one whole, with stacked notation and words |

The dial lists the level's denominators in ascending order. The child picks one number on the
dial: that is the number of equal pieces the toast is cut into. `DIAL_CANDIDATES` is
2, 3, 4, 5, 6, 8, 10, 12; a candidate joins the P2 dial only if a piece is at least
`MIN_PIECE_WIDTH` wide (section 6).

## 2. The order space

An order is `{ id, level, numerator, denominator, value, spoken, stacked }`:
- `numerator / denominator` is the order **in its own form** (what the customer says);
- `value` is the same amount as a reduced rational;
- `id` is `"<level>-<numerator>-<denominator>"`, for example `"P2-3-8"`;
- `stacked` is `false` for P1 (words only) and `true` for P2 (stacked fraction beside the words).

**P1 order space** (`orderSpace("P1")`), exactly three orders:
`1/2`, `1/4`, `3/4`.

**P2 order space** (`orderSpace("P2")`): every fraction `a/b` with `b` on the P2 dial,
`1 <= a < b` (proper, no zero numerator, no whole) and `gcd(a, b) = 1` (simplest form only).
That is, in order:
`1/2`; `1/3, 2/3`; `1/4, 3/4`; `1/5, 2/5, 3/5, 4/5`; `1/6, 5/6`; `1/8, 3/8, 5/8, 7/8`:
fifteen orders.

`orderSpace(level)` returns the orders sorted by denominator, then numerator, ascending.
`makeOrder(level, a, b)` returns that order and throws `RangeError` for anything outside the
level's order space.

## 3. Spoken and written forms

Every spoken order names the whole: it ends with `" of the toast"`. Never "three pieces", never
"three over eight".

`spokenOrder(a, b)`:
- numerator 1: `b = 2` gives `"half of the toast"`; `b = 4` gives `"a quarter of the toast"`;
  otherwise `"a "` or `"an "` (an before a vowel sound: only "eighth") plus the singular name:
  `"a third of the toast"`, `"a fifth of the toast"`, `"a sixth of the toast"`,
  `"an eighth of the toast"`, `"a tenth of the toast"`, `"a twelfth of the toast"`;
- numerator 2 or more: the number word, a space, the plural name, then `" of the toast"`:
  `"three quarters of the toast"`, `"two thirds of the toast"`, `"five sixths of the toast"`,
  `"three eighths of the toast"`.
- Number words: one, two, three, four, five, six, seven, eight, nine, ten, eleven.
- Names, singular and plural: half and halves, third and thirds, quarter and quarters, fifth and
  fifths, sixth and sixths, eighth and eighths, tenth and tenths, twelfth and twelfths.
  ("Quarter", not "fourth": British and Singapore usage.)
- `spokenOrder` throws `RangeError` when `b` is not one of 2, 3, 4, 5, 6, 8, 10, 12 or `a` is not
  an integer with `1 <= a < b`.

The written label (`labelFor(order)`) is `{ words, stacked }`: `words` is the spoken form
without `" of the toast"` and without a leading `"a "` or `"an "` (so `"half"`, `"quarter"`,
`"three eighths"`); `stacked` is `{ numerator, denominator }` for P2 and `null` for P1. The label
appears on the plate only when the order is matched.

## 4. Pieces

A cut toast is a partition into `d` equal strips. Each piece carries
`{ id, partitionId, denominator, index, size }` where `size` is the **exact rational** `1/d` and
`id` is `"<partitionId>:<index>"`. `makePartition(partitionId, d)` builds it (`2 <= d <= 12`,
integer, else `RangeError`; `partitionId` non-empty, else `RangeError`). A new partition id is
used every time a toast is cut afresh (after a heal, the next cut is a new partition).

## 5. The serve rule

`serve(plate, piece)` returns `{ plate, outcome }`. The plate is
`{ target, partitionId, served, total, matched }`; `emptyPlate(target)` has no partition,
nothing served, total 0 and `matched: false`. Rules, applied in this order:
1. `piece.size` not a positive rational: outcome `"invalid"`, plate unchanged.
2. The plate is already matched: `"closed"`, unchanged.
3. The same piece id is already on the plate: `"duplicate"`, unchanged (a piece can be on the
   plate once).
4. The plate already holds pieces of another partition id: `"otherPartition"`, unchanged
   (pieces from two partitions are refused; they boing back).
5. `total + size > target`: `"notYet"`, unchanged. The piece boings back, the scene says
   **"Not yet. Try another number of pieces."**, the plate empties and the toast heals (every
   piece rejoins, the lines go, the dial is offered again). Never a fail state, never a cross.
6. Otherwise the piece is added (the plate takes its partition id if it had none). If the new
   total equals the target exactly: `"matched"`, else `"placed"`.

Acceptance reads **only** rationals (`size`, `total`, `target`). Polygon areas, screen
positions, fan angles and finger forgiveness never change an outcome.

`canFill(target, d)` is true exactly when `target * d` is an integer (with `target <= 1`): only
then can pieces of size `1/d` sum to the target. With equal pieces, rule 5 fires before a match
exactly when `canFill` is false. Example: three eighths with the dial on 6: two sixths are placed
(two sixths is less than three eighths), the third sixth would make three sixths, which is more
than three eighths, so "Not yet".

## 6. Minimum piece width (who joins the dial)

On the 390 by 844 playfield the toast is 300 design units wide, so a piece of a `d` partition is
`300 / d` wide. A piece must be at least `MIN_PIECE_WIDTH = 32` design units wide (about 5 mm on a
phone, about 10 mm on a 10.2 inch iPad after letterboxing) for a six to eight year old to pick it
up and flick it; the hit area also takes half the gap on each side.

`dialAllowedByWidth(candidates, toastWidth, minWidth)` keeps the candidates `d` with
`toastWidth / d >= minWidth`, in ascending order. With 300 and 32: 2 (150), 3 (100), 4 (75),
5 (60), 6 (50), 8 (37.5) join; 10 (30) and 12 (25) do not. So **5 joins the dial; 10 and 12 wait**
until a wider toast or a zoomed serve exists (revisit in Phase 1 on the A10 iPad).

## 7. Solving an order

`solveOrder(order, dial)` returns
`{ orderId, choices, smartChoice, fewestPieces }`:
- `choices` has one entry per dial number, in dial order: `{ pieces, canFill, piecesNeeded }`
  where `pieces` is the dial number `d`, `canFill = canFill(order.value, d)` and
  `piecesNeeded = order.value * d` when it can fill, else `null`;
- `fewestPieces` is the smallest `piecesNeeded` over the choices that can fill;
- `smartChoice` is the dial number that gives `fewestPieces` (the smallest such `d` on a tie,
  which cannot happen for simplest-form orders);
- if no dial number can fill the order, `solveOrder` throws `RangeError` (never true for the
  order spaces above, since every denominator is on its own dial).

## 8. Marks (never a fail)

When an order is matched the child gets marks, each true or false, never a penalty:
- **Exact**: matched with no "Not yet" during this order (the first number chosen could fill it);
- **Smart**: the matched plate used `fewestPieces` pieces (for simplest-form orders, the child
  chose the order's own denominator);
- **Tidy**: the partition that matched was fully cut by one swipe (`swipesOnFinal === 1`, where
  only swipes that cut at least one new line are counted).

`marksFor(order, dial, { notYets, finalDenominator, swipesOnFinal })` returns
`{ exact, smart, tidy }` by exactly these rules. `notYets`, `swipesOnFinal` are non-negative
integers and `finalDenominator` is on the dial, else `RangeError`.

## 9. Generators

`createRng(seed)` is a deterministic generator (mulberry32 on the 32-bit seed) whose `next()`
returns a number in `[0, 1)`. `generateShift(level, count, rng)` returns `count` orders
(`1 <= count <= 50`, integer, else `RangeError`) drawn uniformly from `orderSpace(level)` with
**no order equal to the one before it**. Same seed, same shift.

`DEMO_ORDERS` are the three Phase 0 demo orders at P2, in order: `1/2` ("half of the toast"),
`1/4` ("a quarter of the toast"), `3/8` ("three eighths of the toast").

## 10. The Maths lens ruling (Phase 0)

Ruled by the KTN code worker acting as the Maths lens on 12 Nov 2026, overrulable by the owner.
Sources: the MOE 2021 Primary Mathematics syllabus as GPA teaches it, and GPA-Math-Intelligence
(the GPA textbook corpus and the school-paper corpus). The corpus holds **no P1 or P2 fraction
items** (GPA's P1 and P2 books are whole numbers; the school-paper corpus has P1 and P2 WA1
papers only, before fractions are taught); the one P2 fraction skill it references
(`P2.FRAC.01`, ordering unit fractions, via a P3 WA1 question type) is consistent with the rules
below. So the ruling rests on the syllabus.
1. **P1**: fractions are not in the MOE P1 syllabus. P1 play is informal fair sharing into 2 and
   4 with the words half and quarter, words only, no symbols. Orders: half, a quarter, three
   quarters. "Two quarters" is left out at P1 because it is an equivalence (P3).
2. **P2**: the syllabus covers fractions of a whole, unit and like fractions, denominators not
   exceeding 12, comparing them, and adding and subtracting like fractions within one whole.
   Orders are proper fractions in simplest form. Non-simplest orders (two quarters, four eighths,
   three sixths) are left out because the Smart mark would then reward equivalence, which is
   taught in P3. A child may still serve a simplest-form order from a finer cut (two quarters for a
   half): the plate accepts it by area (Exact), and only the Smart mark prefers the order's own
   denominator. Whole orders (eight eighths) are left out of v1: the plate already shows the whole.
3. **Denominators**: 2, 3, 4, 5, 6, 8 on the P2 dial (section 6). 7, 9 and 11 are never offered
   (no toast-cutting context, and the plan's dial never had them). 10 and 12 wait on the width
   rule.
4. **Spoken forms**: "quarter" not "fourth"; the whole is always named; "half of the toast" for
   the half. Answer form on the plate: the order's own form only (P2), words only (P1).
5. **Equal area**: acceptance is exact on rationals; floating area is never a tolerance in v1 (free
   cuts with area tolerance are a 1.1 feature).
6. **Not in the v1 Phase 0 order space**, to be ruled in Phase 1: adding like fractions on a shared
   plate ("one eighth and two eighths"), P3 orders.
7. **Codex's independent enumeration and solve** (Docs/10 section 4.1(b)) must agree with
   `tools/enumerate-orders.ts`; the diff record is in `docs/CHANGELOG.md`.
