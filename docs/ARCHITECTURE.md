# ARCHITECTURE (Phase 0)

- `spec/` is the contract. `spec/api.d.ts` declares the core; `src/core/_conformance.ts` makes the
  type checker prove `src/core/index.ts` matches it exactly. Tests import `@core` (tsconfig paths:
  `src/core/index.ts` on main, `spec/api.d.ts` on the spec-only branch `spec-base`).
- `src/core/` is pure TypeScript with no Phaser or DOM imports: `rational` (exact fractions,
  BigInt compare), `geometry` (constants, polygons, half-plane clipping, view and pose transforms,
  plate slots), `input` (the gesture tracker: first finger wins, cancel never cuts), `forgiveness`
  (swipe to cuts: Rule A across, Rule B along with a third-of-a-gap forgiveness), `partition`
  (pieces with rational sizes, groups, the PLAN-v6 cut layout), `serve` (the serve rule),
  `marks`, `orders` with `generator/p1` and `generator/p2`.
- `src/game/` draws and animates only: `PrototypeScene` (the Phase 0 scene), `pointer` (DOM pointer
  events with pointer capture, converted to design space with a transform recomputed on every
  pointer-down and resize), `audio` (placeholder Web Audio effects, unlocked on the first tap),
  `placeholderVoice` (offline speech synthesis, never shipped), `toastTexture` (the toast and the
  cut-edge strip drawn in code), `ui/StackedFraction` (the only place a fraction becomes text).
- `src/copy/strings.ts` holds every child-facing string.
- Phaser's own input is off; every hit test is ours, in design space.
- `tools/`: `enumerate-orders.ts` and `solver-diff.ts` (builders against Codex), `copy-lint.ts`,
  `e2e-evidence.ts` (headless run at phone and tablet sizes into `docs/evidence/p0/`).
