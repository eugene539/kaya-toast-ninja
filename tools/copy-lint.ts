// House copy rules (Docs/10 section 2.3), run in CI. Fails on:
//  - U+2013 or U+2014 in any text file of the repo;
//  - emoji in any child-facing string (string literals in src/copy and src/game, text in index.html);
//  - a digit-slash-digit pattern (or a slash between two template substitutions) in a child-facing string;
//  - the words best, only, number one, guaranteed, knife, blade, sword (and plurals) in src/copy;
//  - fraction text rendered outside src/game/ui/StackedFraction.ts.
// Usage: bun tools/copy-lint.ts [root]
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface Finding {
  file: string;
  line: number;
  rule: string;
  text: string;
}

export interface StringLit {
  value: string;
  line: number;
  /** For template literals: the raw text with substitutions replaced by "${}". */
  template: boolean;
}

const REGEX_PREV = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

/** Extracts string and template literals from TypeScript source (comments and regex literals skipped). */
export function extractStrings(src: string): StringLit[] {
  const out: StringLit[] = [];
  let i = 0;
  let line = 1;
  let lastSig = "";
  let lastWord = "";
  const n = src.length;
  // Stack of brace depths for template substitutions.
  const tplStack: number[] = [];
  let braceDepth = 0;

  const readQuoted = (q: string): string => {
    let v = "";
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") {
        v += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (src[i] === "\n") line++;
      v += src[i];
      i++;
    }
    i++;
    return v;
  };

  const readTemplateChunk = (startLine: number, acc: { v: string }): "end" | "sub" => {
    while (i < n) {
      const c = src[i]!;
      if (c === "\\") {
        acc.v += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === "`") {
        i++;
        return "end";
      }
      if (c === "$" && src[i + 1] === "{") {
        i += 2;
        return "sub";
      }
      if (c === "\n") line++;
      acc.v += c;
      i++;
    }
    void startLine;
    return "end";
  };

  // Pending template accumulators, parallel to tplStack.
  const tplAcc: Array<{ v: string; line: number }> = [];

  while (i < n) {
    const c = src[i]!;
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const l = line;
      const v = readQuoted(c);
      out.push({ value: v, line: l, template: false });
      lastSig = "a";
      lastWord = "";
      continue;
    }
    if (c === "`") {
      i++;
      const acc = { v: "", line };
      const r = readTemplateChunk(line, acc);
      if (r === "end") out.push({ value: acc.v, line: acc.line, template: true });
      else {
        acc.v += "${}";
        tplAcc.push(acc);
        tplStack.push(braceDepth);
        braceDepth++;
      }
      lastSig = "a";
      continue;
    }
    if (c === "{") {
      braceDepth++;
      lastSig = "{";
      i++;
      continue;
    }
    if (c === "}") {
      braceDepth--;
      if (tplStack.length && braceDepth === tplStack[tplStack.length - 1]) {
        tplStack.pop();
        i++;
        const acc = tplAcc.pop()!;
        const r = readTemplateChunk(acc.line, acc);
        if (r === "end") out.push({ value: acc.v, line: acc.line, template: true });
        else {
          acc.v += "${}";
          tplAcc.push(acc);
          tplStack.push(braceDepth);
          braceDepth++;
        }
        lastSig = "a";
        continue;
      }
      lastSig = "}";
      i++;
      continue;
    }
    if (c === "/") {
      const isRegex = lastSig === "" || REGEX_PREV.has(lastSig) || ["return", "typeof", "case", "of", "in"].includes(lastWord);
      if (isRegex) {
        i++;
        let inClass = false;
        while (i < n) {
          const d = src[i]!;
          if (d === "\\") {
            i += 2;
            continue;
          }
          if (d === "\n") break;
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) break;
          i++;
        }
        i++;
        while (i < n && /[a-z]/i.test(src[i]!)) i++;
        lastSig = "a";
        lastWord = "";
        continue;
      }
      lastSig = "/";
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[A-Za-z_$0-9]/.test(c)) {
      let w = "";
      while (i < n && /[A-Za-z_$0-9]/.test(src[i]!)) w += src[i++];
      lastWord = w;
      lastSig = "a";
      continue;
    }
    lastSig = c;
    lastWord = "";
    i++;
  }
  return out;
}

const DASHES = /[\u2013\u2014]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const SLASH_FRACTION = /\d\s*\/\s*\d/;
const SLASH_SUBS = /\$\{\}\s*\/\s*\$\{\}|\d\s*\/\s*\$\{\}|\$\{\}\s*\/\s*\d/;
const BANNED = /\b(best|only|number one|guaranteed|knife|knives|blades?|swords?)\b/i;

export function checkChildString(s: string, template: boolean, banned: boolean): string[] {
  const rules: string[] = [];
  if (DASHES.test(s)) rules.push("en or em dash");
  if (EMOJI.test(s)) rules.push("emoji");
  if (SLASH_FRACTION.test(s) || (template && SLASH_SUBS.test(s))) rules.push("slashed fraction");
  if (banned && BANNED.test(s)) rules.push("banned word");
  return rules;
}

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git" || name === "evidence") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
}

const TEXT_EXT = /\.(ts|js|md|html|json|css|yml|yaml|toml|txt)$/;

export function lint(root: string): Finding[] {
  const findings: Finding[] = [];
  const files: string[] = [];
  walk(root, files);
  for (const abs of files) {
    const rel = relative(root, abs).split(sep).join("/");
    if (!TEXT_EXT.test(rel) || rel === "bun.lock") continue;
    const text = readFileSync(abs, "utf8");
    // tests/adversarial is Codex-owned (builders never edit it) and never shipped; its test titles
    // are exempt from the dash rule. Everything a child or parent reads is still checked.
    const codexOwned = rel.startsWith("tests/adversarial/");
    text.split("\n").forEach((l, idx) => {
      if (!codexOwned && DASHES.test(l)) findings.push({ file: rel, line: idx + 1, rule: "en or em dash", text: l.trim() });
    });
    const childFacing = rel.startsWith("src/copy/") || rel.startsWith("src/game/");
    if (childFacing && rel.endsWith(".ts")) {
      const banned = rel.startsWith("src/copy/");
      for (const s of extractStrings(text)) {
        for (const rule of checkChildString(s.value, s.template, banned)) {
          if (rule === "en or em dash") continue; // already reported per line
          findings.push({ file: rel, line: s.line, rule, text: s.value });
        }
      }
      if (rel.startsWith("src/game/") && rel !== "src/game/ui/StackedFraction.ts") {
        text.split("\n").forEach((l, idx) => {
          if (/(add\.text|setText|\.text\s*=)/.test(l) && /(numerator|denominator)/.test(l)) {
            findings.push({ file: rel, line: idx + 1, rule: "fraction text outside StackedFraction", text: l.trim() });
          }
        });
      }
    }
    if (rel === "index.html") {
      const visible = text.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
      for (const rule of checkChildString(visible, false, true)) {
        if (rule !== "en or em dash") findings.push({ file: rel, line: 0, rule, text: "visible text" });
      }
    }
  }
  if (existsSync(join(root, "src/game")) && !existsSync(join(root, "src/game/ui/StackedFraction.ts"))) {
    findings.push({ file: "src/game/ui/StackedFraction.ts", line: 0, rule: "StackedFraction missing", text: "" });
  }
  return findings;
}

if (import.meta.main) {
  const root = process.argv[2] ?? process.cwd();
  const f = lint(root);
  if (f.length) {
    console.error(`copy-lint: ${f.length} finding(s)`);
    for (const x of f) console.error(`  ${x.file}:${x.line} [${x.rule}] ${x.text}`);
    process.exit(1);
  }
  console.log("copy-lint: clean");
}
