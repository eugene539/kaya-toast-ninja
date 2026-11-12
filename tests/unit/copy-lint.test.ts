import { describe, expect, test } from "bun:test";
import { checkChildString, extractStrings } from "../../tools/copy-lint";

describe("copy lint", () => {
  test("extracts quoted and template strings, skipping comments and regex", () => {
    const src = [
      'const a = "Not yet."; // "comment 1/2"',
      "const r = /a\\/b/g; const t = `x ${n}/${d} y`;",
      "/* 'block 3/4' */ const b = 'ok';",
    ].join("\n");
    const s = extractStrings(src);
    expect(s.map((x) => x.value)).toEqual(["Not yet.", "x ${}/${} y", "ok"]);
    expect(s[1]!.line).toBe(2);
  });
  test("nested template substitutions", () => {
    const s = extractStrings("const t = `a ${f(`b ${c}`)} d`;");
    expect(s.map((x) => x.value).sort()).toEqual(["a ${} d", "b ${}"].sort());
  });
  test("rules", () => {
    expect(checkChildString("three 3/8 of it", false, false)).toContain("slashed fraction");
    expect(checkChildString("${}/${}", true, false)).toContain("slashed fraction");
    expect(checkChildString("Great \u{1F600}", false, false)).toContain("emoji");
    expect(checkChildString("a \u2014 b", false, false)).toContain("en or em dash");
    expect(checkChildString("the best toast", false, true)).toContain("banned word");
    expect(checkChildString("a sharp knife", false, true)).toContain("banned word");
    expect(checkChildString("Not yet. Try another number of pieces.", false, true)).toEqual([]);
  });
});
