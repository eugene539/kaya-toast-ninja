// Compares the builders' enumeration (tools/enumerate-orders.ts) with Codex's independent one
// (tests/fixtures/orders-codex.json, written from spec/SPEC-orders.md alone). Exit 1 on any difference.
// Usage: bun tools/solver-diff.ts [codex.json]
import { enumerate } from "./enumerate-orders";

const path = process.argv[2] ?? "tests/fixtures/orders-codex.json";
const file = Bun.file(path);
if (!(await file.exists())) {
  console.error(`solver-diff: ${path} not found`);
  process.exit(2);
}
const theirs = (await file.json()) as unknown;
const ours = enumerate() as unknown;

const diffs: string[] = [];
function walk(a: unknown, b: unknown, at: string): void {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return void diffs.push(`${at}: array vs non-array`);
    if (a.length !== b.length) diffs.push(`${at}: length ${a.length} (builders) vs ${b.length} (codex)`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${at}[${i}]`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      if (!(k in a)) diffs.push(`${at}.${k}: missing in builders`);
      else if (!(k in b)) diffs.push(`${at}.${k}: missing in codex`);
      else walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`);
    }
    return;
  }
  if (a !== b) diffs.push(`${at}: ${JSON.stringify(a)} (builders) vs ${JSON.stringify(b)} (codex)`);
}
walk(ours, theirs, "$");

const o = ours as { levels: Record<string, { orders: unknown[] }> };
const count = Object.values(o.levels).reduce((s, l) => s + l.orders.length, 0);
if (diffs.length) {
  console.error(`solver-diff: ${diffs.length} difference(s) over ${count} orders`);
  for (const d of diffs) console.error("  " + d);
  process.exit(1);
}
console.log(`solver-diff: zero differences over ${count} orders (P1 and P2)`);
