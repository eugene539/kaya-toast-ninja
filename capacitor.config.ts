import type { CapacitorConfig } from "@capacitor/cli";

// Kaya Toast Ninja native shell (Capacitor 8.5.x). The app id is permanent (D-116): never change it.
// Origins: Android serves the web build from https://localhost, iOS from capacitor://localhost.
// The release CSP in index.html allows exactly those two for connect-src (Docs/10 section 2.3).
const config: CapacitorConfig = {
  appId: "com.geniusplusmath.kayatoastninja",
  appName: "Kaya Toast Ninja",
  webDir: "dist",
  backgroundColor: "#2b1d14",
  loggingBehavior: "debug",
  server: {
    // Stated explicitly so a future default change cannot move the origin under the CSP.
    hostname: "localhost",
    androidScheme: "https",
    iosScheme: "capacitor",
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
  },
  ios: {
    contentInset: "never",
    scrollEnabled: false,
    // Offline game: no link previews, no remote navigation.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#2b1d14",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#2b1d14",
    },
  },
};

export default config;
