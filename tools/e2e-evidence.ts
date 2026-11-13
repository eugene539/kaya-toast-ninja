// Headless evidence run of the debug web build (Phase 0): plays the three P2 demo orders, including
// "Not yet" on six pieces for eighths and changing the dial after a cut, at phone portrait
// (390x844) and tablet (1024x1366), plus the three P1 orders at phone size, under the release CSP,
// and writes screenshots plus a summary to docs/evidence/p0/.
// The debug build differs from the release build only by __KTN_DEBUG__ (the ?e2e hook, sway off for
// stable coordinates, ?level=P1).
// Usage: bun run e2e   (builds dist-debug, then runs this) [path-to-chrome-headless-shell]
import { chromium, type Page } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";

const DIST = join(import.meta.dir, "..", "dist-debug");
const OUT = join(import.meta.dir, "..", "docs", "evidence", "p0");
const exe =
  process.argv[2] ??
  join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if (!existsSync(join(DIST, "index.html"))) throw new Error("run `bun run build:debug` first");
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
  // Poll: the result buttons appear after the serve animation, which can lag on a busy machine.
  let p: Pt | null = null;
  for (let t = 0; t < 30 && !p; t++) {
    p = await page.evaluate((i) => (window as any).__ktn.button(i), id);
    if (!p) await wait(100);
  }
  if (!p) throw new Error(`button ${id} not found after 3 s; state ${JSON.stringify(await st(page))}`);
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

async function openGame(vp: { name: string; width: number; height: number }, query: string) {
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
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => !!(window as any).__ktn);
  await wait(400);
  const log: Array<Record<string, unknown>> = [];
  const snap = async (label: string) => {
    const s = await st(page);
    log.push({ label, ...s });
    return s;
  };
  const shot = (n: string) => page.screenshot({ path: join(OUT, `${vp.name}-${n}.png`) });
  return { ctx, page, problems, log, snap, shot };
}

/** The message pill stays inside a 16 unit safe margin of the 390 wide playfield. */
const messageInside = (s: any) => s.messageBounds.x >= 16 && s.messageBounds.x + s.messageBounds.width <= 374;

try {
  for (const vp of [
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 1024, height: 1366 },
  ]) {
    const { ctx, page, problems, log, snap, shot } = await openGame(vp, "e2e");
    await shot("00-start");
    await tap(page, await btn(page, "start"));

    // Order 1: half of the toast (the plate shows the ordered amount before serving).
    await tap(page, await btn(page, "dial:2"));
    await shot("01-half-lines");
    await swipeAcross(page);
    await shot("01-half-cut");
    await servePiece(page, 0);
    await wait(700);
    const half = await snap("half served");
    await shot("01-half-matched");
    await tap(page, await btn(page, "next"));

    // Order 2: a quarter. Choose six, cut, change mind on the dial (heal and re-cut), then four.
    await tap(page, await btn(page, "dial:6"));
    await swipeAcross(page);
    await servePiece(page, 0);
    await snap("quarter on six, one placed");
    await tap(page, await btn(page, "dial:4"));
    await wait(350);
    const changed = await snap("dial changed after cut");
    await shot("02-quarter-dial-changed");
    await swipeAcross(page);
    await shot("02-quarter-cut");
    await servePiece(page, 2, true);
    await wait(700);
    const quarter = await snap("quarter served");
    await shot("02-quarter-matched");
    await tap(page, await btn(page, "next"));

    // Order 3: three eighths, first on six pieces (Not yet), then on eight with a partial cut.
    await tap(page, await btn(page, "dial:6"));
    await swipeAcross(page);
    await shot("03-eighths-six-cut");
    await servePiece(page, 0);
    await servePiece(page, 1);
    await snap("two sixths placed");
    await servePiece(page, 2);
    await wait(150);
    const notYet = await snap("third sixth");
    await shot("03-eighths-not-yet");
    await wait(1900);
    await snap("healed");
    await shot("03-eighths-healed");
    await tap(page, await btn(page, "dial:8"));
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
    await wait(700);
    const eighths = await snap("three eighths served");
    await shot("03-eighths-matched");
    await tap(page, await btn(page, "mark:smart"));
    await snap("smart explained");
    await tap(page, await btn(page, "next"));
    await wait(200);
    await snap("end");
    await shot("04-end");
    await tap(page, await btn(page, "again"));
    await wait(200);
    const again = await snap("again");

    const byLabel = Object.fromEntries(log.map((l) => [l.label, l])) as Record<string, any>;
    const checks = {
      halfMatched: half.matched === true && JSON.stringify(half.marks) === '{"exact":true,"smart":true,"tidy":true}',
      dialChangeAfterCut: byLabel["quarter on six, one placed"].served.length === 1 && changed.phase === "cut" && changed.chosen === 4 && changed.served.length === 0 && changed.cutLines.length === 0,
      quarterMatchedNotExact: quarter.matched === true && quarter.marks.exact === false && quarter.marks.smart === true,
      notYetShownAndWrapped: notYet.message === "Not yet. Try another number of pieces." && messageInside(notYet),
      twoSixthsPlaced: byLabel["two sixths placed"].served.length === 2,
      healed: byLabel["healed"].phase === "choose" && byLabel["healed"].chosen === null && byLabel["healed"].cutLines.length === 0,
      partialThenRest: JSON.stringify(byLabel["partial cut"].cutLines) === "[1,2,3,4,5]" && byLabel["second cut"].cutLines.length === 7,
      eighthsMatched: eighths.matched === true && eighths.marks.exact === false,
      markExplained: byLabel["smart explained"].message === "Smart. The fewest pieces.",
      ended: byLabel["end"].phase === "end",
      playAgainCentreWorks: again.phase === "choose" && again.order === "P2-1-2",
      noProblems: problems.length === 0,
    };
    results.push({ run: `${vp.name} P2`, checks, problems, log });
    await ctx.close();
  }

  // P1 mode (debug switch ?level=P1): dial 2 and 4, words only, half, a quarter, three quarters.
  {
    const vp = { name: "phone-p1", width: 390, height: 844 };
    const { ctx, page, problems, log, snap, shot } = await openGame(vp, "e2e&level=P1");
    await tap(page, await btn(page, "start"));
    const first = await snap("p1 start");
    await shot("01-half-choose");
    await tap(page, await btn(page, "dial:2"));
    await swipeAcross(page);
    await servePiece(page, 1);
    await wait(700);
    await snap("p1 half");
    await shot("01-half-matched");
    await tap(page, await btn(page, "next"));
    await tap(page, await btn(page, "dial:4"));
    await swipeAcross(page);
    await servePiece(page, 0);
    await wait(700);
    await snap("p1 quarter");
    await tap(page, await btn(page, "next"));
    await tap(page, await btn(page, "dial:2"));
    await swipeAcross(page);
    await servePiece(page, 0);
    await servePiece(page, 1);
    await wait(150);
    await snap("p1 three quarters on two");
    await shot("03-three-quarters-not-yet");
    await wait(1900);
    await tap(page, await btn(page, "dial:4"));
    await swipeAcross(page);
    await servePiece(page, 0);
    await servePiece(page, 1);
    await servePiece(page, 3);
    await wait(700);
    await snap("p1 three quarters");
    await shot("03-three-quarters-matched");
    const byLabel = Object.fromEntries(log.map((l) => [l.label, l])) as Record<string, any>;
    const checks = {
      p1Dial: JSON.stringify(first.dial) === "[2,4]" && first.level === "P1",
      p1Half: byLabel["p1 half"].matched === true,
      p1Quarter: byLabel["p1 quarter"].matched === true,
      p1NotYet: byLabel["p1 three quarters on two"].message === "Not yet. Try another number of pieces.",
      p1ThreeQuarters: byLabel["p1 three quarters"].matched === true && byLabel["p1 three quarters"].order === "P1-3-4",
      noProblems: problems.length === 0,
    };
    results.push({ run: "phone P1", checks, problems, log });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.stop(true);
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(results, null, 2) + "\n");
const ok = results.every((r) => Object.values(r.checks as Record<string, boolean>).every(Boolean));
for (const r of results) console.log(r.run, JSON.stringify(r.checks), (r.problems as string[]).join("; "));
console.log(ok ? "e2e evidence: all checks pass" : "e2e evidence: FAILED");
process.exit(ok ? 0 : 1);
