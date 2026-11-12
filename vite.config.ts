import { defineConfig, type Plugin } from "vite";

// The release CSP lives in index.html (Docs/10 section 2.3). The dev server needs a websocket for
// hot reload, so the CSP meta is removed only while serving; every build keeps it.
const stripCspInDev: Plugin = {
  name: "ktn-strip-csp-in-dev",
  apply: "serve",
  transformIndexHtml(html) {
    return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, "");
  },
};

// __KTN_DEBUG__ gates the e2e hook, the sway-off switch and the level switch (?level=P1). It is
// false in the release build (`vite build`, mode production), which is what the shells ship, and
// true in `vite` (dev) and `vite build --mode debug` (the headless evidence build, dist-debug/).
export default defineConfig(({ mode }) => ({
  base: "./",
  publicDir: "assets",
  plugins: [stripCspInDev],
  define: { __KTN_DEBUG__: JSON.stringify(mode !== "production") },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
}));
