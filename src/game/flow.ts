// The order flow as an explicit state machine (Phase 0 developer lens; Phase 1 grows it).
// Pure TypeScript: no Phaser, no DOM. The scene feeds it events and animates the effects it returns.
// Every maths decision is delegated to src/core (serve, marks, partitions, separation).
//
//   start --start--> choose --dial--> cut --cut--> serve --serve(matched)--> matched --next--> choose
//                                      ^   dial      |  \--serve(notYet)--> notYet --healed--> choose
//                                      |  (change)   |
//                                      +----dial-----+  (start the toast again: heal and re-cut)
//   matched --next (last order)--> end --again--> choose
import {
  DEMO_ORDERS,
  dialFor,
  emptyPlate,
  isSeparated,
  makePartition,
  marksFor,
  orderSpace,
  serve,
  type Level,
  type Marks,
  type Order,
  type Partition,
  type Plate,
} from "../core/index";

export type FlowPhase = "start" | "choose" | "cut" | "serve" | "notYet" | "matched" | "end";

export interface FlowState {
  readonly phase: FlowPhase;
  readonly level: Level;
  readonly orders: ReadonlyArray<Order>;
  readonly orderIdx: number;
  readonly dial: ReadonlyArray<number>;
  readonly chosen: number | null;
  readonly partition: Partition | null;
  readonly partitionSeq: number;
  readonly cutLines: ReadonlyArray<number>;
  /** Strip indices on the plate, in serve order (slot j holds served[j]). */
  readonly served: ReadonlyArray<number>;
  readonly plate: Plate;
  /** Swipes that cut at least one new line on the current partition. */
  readonly swipes: number;
  /** "Not yet" heals plus starting the toast again after cutting, this order. Exact needs 0. */
  readonly retries: number;
  readonly marks: Marks | null;
}

export type FlowEvent =
  | { readonly type: "start" }
  | { readonly type: "dial"; readonly d: number }
  | { readonly type: "cut"; readonly lines: ReadonlyArray<number> }
  | { readonly type: "serve"; readonly k: number }
  | { readonly type: "healed" }
  | { readonly type: "next" }
  | { readonly type: "again" };

export type FlowEffect =
  | { readonly kind: "orderBegun" }
  | { readonly kind: "chosen"; readonly d: number; readonly restarted: boolean }
  | { readonly kind: "cut"; readonly lines: ReadonlyArray<number>; readonly all: boolean }
  | { readonly kind: "placed"; readonly k: number; readonly slot: number }
  | { readonly kind: "matched"; readonly k: number; readonly slot: number; readonly marks: Marks }
  | { readonly kind: "notYet"; readonly k: number }
  | { readonly kind: "healed" }
  | { readonly kind: "refused"; readonly k: number }
  | { readonly kind: "ignored" }
  | { readonly kind: "ended" };

export interface FlowStep {
  readonly state: FlowState;
  readonly effects: ReadonlyArray<FlowEffect>;
}

/** The demo orders for a level: P2 the three Phase 0 demo orders; P1 its whole order space. */
export function demoOrdersFor(level: Level): Order[] {
  return level === "P2" ? [...DEMO_ORDERS] : orderSpace("P1");
}

export function initialFlow(level: Level = "P2"): FlowState {
  const orders = demoOrdersFor(level);
  return {
    phase: "start",
    level,
    orders,
    orderIdx: 0,
    dial: dialFor(level),
    chosen: null,
    partition: null,
    partitionSeq: 0,
    cutLines: [],
    served: [],
    plate: emptyPlate(orders[0]!.value),
    swipes: 0,
    retries: 0,
    marks: null,
  };
}

const IGNORED = (state: FlowState): FlowStep => ({ state, effects: [{ kind: "ignored" }] });

/** A fresh, uncut toast for the current order, with no number chosen. */
function freshToast(s: FlowState): FlowState {
  const order = s.orders[s.orderIdx]!;
  return { ...s, chosen: null, partition: null, cutLines: [], served: [], plate: emptyPlate(order.value), swipes: 0 };
}

function beginOrder(s: FlowState, idx: number): FlowStep {
  const next = freshToast({ ...s, orderIdx: idx, retries: 0, marks: null });
  return { state: { ...next, phase: "choose" }, effects: [{ kind: "orderBegun" }] };
}

function choose(s: FlowState, d: number, restarted: boolean): FlowStep {
  const seq = s.partitionSeq + 1;
  const base = freshToast(s);
  return {
    state: {
      ...base,
      phase: "cut",
      chosen: d,
      partition: makePartition(`t${seq}`, d),
      partitionSeq: seq,
      retries: restarted ? s.retries + 1 : s.retries,
    },
    effects: [{ kind: "chosen", d, restarted }],
  };
}

export function step(s: FlowState, e: FlowEvent): FlowStep {
  switch (e.type) {
    case "start":
      return s.phase === "start" ? beginOrder(s, 0) : IGNORED(s);

    case "again":
      return s.phase === "end" ? beginOrder(s, 0) : IGNORED(s);

    case "next":
      if (s.phase !== "matched") return IGNORED(s);
      if (s.orderIdx + 1 < s.orders.length) return beginOrder(s, s.orderIdx + 1);
      return { state: { ...s, phase: "end" }, effects: [{ kind: "ended" }] };

    case "dial": {
      if (!s.dial.includes(e.d)) return IGNORED(s);
      // Before any cut the dial is free to change; after a cut a dial tap starts the toast again.
      if (s.phase === "choose" || s.phase === "cut") return choose(s, e.d, false);
      if (s.phase === "serve") return choose(s, e.d, true);
      return IGNORED(s);
    }

    case "cut": {
      if ((s.phase !== "cut" && s.phase !== "serve") || s.chosen === null) return IGNORED(s);
      const d = s.chosen;
      const fresh = [...new Set(e.lines)].filter(
        (i) => Number.isInteger(i) && i >= 1 && i <= d - 1 && !s.cutLines.includes(i),
      );
      if (fresh.length === 0) return IGNORED(s);
      const cutLines = [...s.cutLines, ...fresh].sort((a, b) => a - b);
      return {
        state: { ...s, phase: "serve", cutLines, swipes: s.swipes + 1 },
        effects: [{ kind: "cut", lines: fresh.sort((a, b) => a - b), all: cutLines.length === d - 1 }],
      };
    }

    case "serve": {
      if (s.phase !== "serve" || !s.partition || s.chosen === null) return IGNORED(s);
      const k = e.k;
      const d = s.chosen;
      if (!Number.isInteger(k) || k < 0 || k >= d || s.served.includes(k) || !isSeparated(d, s.cutLines, k)) {
        return { state: s, effects: [{ kind: "refused", k }] };
      }
      const res = serve(s.plate, s.partition.pieces[k]!);
      switch (res.outcome) {
        case "placed": {
          const served = [...s.served, k];
          return { state: { ...s, plate: res.plate, served }, effects: [{ kind: "placed", k, slot: served.length - 1 }] };
        }
        case "matched": {
          const served = [...s.served, k];
          const order = s.orders[s.orderIdx]!;
          const marks = marksFor(order, s.dial, { notYets: s.retries, finalDenominator: d, swipesOnFinal: s.swipes });
          return {
            state: { ...s, phase: "matched", plate: res.plate, served, marks },
            effects: [{ kind: "matched", k, slot: served.length - 1, marks }],
          };
        }
        case "notYet":
          return { state: { ...s, phase: "notYet", retries: s.retries + 1 }, effects: [{ kind: "notYet", k }] };
        default:
          return { state: s, effects: [{ kind: "refused", k }] };
      }
    }

    case "healed":
      return s.phase === "notYet"
        ? { state: { ...freshToast(s), phase: "choose" }, effects: [{ kind: "healed" }] }
        : IGNORED(s);
  }
}

export function currentOrder(s: FlowState): Order {
  return s.orders[s.orderIdx]!;
}
