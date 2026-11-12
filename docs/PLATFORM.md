# PLATFORM: the pinned platform matrix

Phase 0 web lane, 12 Nov 2026. Lines marked [VERIFY] are for the native lane (Lane A) once Xcode
and the Android SDK are installed; nothing native exists in this repo yet.

| Item | Pin | Status |
|---|---|---|
| bun | 1.3.14 (CI uses the same) | verified on this Mac |
| Phaser | 3.90.0 (latest stable Phaser 3; npm `latest` is Phaser 4, deliberately not used) | pinned exactly |
| Vite | 8.3.8 | pinned exactly |
| TypeScript | 7.0.2 (native compiler; the JS compiler API is gone, so tools avoid it) | pinned exactly |
| @types/bun | 1.4.4 | pinned exactly |
| playwright-core | 1.65.0 (headless evidence only; uses the cached chrome-headless-shell 1243) | pinned exactly |
| Capacitor | 8.5.x | [VERIFY] Lane A |
| iOS deployment target | iOS 15 | [VERIFY] Lane A |
| Xcode | 26 or later | [VERIFY] Lane A (not installed: disk) |
| Android minSdk / target / compile | 24 / 36 / 36 | [VERIFY] Lane A |
| App id | com.geniusplusmath.kayatoastninja (D-116) | used when the Capacitor shell is created |

Release CSP (index.html, kept in every build, removed only by the dev server for hot reload):
`default-src 'self'; connect-src 'self' capacitor://localhost https://localhost; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`.
Proven in headless Chromium for the web build (no violations, no remote requests:
`docs/evidence/p0/summary.json`). The device proof is Lane A's.
