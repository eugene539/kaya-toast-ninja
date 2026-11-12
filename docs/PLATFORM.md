# PLATFORM: the pinned platform matrix

Updated 12 Nov 2026 by the Phase 0 native lane (lane A). "Verified" means checked against what is
installed in this repo or in the built debug APK on this Mac. [VERIFY] means it cannot be proved
here (no Xcode on this Mac, D-124; no device to hand) and says who proves it and how.

## Web stack

| Item | Pin | Status |
|---|---|---|
| bun | 1.3.14 (CI uses the same) | verified on this Mac |
| Phaser | 3.90.0 (latest stable Phaser 3; npm `latest` is Phaser 4, deliberately not used) | pinned exactly |
| Vite | 8.3.8 | pinned exactly |
| TypeScript | 7.0.2 (native compiler; the JS compiler API is gone, so tools avoid it) | pinned exactly |
| @types/bun | 1.4.4 | pinned exactly |
| playwright-core | 1.65.0 (headless evidence only; uses the cached chrome-headless-shell 1243) | pinned exactly |

## Capacitor

| Item | Pin | Status |
|---|---|---|
| @capacitor/core, cli, android, ios | 8.5.3, exact | verified: package.json, bun.lock, `bunx cap` output. 8.5.3 (7 Oct 2026) is the newest 8.5.x; 8.6.0 (28 Oct 2026) exists and is deliberately not used (ruling: 8.5.x) |
| capacitor-swift-pm (iOS core via SPM) | 8.5.3, exact | verified in `ios/App/CapApp-SPM/Package.swift` (written by the CLI) |
| @capacitor/app | 8.1.2, exact | verified installed; lifecycle |
| @capacitor/preferences | 8.0.1, exact | verified installed; the save from Phase 1 |
| @capacitor/splash-screen | 8.0.2, exact | verified installed |
| @capacitor/status-bar | 8.0.4, exact | verified installed |
| @capacitor/haptics | not installed | optional in Docs/10; left out (it would add VIBRATE on Android). Add 8.0.2 if wanted |

Note on "same minor": the official plugins are versioned on their own (8.0.x and 8.1.x) and
declare `@capacitor/core >= 8.0.0` as their peer; none is numbered 8.5. The pins above are each
plugin's newest stable 8.x release on 12 Nov 2026, which is what "the same line" means in practice.

## Android (verified in the debug APK with aapt2 36.0.0)

| Item | Pin | Status |
|---|---|---|
| applicationId and namespace | com.geniusplusmath.kayatoastninja (D-116, permanent) | verified: `aapt2 dump badging` |
| App label | Kaya Toast Ninja | verified |
| minSdk | 24 | verified: `minSdkVersion:'24'` |
| compileSdk / targetSdk | 36 / 36 | verified: `compileSdkVersion='36'`, `targetSdkVersion:'36'` |
| Orientation | portrait (`screenOrientation="portrait"`) | verified in the APK manifest |
| App category | game (`android:appCategory="game"`) | verified; games are exempt from Android 16's large-screen orientation override, so the portrait lock should hold on tablets [VERIFY on a tablet] |
| Permissions (debug) | INTERNET; `<applicationId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (signature-level, added by AndroidX core, not a user permission) | verified. No AD_ID, no location, no camera, no microphone, no VIBRATE |
| INTERNET in release | to be dropped only if the local asset loader works without it | [VERIFY on the Android phone, Phase 3]: build a release with INTERNET removed (`tools:node="remove"` in a release manifest) and confirm textures and the Phaser XHR loader still load from https://localhost. Capacitor serves local files through an in-app asset loader, which should not need INTERNET, but this is unproven on a device |
| Web origin | https://localhost (`androidScheme: "https"`, `hostname: "localhost"`) | verified in capacitor.config.ts and the packaged `assets/capacitor.config.json`; device load under the CSP [VERIFY on the Android phone] |
| Release CSP in the APK | `connect-src 'self' capacitor://localhost https://localhost` | verified in `assets/public/index.html` inside the APK |
| JDK | Temurin 21.0.13 (`/usr/libexec/java_home -v 21`); CI: Temurin 21 | verified |
| Gradle wrapper | 8.14.3 | verified (`gradle-wrapper.properties`) |
| Android Gradle Plugin | 8.13.0 | verified (`android/build.gradle`) |
| Build tools | 36.0.0 | verified |
| google-services classpath | present in the Capacitor template, applied only if `google-services.json` exists; it never will | verified not applied |
| allowBackup | true (template default) | open: Phase 3 compliance decides (Auto Backup of the save is probably wanted) |

## iOS (no Xcode here; CI proves the build)

| Item | Pin | Status |
|---|---|---|
| Bundle id | com.geniusplusmath.kayatoastninja | verified in `project.pbxproj`; CI checks the built Info.plist |
| Display name | Kaya Toast Ninja | verified in Info.plist |
| Deployment target | iOS 15.0 | verified in `project.pbxproj` (all configurations) and `Package.swift` (`.iOS(.v15)`) |
| Dependency manager | Swift Package Manager (no CocoaPods) | verified: `cap add ios` generated `CapApp-SPM` without Xcode; CocoaPods is not installed and not needed |
| App lifecycle | UIScene (`SceneDelegate.swift`, `UIApplicationSceneManifest`) | verified in the template; the lifecycle that Xcode 27 era builds require |
| Orientation | iPhone: portrait only; iPad: portrait and upside down, with `UIRequiresFullScreen` | verified in Info.plist. [VERIFY on iPadOS 26]: Apple has deprecated `UIRequiresFullScreen` for iPadOS 26 windowing; if the iPad ignores it, Phaser's FIT scaling letterboxes the playfield anyway |
| Encryption export | `ITSAppUsesNonExemptEncryption` NO | set (no custom encryption) |
| ATS | no exceptions | verified: no `NSAppTransportSecurity` key; CI fails the build if one appears |
| Web origin | capacitor://localhost (`iosScheme: "capacitor"`) | verified in config; device load under the CSP [VERIFY on the iPad via TestFlight] |
| Xcode | newest Xcode 26 on the `macos-26` GitHub runner | [VERIFY on the first `ios.yml` run]: the runner label and the Xcode 26 path (the job prints `xcodebuild -version`) |
| Shared scheme | `App` (`xcshareddata/xcschemes/App.xcscheme`) | committed so `xcodebuild -scheme App` works on a clean checkout [VERIFY on the first run] |
| Privacy manifest | not yet | Phase 3: Preferences uses UserDefaults and needs a declared reason [VERIFY the reason code] |

## Devices

| Item | Pin | Status |
|---|---|---|
| Low-end test device | the 2019 A10 iPad on iPadOS 18 | [VERIFY] Safari over Wi-Fi now (`bun run serve:lan`), TestFlight once the Apple account is active |
| Current-OS test device | Eugene's iPhone on the current iOS | [VERIFY] TestFlight |
| Android test device | one named mid-range phone (S-23) | [VERIFY] debug APK by adb |

## Release CSP

In index.html, kept in every build, removed only by the dev server for hot reload:
`default-src 'self'; connect-src 'self' capacitor://localhost https://localhost; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`.
Proven in headless Chromium for the web build (no violations, no remote requests:
`docs/evidence/p0/summary.json`); `bun run serve:lan` serves it unchanged over the LAN (checked with
curl on 12 Nov). The device proof on all three devices is still open.
