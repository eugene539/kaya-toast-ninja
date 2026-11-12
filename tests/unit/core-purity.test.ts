import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// src/core is pure TypeScript (Docs/10 section 2.2): no Phaser, no Capacitor, no DOM globals.
const CORE = join(import.meta.dir, "../../src/core");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("src/core purity", () => {
  const all = files(CORE);
  test("finds the core sources", () => expect(all.length).toBeGreaterThan(5));
  for (const f of all) {
    test(f.slice(CORE.length + 1), () => {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/from\s+["'](phaser|@capacitor\/[^"']+)["']/);
      expect(src).not.toMatch(/import\(\s*["'](phaser|@capacitor\/[^"']+)["']\s*\)/);
      expect(src).not.toMatch(/\b(window|document)\./);
    });
  }
});
