// Headless evidence run of the web build (Phase 0): plays the three demo orders, including
// "Not yet" on six pieces for eighths, at phone portrait (390x844) and tablet (1024x1366), under
// the release CSP, and writes screenshots plus a summary to docs/evidence/p0/.
// Usage: bun run build && bun tools/e2e-evidence.ts [path-to-chrome-headless-shell]
import { chromium, type Page } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";

const DIST = join(import.meta.dir, "..", "dist");
const OUT = join(import.meta.dir, "..", "docs", "evidence", "p0");
const exe =
  process.argv[2] ??
  join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if (!existsSync(join(DIST, "index.html"))) throw new Error("run `bun run build` first");
mkdirSync(OUT, { recursive: true });

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".css": "text/css" };
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const p = join(DIST, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
    if (!p.startsWith(DIST) || !existsSync(p)) return new Response("not found", { status: 404 });
    return new Response(Bun.file(p), { headers: { "content-type": TYPES[extname(p)] ?? "application/octet-stream" } });
  },
});
const base = `http://localhost:${server.port}/`;

type Pt = { x: number; y: number };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function st(page: Page) {
  return page.evaluate(() => (window as any).__ktn.state());
}
async function btn(page: Page, id: string): Promise<Pt> {
  const p = await page.evaluate((i) => (window as any).__ktn.button(i), id);
  if (!p) throw new Error(`button ${id} not found`);
  return p;
}
async function tap(page: Page, p: Pt) {
  await page.mouse.click(p.x, p.y);
  await wait(80);
}
async function swipeAcross(page: Page) {
  const a: Pt = await page.evaluate(() => (window as any).__ktn.toastPoint(-185, 10));
  const b: Pt = await page.evaluate(() => (window as any).__ktn.toastPoint(185, -10));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await wait(350);
}
async function servePiece(page: Page, k: number, flick = false) {
  const p: Pt = await page.evaluate((i) => (window as any).__ktn.piece(i), k);
  if (flick) {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y + 160, { steps: 5 });
    await page.mouse.up();
  } else await tap(page, p);
  await wait(320);
}

const results: Array<Record<string, unknown>> = [];
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  for (const vp of [
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 1024, height: 1366 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("request", (r) => {
      if (!r.url().startsWith(base) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) problems.push(`remote request: ${r.url()}`);
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
    });
    await page.goto(`${base}?e2e`);
    await page.waitForFunction(() => !!(window as any).__ktn);
    await wait(400);
    const shot = (n: string) => page.screenshot({ path: join(OUT, `${vp.name}-${n}.png`) });
    const log: Array<Record<string, unknown>> = [];
    const snap = async (label: string) => log.push({ label, ...(await st(page)) });

    await shot("00-start");
    await tap(page, await btn(page, "start"));

    // Order 1: half of the toast.
    await tap(page, await btn(page, "dial:2"));
    await shot("01-half-lines");
    await swipeAcross(page);
    await shot("01-half-cut");
    await servePiece(page, 0);
    await wait(500);
    await snap("half served");
    await shot("01-half-matched");
    await tap(page, await btn(page, "next"));

    // Order 2: a quarter of the toast.
    await tap(page, await btn(page, "dial:4"));
    await swipeAcross(page);
    await shot("02-quarter-cut");
    await servePiece(page, 2, true);
    await wait(500);
    await snap("quarter served");
    await shot("02-quarter-matched");
    await tap(page, await btn(page, "next"));

    // Order 3: three eighths, first on six pieces (Not yet), then on eight.
    await tap(page, await btn(page, "dial:6"));
    await swipeAcross(page);
    await shot("03-eighths-six-cut");
    await servePiece(page, 0);
    await servePiece(page, 1);
    await snap("two sixths placed");
    await servePiece(page, 2);
    await wait(150);
    await snap("third sixth");
    await shot("03-eighths-not-yet");
    await wait(1900);
    await snap("healed");
    await shot("03-eighths-healed");
    await tap(page, await btn(page, "dial:8"));
    // A partial swipe (lines 1 to 5 only), then a second swipe must still cut the moved group.
    {
      const a: Pt = await page.evaluate(() => (window as any).__ktn.toastPoint(-185, 0));
      const b: Pt = await page.evaluate(() => (window as any).__ktn.toastPoint(50, 0));
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 6 });
      await page.mouse.up();
      await wait(350);
    }
    await snap("partial cut");
    await shot("03-eighths-partial-cut");
    await swipeAcross(page);
    await snap("second cut");
    await shot("03-eighths-eight-cut");
    await servePiece(page, 1);
    await servePiece(page, 4, true);
    await servePiece(page, 6);
    await wait(500);
    await snap("three eighths served");
    await shot("03-eighths-matched");
    await tap(page, await btn(page, "next"));
    await wait(200);
    await snap("end");
    await shot("04-end");
    // Tap the centre of Play again, then the left edge of the Start-sized pill hit area check.
    await tap(page, await btn(page, "again"));
    await wait(200);
    await snap("again");

    const byLabel = Object.fromEntries(log.map((l) => [l.label, l]));
    const checks = {
      halfMatched: (byLabel["half served"] as any).matched === true,
      quarterMatched: (byLabel["quarter served"] as any).matched === true,
      notYetShown: (byLabel["third sixth"] as any).message === "Not yet. Try another number of pieces.",
      twoSixthsPlaced: (byLabel["two sixths placed"] as any).served.length === 2,
      healed: (byLabel["healed"] as any).chosen === null && (byLabel["healed"] as any).cutLines.length === 0,
      partialThenRest:
        JSON.stringify((byLabel["partial cut"] as any).cutLines) === "[1,2,3,4,5]" &&
        (byLabel["second cut"] as any).cutLines.length === 7,
      playAgainCentreWorks: (byLabel["again"] as any).phase === "choose" && (byLabel["again"] as any).order === "P2-1-2",
      eighthsMatched: (byLabel["three eighths served"] as any).matched === true,
      ended: (byLabel["end"] as any).phase === "end",
      noProblems: problems.length === 0,
    };
    results.push({ viewport: vp, checks, problems, log });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.stop(true);
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(results, null, 2) + "\n");
const ok = results.every((r) => Object.values(r.checks as Record<string, boolean>).every(Boolean));
for (const r of results) console.log((r.viewport as any).name, JSON.stringify(r.checks), (r.problems as string[]).join("; "));
console.log(ok ? "e2e evidence: all checks pass" : "e2e evidence: FAILED");
process.exit(ok ? 0 : 1);
