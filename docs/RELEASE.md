# RELEASE: how builds are made and played

Phase 0, 12 Nov 2026. Signed store builds arrive once the Apple and Google Play accounts are active
(D-123 item 2). Until then: the iPad plays the web build in Safari over Wi-Fi, Android installs a
debug APK by adb, and iOS builds run unsigned in GitHub Actions (D-124).

## 1. iPad or iPhone in Safari over the local Wi-Fi (no Apple account needed)

Safari runs the same WebKit engine as the iOS app shell, and the build served here is the release
build with the release CSP intact (only `bun run dev` strips the CSP, for hot reload).

1. On the Mac, in `~/dev/kaya-toast-ninja`: `bun run serve:lan`. It builds `dist/` and serves it on
   port 4173 on every network interface. Leave the window open while the child plays.
2. Note the `Network:` address it prints, for example `http://192.168.0.3:4173/`
   (`ipconfig getifaddr en0` gives the Mac's address too).
3. The iPad must be on the same Wi-Fi as the Mac. In Safari on the iPad, open that address.
4. If macOS asks whether `bun` may accept incoming connections, allow it (one time).
5. Optional, for a full-screen feel: Share, then Add to Home Screen, then open it from the icon.
6. Tap once to start: the first tap unlocks sound.
7. Stop the server with Ctrl+C when done. Nothing is sent anywhere: the game makes no requests
   beyond its own files on the Mac.

Limits: the iPad needs the Mac on and on the same network; there is no app icon or splash from
the shell; Preferences falls back to web storage. Installed iOS builds come by TestFlight.

## 2. Android debug APK (local, this Mac)

```sh
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=~/Library/Android/sdk
bun run android:debug            # build web, cap sync, ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk (never committed)
$ANDROID_HOME/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Inspect it: `$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging <apk>` (package, SDK levels,
permissions). The phone needs Developer options and USB debugging turned on, once.

## 3. GitHub Actions (run once the remote `eugene539/kaya-toast-ninja` exists)

| Workflow | Runner | Does | Artifact |
|---|---|---|---|
| `ci.yml` | ubuntu-latest | typecheck, unit and adversarial tests, copy lint, solver diff, web build | none |
| `android.yml` | ubuntu-24.04, JDK 21 | web build, `cap sync android`, `assembleDebug`, aapt2 checks (package, minSdk 24, targetSdk 36, no AD_ID) | `kaya-toast-ninja-debug-apk` |
| `ios.yml` job `simulator-build` | macos-26, newest Xcode 26 | web build, `cap sync ios`, resolve Swift packages, unsigned Debug build for the iOS Simulator, Info.plist checks (bundle id, iOS 15.0, no ATS exceptions, CSP present) | `kaya-toast-ninja-ios-simulator-app` (zipped `.app`) |
| `ios.yml` job `testflight` | macos-26 | DISABLED (`if: false`): signed Release archive and TestFlight upload | none |

The simulator `.app` cannot be installed on a real iPad; it proves the project compiles and links
with Xcode 26 and is the base for the signed job.

### Turning on TestFlight (when the Apple account is active)

1. App Store Connect: Users and Access, Integrations, App Store Connect API, create a key with the
   App Manager role. Download the `.p8` once.
2. Certificates, Identifiers and Profiles: register the bundle id
   `com.geniusplusmath.kayatoastninja` (explicit). App Store Connect: create the app record.
3. Repo secrets (names only; values never in the repo or in docs): `APPLE_TEAM_ID`,
   `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8_BASE64`
   (`base64 -i AuthKey_XXXX.p8 | pbcopy`).
4. In `.github/workflows/ios.yml`, delete `if: false` from the `testflight` job. Signing is
   cloud-managed by Xcode through the key (`-allowProvisioningUpdates`); the build number is the
   workflow run number.
5. Before the first store submission (Phase 3): the privacy manifest (Preferences uses
   UserDefaults, reason code [VERIFY]) and the release network audit.

### Play internal testing (when the Google Play account is active)

A release job (signed AAB, upload key in repo secrets, Play internal track) is added then, together
with the release-manifest decision on INTERNET (docs/PLATFORM.md).

## 4. Keeping the native projects in step

- After any web change: `bun run cap:sync` (builds, then copies `dist/` into both shells).
- After changing the icon in `resources/icon-1024.png`: `sh tools/native-assets.sh` on a Mac.
- Never edit `ios/App/CapApp-SPM/Package.swift` by hand: the Capacitor CLI rewrites it.
- Upgrading Capacitor: all four core packages move together, then `bunx cap sync`, then a rebuild
  of both shells; record the new pins in docs/PLATFORM.md.
