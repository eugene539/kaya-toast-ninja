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

export default defineConfig({
  base: "./",
  publicDir: "assets",
  plugins: [stripCspInDev],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
