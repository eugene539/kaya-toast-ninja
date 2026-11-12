import { describe, expect, test } from "bun:test";
import { initialFlow, step, type FlowEvent, type FlowState } from "../../src/game/flow";

function run(s: FlowState, ...events: FlowEvent[]): { s: FlowState; kinds: string[] } {
  const kinds: string[] = [];
  for (const e of events) {
    const r = step(s, e);
    s = r.state;
    kinds.push(...r.effects.map((x) => x.kind));
  }
  return { s, kinds };
}
const all = (d: number) => ({ type: "cut", lines: Array.from({ length: d - 1 }, (_, i) => i + 1) }) as const;

describe("flow: the order state machine", () => {
  test("start, choose, cut, serve, matched, next", () => {
    let { s, kinds } = run(initialFlow("P2"), { type: "start" }, { type: "dial", d: 2 }, all(2), { type: "serve", k: 0 });
    expect(kinds).toEqual(["orderBegun", "chosen", "cut", "matched"]);
    expect(s.phase).toBe("matched");
    expect(s.marks).toEqual({ exact: true, smart: true, tidy: true });
    ({ s } = run(s, { type: "next" }));
    expect(s.phase).toBe("choose");
    expect(s.orderIdx).toBe(1);
    expect(s.chosen).toBeNull();
  });

  test("three eighths on six: placed, placed, notYet, healed back to choose", () => {
    let { s } = run(initialFlow("P2"), { type: "start" }, { type: "dial", d: 2 }, all(2), { type: "serve", k: 0 }, { type: "next" });
    ({ s } = run(s, { type: "dial", d: 4 }, all(4), { type: "serve", k: 1 }, { type: "next" }));
    expect(s.orderIdx).toBe(2);
    let kinds: string[];
    ({ s, kinds } = run(s, { type: "dial", d: 6 }, all(6), { type: "serve", k: 0 }, { type: "serve", k: 1 }, { type: "serve", k: 2 }));
    expect(kinds).toEqual(["chosen", "cut", "placed", "placed", "notYet"]);
    expect(s.phase).toBe("notYet");
    ({ s, kinds } = run(s, { type: "dial", d: 8 }, { type: "serve", k: 3 }));
    expect(kinds).toEqual(["ignored", "ignored"]); // nothing happens while it heals
    ({ s, kinds } = run(s, { type: "healed" }));
    expect(kinds).toEqual(["healed"]);
    expect(s.phase).toBe("choose");
    expect(s.cutLines).toEqual([]);
    expect(s.served).toEqual([]);
    expect(s.plate.served).toHaveLength(0);
    ({ s } = run(s, { type: "dial", d: 8 }, all(8), { type: "serve", k: 0 }, { type: "serve", k: 4 }, { type: "serve", k: 7 }));
    expect(s.phase).toBe("matched");
    expect(s.marks).toEqual({ exact: false, smart: true, tidy: true });
    ({ s, kinds } = run(s, { type: "next" }, { type: "again" }));
    expect(kinds).toEqual(["ended", "orderBegun"]);
    expect(s.orderIdx).toBe(0);
  });

  test("the dial can change before cutting, freely", () => {
    const { s } = run(initialFlow("P2"), { type: "start" }, { type: "dial", d: 6 }, { type: "dial", d: 2 });
    expect(s.chosen).toBe(2);
    expect(s.retries).toBe(0);
  });

  test("after cutting, a dial tap starts the toast again (never stuck); it costs Exact only", () => {
    let { s, kinds } = run(initialFlow("P2"), { type: "start" }, { type: "dial", d: 4 }, all(4), { type: "serve", k: 0 }, { type: "dial", d: 2 });
    expect(kinds).toEqual(["orderBegun", "chosen", "cut", "placed", "chosen"]);
    expect(s.phase).toBe("cut");
    expect(s.chosen).toBe(2);
    expect(s.cutLines).toEqual([]);
    expect(s.served).toEqual([]);
    expect(s.plate.served).toHaveLength(0);
    expect(s.retries).toBe(1);
    ({ s } = run(s, all(2), { type: "serve", k: 1 }));
    expect(s.marks).toEqual({ exact: false, smart: true, tidy: true });
  });

  test("partial cuts: joined strips are refused, swipes count for Tidy", () => {
    let { s, kinds } = run(initialFlow("P2"), { type: "start" }, { type: "dial", d: 2 }, { type: "cut", lines: [] });
    expect(kinds.at(-1)).toBe("ignored");
    ({ s } = run(initialFlow("P2"), { type: "start" }, { type: "next" }));
    expect(s.phase).toBe("choose");
    let r = run(s, { type: "next" }, { type: "dial", d: 4 }, { type: "cut", lines: [2] }, { type: "serve", k: 0 });
    expect(r.kinds.at(-1)).toBe("refused"); // strip 0 is still joined to strip 1
    r = run(r.s, { type: "cut", lines: [2, 1] }, { type: "serve", k: 0 });
    expect(r.s.phase).toBe("serve");
    expect(r.s.swipes).toBe(2);
    expect(r.s.cutLines).toEqual([1, 2]);
    expect(r.kinds.at(-1)).toBe("placed"); // a half needs two quarters
    r = run(r.s, { type: "serve", k: 0 }, { type: "serve", k: 1 });
    expect(r.kinds).toEqual(["refused", "matched"]);
    expect(r.s.marks).toEqual({ exact: true, smart: false, tidy: false });
  });

  test("invalid events are ignored in every phase", () => {
    const s0 = initialFlow("P2");
    for (const e of [{ type: "dial", d: 2 }, { type: "cut", lines: [1] }, { type: "serve", k: 0 }, { type: "healed" }, { type: "next" }, { type: "again" }] as FlowEvent[]) {
      expect(step(s0, e).state).toBe(s0);
    }
    const { s } = run(s0, { type: "start" });
    expect(step(s, { type: "dial", d: 7 }).state).toBe(s);
    expect(step(s, { type: "start" }).state).toBe(s);
  });

  test("P1 mode: dial 2 and 4, words only, its three orders", () => {
    const s = initialFlow("P1");
    expect(s.dial).toEqual([2, 4]);
    expect(s.orders.map((o) => o.spoken)).toEqual(["half of the toast", "a quarter of the toast", "three quarters of the toast"]);
    expect(s.orders.every((o) => !o.stacked)).toBe(true);
    const { s: t } = run(s, { type: "start" }, { type: "dial", d: 3 });
    expect(t.chosen).toBeNull(); // 3 is not on the P1 dial
  });
});
