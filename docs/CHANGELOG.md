# CHANGELOG

## Phase 0 (12 Nov 2026), native lane A: Capacitor shell, lifecycle, CI for Android and iOS

### Built
- Capacitor 8.5.3 (core, cli, android, ios, pinned exactly) with the official plugins App 8.1.2,
  Preferences 8.0.1, Splash Screen 8.0.2 and Status Bar 8.0.4. Haptics left out (optional; would
  add VIBRATE). `capacitor.config.ts`: appId `com.geniusplusmath.kayatoastninja`, appName
  "Kaya Toast Ninja", origins stated explicitly (https://localhost, capacitor://localhost).
- `android/`: minSdk 24, compileSdk and targetSdk 36, portrait lock, `appCategory="game"`, icon
  orange adaptive background, game-brown splash. Debug APK built locally with Gradle 8.14.3, AGP
  8.13.0, JDK 21 and inspected with aapt2 (docs/PLATFORM.md). INTERNET is present in the debug
  build, as generated; the release decision waits for a device test.
- `ios/`: iOS 15.0, Swift Package Manager (no CocoaPods), UIScene lifecycle, portrait only with
  `UIRequiresFullScreen`, no ATS exceptions, `ITSAppUsesNonExemptEncryption` NO, a shared `App`
  scheme. Generated without Xcode; it is compiled only in GitHub Actions (D-124).
- Icons and splash from `resources/icon-1024.png` (a copy of the lock-set export) by
  `tools/native-assets.sh` (macOS sips, no new dependency).
- Lifecycle (`src/game/lifecycle.ts`): App pause and resume plus visibilitychange; audio suspends
  on pause and resumes on resume, iOS interruptions and route changes retry while in front, and
  the next tap still recovers a failed resume. The placeholder voice stops on pause.
  `tests/unit/core-purity.test.ts` keeps Phaser, Capacitor and the DOM out of `src/core`.
- Workflows: `android.yml` (debug APK artifact with aapt2 checks) and `ios.yml` (unsigned
  Simulator build on macos-26 with Xcode 26, Info.plist checks, zipped .app artifact; a disabled
  TestFlight job naming its secrets only). They run once the GitHub remote exists.
- `bun run serve:lan` (release build, CSP intact, port 4173 on the LAN) for the iPad in Safari;
  `bun run cap:sync`; `bun run android:debug`. Steps in docs/RELEASE.md.
- Docs: PLATFORM.md rewritten as the verified matrix; ARCHITECTURE.md native section; RELEASE.md.

### Decisions taken as overrulable defaults
1. Capacitor core 8.5.3, not 8.6.0 (the ruling says 8.5.x). Plugins at their newest 8.x.
2. iPad is portrait only (plus upside down) with `UIRequiresFullScreen`; landscape is not
   letterboxed in the native shell. iPadOS 26 deprecates that key [VERIFY on device].
3. Android adaptive icon: the full icon at the 66dp safe zone on its own orange (#FF844F).
4. The headless e2e evidence run still passes all checks with the lifecycle code (re-run on
   12 Nov; screenshots not re-committed).

## Phase 0 (12 Nov 2026), web lane: spec, core, Codex tests, prototype

Code worker for lanes B and C. Local git only; no remote exists yet.

### Built
- Spec first (`spec/`): SPEC-geometry, SPEC-orders (with the Maths lens ruling, section 10),
  SPEC-state (stub for Phase 0), `api.d.ts`. Branch `spec-base` holds only spec and the test-runner
  config; Codex works in a worktree of it and never sees `src/`.
- `src/core/`: pure TypeScript implementing `spec/api.d.ts`; a type-level conformance check
  (`src/core/_conformance.ts`) keeps the two in step.
- `tests/unit/` (builders) and `tests/adversarial/` (Codex gpt-6.1-sol, blind, 135 tests).
- Prototype scene (`src/game/`): three demo orders with "Not yet" and the heal, at phone and tablet
  sizes, under the release CSP; screenshots in `docs/evidence/p0/`.
- Tools: `enumerate-orders.ts`, `solver-diff.ts`, `copy-lint.ts`, `e2e-evidence.ts`; CI workflow.

### Decisions taken as overrulable defaults (logged here and in the hand-over note)
1. Toast is a 300 by 240 rectangle in a 390 by 844 playfield; strips are vertical.
2. Minimum piece width 32 design units: the P2 dial is 2, 3, 4, 5, 6, 8; 10 and 12 wait.
3. Lens: P1 orders half, a quarter, three quarters (words only, dial 2 and 4). P2 orders are
   proper fractions in simplest form over the P2 dial (fifteen orders); no whole orders, no
   non-simplest orders (Smart would reward equivalence, a P3 skill); sum orders deferred to Phase 1.
4. Swipe rules: Rule A (any crossing of a line inside the toast cuts it; segment by segment) and
   Rule B (an along swipe covering half the toast height snaps to a line within a third of the gap).
5. Only a fully separated strip can be served; joined runs stay on the toast.
6. "Not yet" fires on the first serve that would overshoot; the core leaves the plate unchanged and
   the scene empties it and heals the toast.
7. Marks: Exact = no "Not yet" this order; Smart = fewest pieces on the dial; Tidy = the matching
   partition was cut by one swipe.
8. Serve gestures: tap, or a downward flick starting on a separated piece. The scene uses a 2 degree
   fan and 5 unit gap for 6 and 8 pieces (6 degrees and 6 units otherwise) so eight pieces fit a
   phone; both stay inside the PLAN-v6 bounds.
9. The toast top and cut-edge strip are drawn in code (cal_A_toast has printed dashed lines that
   would compete with the code-owned count); only cal_A_stall is used, downscaled to a JPEG backdrop.
10. Placeholder voice: the device's offline speech synthesis, local voices only; silent if none.
11. Copy lint exempts `tests/adversarial/` from the dash rule: Codex used em dashes in test titles,
    builders may not edit those files, and they are never shipped.

### Codex
- Job (a), adversarial tests: 135 tests in 4 files; meter 86 percent before and 86 percent after
  (weekly window; under one point); 420,765 input tokens (403,200 cached), 26,505 output.
  One test failed first time and was right: `cmp` overflowed near MAX_SAFE_INTEGER. Fixed with a
  BigInt cross-multiply. Codex flagged two spec ambiguities (the notYet plate, the default
  denominator of `rat`); both are now pinned in the spec.
- Job (b), independent enumeration and solve from SPEC-orders.md alone
  (`tests/fixtures/codex-enumerate.ts` and `tests/fixtures/orders-codex.json`): P1 3 orders, P2 15
  orders; `tools/solver-diff.ts` reports **zero differences over 18 orders**. Codex hand-solved six
  orders as a check. Meter 86 percent before and after; 88,621 input tokens (74,496 cached), 4,260
  output. It found one stale cross-reference in the spec (section 9 for the lens ruling), fixed.
  No disagreement, so no lens adjudication was needed beyond the ruling in SPEC-orders section 10.

### Other
- `bun run build` and `bun run dev` run Vite under the bun runtime (`bun --bun vite`): under Node 24
  on this Mac rolldown could not load its native binding. bun is the ruled toolchain anyway.

### Codex review, round 1 (`codex review --base 65f0a9f`, gpt-6-astra, read-only)
Four findings, all P2, all verified and fixed; none rejected.
1. Later swipes after a partial cut were tested against the unseparated snap lines, so a moved
   line could not be cut. Fixed with `resolveSwipeOnGroups` in the core (SPEC-geometry 6.1, added
   to `api.d.ts`), used by the scene; unit tests show the drawn line 6 cuts after lines 1 to 5.
2. The stale Next hit target shadowed the centre of Play again. Fixed: clearing the result layer
   removes its hit targets; the e2e run now taps the centre of Play again.
3. Button hit areas were 80 unit circles on 180 by 52 pills. Fixed: rectangular hit areas matching
   what is drawn (dial and replay too).
4. `add` lost exactness for large safe operands. Fixed: add, sub, mul and div compute in BigInt and
   throw RangeError only when the reduced result is not a safe integer.
Round 2 was not run in this session (the brief asked for one round; the weekly Codex meter read
86 percent throughout).
