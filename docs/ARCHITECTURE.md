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
- `src/game/` draws and animates only: `flow.ts` (the order state machine, pure TypeScript, unit
  tested), `PrototypeScene` (turns input into flow events and animates the effects), `pointer` (DOM pointer
  events with pointer capture, converted to design space with a transform recomputed on every
  pointer-down and resize), `audio` (placeholder Web Audio effects, unlocked on the first tap),
  `placeholderVoice` (offline speech synthesis, never shipped), `toastTexture` (the toast and the
  cut-edge strip drawn in code), `ui/StackedFraction` (the only place a fraction becomes text).
- `src/copy/strings.ts` holds every child-facing string.
- Phaser's own input is off; every hit test is ours, in design space.
- `tools/`: `enumerate-orders.ts` and `solver-diff.ts` (builders against Codex), `copy-lint.ts`,
  `e2e-evidence.ts` (headless run at phone and tablet sizes into `docs/evidence/p0/`).

## Native shell (Phase 0, lane A)

- Capacitor 8.5.3 wraps the same Vite build (`dist/`, `webDir` in `capacitor.config.ts`). There is
  one code path: the browser, the Android WebView and the iOS WKWebView all run the same bundle.
- `android/` and `ios/` are committed Capacitor projects. Generated copies (`public/`,
  `capacitor.config.json`, plugin lists) are ignored and rebuilt by `bunx cap sync`.
- iOS uses Swift Package Manager (`ios/App/CapApp-SPM/Package.swift`, managed by the CLI), not
  CocoaPods. The project and its shared scheme `App` build headless with `xcodebuild` on GitHub's
  macOS runners (D-124); this Mac has no Xcode.
- Origins: Android serves from `https://localhost`, iOS from `capacitor://localhost`; both are
  stated in `capacitor.config.ts` and allowed by the release CSP's `connect-src`.
- Plugins are official and local only: App (lifecycle), Preferences (the save, Phase 1),
  Splash Screen, Status Bar. Nothing reaches the network.
- `src/game/lifecycle.ts` turns App `pause` and `resume` (native) and `visibilitychange` (browser
  and WebView) into one pair of idempotent handlers. The scene suspends Web Audio and stops the
  placeholder voice on pause and resumes audio on resume; a failed resume is recovered by the next
  tap (`Sfx.unlock`). `src/core` never imports Phaser, Capacitor or the DOM
  (`tests/unit/core-purity.test.ts`).
- Icons and splash images are generated from `resources/icon-1024.png` by
  `tools/native-assets.sh` (macOS `sips`); rerun it when the icon changes.
