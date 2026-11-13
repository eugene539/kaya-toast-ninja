// Phase 0 prototype: choose, cut, serve for the demo orders (Docs/10 Phase 0 scope).
// The flow (phases, retries, marks) lives in ./flow.ts; every maths and geometry decision comes
// from src/core. This file turns input into flow events and draws and animates the effects.
import Phaser from "phaser";
import {
  TOAST,
  canFill,
  createGestureTracker,
  groupsOf,
  isSeparated,
  labelFor,
  layoutCut,
  localToWorld,
  plateSlots,
  resolveSwipeOnGroups,
  snapLineX,
  toNumber,
  worldToLocal,
  type GestureEvent,
  type Level,
  type Marks,
  type PointerSample,
  type Pose,
  type Rect,
  type Vec2,
} from "../core/index";
import { COPY, customerLine } from "../copy/strings";
import { Sfx } from "./audio";
import { currentOrder, initialFlow, step, type FlowEffect, type FlowEvent, type FlowState } from "./flow";
import { attachLifecycle } from "./lifecycle";
import { attachPointer } from "./pointer";
import { speakPlaceholder, stopPlaceholderSpeech, warmVoices } from "./placeholderVoice";
import { EDGE_KEY, makeToastTextures, TOAST_KEY } from "./toastTexture";
import { stackedFraction } from "./ui/StackedFraction";

const W = TOAST.width;
const H = TOAST.height;
const INK = 0x2b1d14;
const CREAM = 0xfff8ec;
const BRASS = 0xc9a14a;
const BRASS_DARK = 0x8a6a22;
const GOLD = 0xffd166;
const FONT = "Trebuchet MS, Verdana, sans-serif";

const TOAST_HOME = { x: 195, y: 376 };
const PLATE_SCALE = 0.6;
const PLATE_RECT: Rect = { x: 195 - (W * PLATE_SCALE) / 2, y: 588 - (H * PLATE_SCALE) / 2, width: W * PLATE_SCALE, height: H * PLATE_SCALE };
const DIAL_C = { x: 195, y: 806 };
const DIAL_R = 104;
const DIAL_BUTTON_R = 24;
const REPLAY = { x: 322, y: 126, r: 20 };
const MESSAGE_Y = 214;

/** Debug builds only (never the release bundle): ?e2e and ?level=P1. */
const QUERY = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const E2E = __KTN_DEBUG__ && QUERY.has("e2e");
const LEVEL: Level = __KTN_DEBUG__ && QUERY.get("level") === "P1" ? "P1" : "P2";

interface GroupView {
  start: number;
  end: number;
  c: Phaser.GameObjects.Container;
}

export class PrototypeScene extends Phaser.Scene {
  private readonly sfx = new Sfx();
  private readonly tracker = createGestureTracker();
  private flow: FlowState = initialFlow(LEVEL);

  private pose: Pose = { ...TOAST_HOME, angle: 0 };
  private frozenPose: Pose | null = null;
  private swayT = 0;
  private prevStripPos = new Map<number, { x: number; y: number; angle: number }>();

  private toastC!: Phaser.GameObjects.Container;
  private groups: GroupView[] = [];
  private plateLayer!: Phaser.GameObjects.Container;
  private targetLayer!: Phaser.GameObjects.Container;
  private plateObjs: Phaser.GameObjects.GameObject[] = [];
  private bubble!: Phaser.GameObjects.Container;
  private messageBg!: Phaser.GameObjects.Graphics;
  private message!: Phaser.GameObjects.Text;
  private dialLayer!: Phaser.GameObjects.Container;
  private dialPointer!: Phaser.GameObjects.Container;
  private resultLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private trail!: Phaser.GameObjects.Graphics;
  private trailPts: Vec2[] = [];
  private crumbs: Phaser.GameObjects.Rectangle[] = [];
  /** Hit areas in design space, matching what is drawn (centre and half sizes). */
  private buttons: Array<{ id: string; x: number; y: number; hw: number; hh: number }> = [];
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super("Prototype");
  }

  preload(): void {
    this.load.image("stall_plate", "textures/stall_plate.jpg");
  }

  create(): void {
    makeToastTextures(this);
    warmVoices();
    const bg = this.add.image(195, 422, "stall_plate");
    bg.setScale(Math.max(390 / bg.width, 844 / bg.height));
    this.add.rectangle(195, 422, 390, 844, 0xfff4e0, 0.62);
    // A cream band under the dial and results, so buttons never sit on busy stall art.
    this.add.graphics().fillStyle(CREAM, 0.9).fillRoundedRect(24, 680, 342, 190, 28);

    this.plateLayer = this.add.container(0, 0);
    this.drawPlateBase();
    this.targetLayer = this.add.container(0, 0);
    this.plateLayer.add(this.targetLayer);
    this.toastC = this.add.container(TOAST_HOME.x, TOAST_HOME.y);
    this.trail = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      this.crumbs.push(this.add.rectangle(-50, -50, 5, 4, 0xb8652a).setVisible(false));
    }
    this.bubble = this.add.container(0, 0);
    this.messageBg = this.add.graphics();
    this.message = this.add
      .text(195, MESSAGE_Y, "", {
        fontFamily: FONT,
        fontSize: "20px",
        color: "#2b1d14",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: 316, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    this.dialLayer = this.add.container(0, 0);
    this.resultLayer = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0);
    this.drawDial();
    this.showStart();

    const canvas = this.game.canvas;
    const detach = attachPointer(canvas, (s) => this.onSample(s), () => this.onReset());
    const detachLifecycle = attachLifecycle({
      onPause: () => {
        this.sfx.suspend();
        stopPlaceholderSpeech();
      },
      onResume: () => this.sfx.resume(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      detach();
      detachLifecycle();
      for (const t of this.timers) t.remove(false);
      this.timers = [];
    });
    if (E2E) this.exposeDebug();
  }

  override update(_t: number, dtMs: number): void {
    const phase = this.flow.phase;
    if (this.frozenPose || phase === "start" || phase === "end") return;
    this.swayT += dtMs / 1000;
    const amp = E2E ? 0 : this.flow.cutLines.length ? 0.025 : 0.07;
    this.pose = { ...TOAST_HOME, angle: amp * Math.sin(this.swayT * 1.3) };
    this.toastC.setRotation(this.pose.angle);
  }

  private later(ms: number, fn: () => void): void {
    const t = this.time.delayedCall(ms, () => {
      this.timers = this.timers.filter((x) => x !== t);
      fn();
    });
    this.timers.push(t);
  }

  // ---------------------------------------------------------------------------
  // Flow: dispatch an event, then draw what it changed
  // ---------------------------------------------------------------------------

  private dispatch(e: FlowEvent): void {
    const before = this.flow;
    const r = step(before, e);
    this.flow = r.state;
    for (const fx of r.effects) this.apply(fx, before);
  }

  private apply(fx: FlowEffect, before: FlowState): void {
    switch (fx.kind) {
      case "orderBegun":
        this.overlay.removeAll(true);
        this.buttons = this.buttons.filter((b) => b.id === "replay" || b.id.startsWith("dial:"));
        this.clearResult();
        this.clearPlate();
        this.drawTarget();
        this.prevStripPos.clear();
        this.renderToast(false);
        this.pointDial(null);
        this.dialLayer.setVisible(true);
        this.drawBubble();
        this.say(COPY.intoHowMany);
        this.speakOrder();
        return;
      case "chosen":
        if (fx.restarted) {
          // Starting the toast again after a cut: the plate empties and the toast heals at once.
          this.sfx.heal();
          this.fadePlate();
          this.say(COPY.startAgain);
        } else {
          this.sfx.click();
          this.say(COPY.swipeAcross);
        }
        this.prevStripPos.clear();
        this.renderToast(false);
        if (fx.restarted) this.popToast();
        this.pointDial(fx.d);
        return;
      case "cut": {
        this.sfx.shink();
        this.spawnCrumbs(fx.lines, this.frozenPose ?? this.pose);
        this.renderToast(true);
        this.say(fx.all ? COPY.flickPieces : COPY.keepCutting);
        return;
      }
      case "placed":
      case "matched": {
        const view = this.groups.find((g) => g.start === fx.k && g.end === fx.k);
        this.sfx.pop();
        this.flyToPlate(fx.k, fx.slot, view);
        this.renderToast(false);
        if (fx.kind === "matched") this.onMatched(fx.marks);
        return;
      }
      case "notYet": {
        const view = this.groups.find((g) => g.start === fx.k && g.end === fx.k);
        this.sfx.boing();
        if (view) this.boing(view.c);
        this.say(COPY.notYet);
        speakPlaceholder(COPY.notYet);
        this.later(1300, () => this.heal(before.chosen ?? 2));
        return;
      }
      case "healed":
        this.clearPlate();
        this.prevStripPos.clear();
        this.renderToast(false);
        this.pointDial(null);
        this.say(COPY.intoHowMany);
        return;
      case "refused": {
        const view = this.groups.find((g) => g.start <= fx.k && g.end >= fx.k);
        this.sfx.boing();
        if (view) this.boing(view.c);
        return;
      }
      case "ended":
        this.clearResult();
        this.say(COPY.allServed);
        this.addButton(this.resultLayer, "again", 195, 790, COPY.playAgain);
        return;
      case "ignored":
        return;
    }
  }

  /** The heal animation after "Not yet", then the flow returns to choosing. */
  private heal(d: number): void {
    this.sfx.heal();
    const home = this.layout(d, []);
    this.fadePlate();
    for (const g of this.groups) {
      const strips = home.filter((L) => L.index >= g.start && L.index <= g.end);
      const cx = strips.reduce((s, L) => s + L.x, 0) / strips.length;
      this.tweens.add({ targets: g.c, x: cx, y: 0, angle: 0, duration: 380, ease: "Sine.easeInOut" });
    }
    this.later(420, () => this.dispatch({ type: "healed" }));
  }

  private onMatched(marks: Marks): void {
    this.later(350, () => {
      this.sfx.bell();
      this.say(COPY.matched);
      this.dialLayer.setVisible(false);
      this.showResult(marks);
    });
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private onReset(): void {
    this.tracker.reset();
    this.frozenPose = null;
    this.trail.clear();
    this.trailPts = [];
  }

  private onSample(s: PointerSample): void {
    if (s.phase === "down") this.sfx.unlock();
    const ev = this.tracker.feed(s);
    if (s.phase === "move" && this.tracker.activePointer === s.pointerId) {
      this.trailPts.push({ x: s.x, y: s.y });
      this.drawTrail();
    }
    if (ev) this.onGesture(ev);
  }

  private onGesture(ev: GestureEvent): void {
    switch (ev.kind) {
      case "start":
        this.frozenPose = this.pose; // the toast stops turning on touch
        this.trailPts = [ev.at];
        return;
      case "cancelled":
        this.endGesture();
        return;
      case "tap":
        this.onTap(ev.at);
        this.endGesture();
        return;
      case "swipe":
        this.onSwipe(ev.path);
        this.endGesture();
        return;
    }
  }

  private endGesture(): void {
    this.frozenPose = null;
    this.tweens.add({ targets: this.trail, alpha: 0, duration: 180, onComplete: () => this.trail.clear().setAlpha(1) });
    this.trailPts = [];
  }

  private drawTrail(): void {
    const g = this.trail;
    g.clear().setAlpha(1);
    const pts = this.trailPts.slice(-24);
    for (let i = 1; i < pts.length; i++) {
      const a = i / pts.length;
      g.lineStyle(10 * a, 0xfff6c8, 0.35 * a).lineBetween(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y);
      g.lineStyle(4 * a, 0xffffff, 0.9 * a).lineBetween(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y);
    }
  }

  private hitButton(p: Vec2): string | null {
    for (const b of this.buttons) {
      // Hidden dial buttons keep their hit boxes; skip them so they never shadow the visible result controls.
      if (b.id.startsWith("dial:") && !this.dialLayer.visible) continue;
      if (Math.abs(p.x - b.x) <= b.hw && Math.abs(p.y - b.y) <= b.hh) return b.id;
    }
    return null;
  }

  private onTap(p: Vec2): void {
    const id = this.hitButton(p);
    if (id === "start") return this.dispatch({ type: "start" });
    if (this.flow.phase === "start") return;
    if (id === "replay") return this.speakOrder();
    if (id === "next") return this.dispatch({ type: "next" });
    if (id === "again") return this.dispatch({ type: "again" });
    if (id?.startsWith("mark:")) return this.explainMark(id.slice(5));
    if (id?.startsWith("dial:") && this.dialLayer.visible) return this.dispatch({ type: "dial", d: Number(id.slice(5)) });
    const k = this.pieceAt(p);
    if (k !== null) this.dispatch({ type: "serve", k });
  }

  private onSwipe(path: ReadonlyArray<Vec2>): void {
    const f = this.flow;
    if ((f.phase !== "cut" && f.phase !== "serve") || f.chosen === null) return;
    const first = path[0]!;
    const last = path[path.length - 1]!;
    const k = this.pieceAt(first);
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    // Only a separated piece can be flicked to the plate; a downward swipe over a joined group is a cut.
    if (k !== null && isSeparated(f.chosen, f.cutLines, k) && dy > 30 && dy > 1.5 * Math.abs(dx)) {
      this.dispatch({ type: "serve", k }); // a flick towards the plate
      return;
    }
    const pose = this.frozenPose ?? this.pose;
    const local = path.map((q) => worldToLocal(pose, q));
    const res = resolveSwipeOnGroups(TOAST, f.chosen, local, f.cutLines, this.groupPoses(f.chosen));
    if (res.lines.length) this.dispatch({ type: "cut", lines: res.lines });
  }

  /**
   * The cut layout for this playfield. Fine partitions get a smaller fan and gap (both inside the
   * PLAN-v6 bounds: gap at least 4, fan at most 10 degrees) so eight pieces fit a 390 wide phone.
   */
  private layout(d: number, cut: ReadonlyArray<number>) {
    return layoutCut(TOAST, d, cut, d >= 6 ? { gap: 5, fanDegrees: 2 } : { gap: 6, fanDegrees: 6 });
  }

  /** Each still-joined group as drawn, for resolving later swipes (SPEC-geometry 6.1). */
  private groupPoses(d: number) {
    const cut = this.flow.cutLines;
    const layout = this.layout(d, cut);
    return groupsOf(d, cut).map((g) => {
      const strips = layout.filter((L) => L.index >= g.start && L.index <= g.end);
      return {
        start: g.start,
        end: g.end,
        x: strips.reduce((t, L) => t + L.x, 0) / strips.length,
        y: strips.reduce((t, L) => t + L.y, 0) / strips.length,
        angle: strips[0]!.angle,
      };
    });
  }

  /** Strip index under the design point (separated or not, unserved), or null. */
  private pieceAt(p: Vec2): number | null {
    const { chosen, cutLines, served } = this.flow;
    if (!chosen || cutLines.length === 0) return null;
    const pose = this.frozenPose ?? this.pose;
    const local = worldToLocal(pose, p);
    const pw = W / chosen;
    let best: number | null = null;
    let bestD = Infinity;
    for (const L of this.layout(chosen, cutLines)) {
      if (served.includes(L.index)) continue;
      const a = (-L.angle * Math.PI) / 180;
      const rx = (local.x - L.x) * Math.cos(a) - (local.y - L.y) * Math.sin(a);
      const ry = (local.x - L.x) * Math.sin(a) + (local.y - L.y) * Math.cos(a);
      // Hit area: the piece plus half the gap on each side. A joined strip is returned too, so the
      // flow can refuse it with a nudge instead of ignoring the tap.
      if (Math.abs(rx) <= pw / 2 + 4 && Math.abs(ry) <= H / 2 + 6 && Math.abs(rx) < bestD) {
        best = L.index;
        bestD = Math.abs(rx);
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Drawing: toast
  // ---------------------------------------------------------------------------

  private renderToast(animate: boolean): void {
    for (const g of this.groups) g.c.destroy();
    this.groups = [];
    const { chosen, cutLines, served } = this.flow;
    const d = chosen ?? 1;
    if (d === 1) {
      this.groups.push({ start: 0, end: 0, c: this.buildGroupView(0, 0, 1, false, false, 0, 0, 0) });
      return;
    }
    const layout = this.layout(d, cutLines);
    const next = new Map<number, { x: number; y: number; angle: number }>();
    for (const L of layout) next.set(L.index, { x: L.x, y: L.y, angle: L.angle });
    for (const grp of groupsOf(d, cutLines)) {
      let live = 0;
      for (let k = grp.start; k <= grp.end; k++) if (!served.includes(k)) live++;
      if (live === 0) continue;
      const strips = layout.filter((L) => L.index >= grp.start && L.index <= grp.end);
      const cx = strips.reduce((s, L) => s + L.x, 0) / strips.length;
      const cy = strips.reduce((s, L) => s + L.y, 0) / strips.length;
      const angle = strips[0]!.angle;
      const cutLeft = grp.start > 0 && cutLines.includes(grp.start);
      const cutRight = grp.end < d - 1 && cutLines.includes(grp.end + 1);
      const c = this.buildGroupView(grp.start, grp.end, d, cutLeft, cutRight, cx, cy, angle);
      if (animate) {
        const prev = strips.map((L) => this.prevStripPos.get(L.index)).filter((p): p is { x: number; y: number; angle: number } => !!p);
        if (prev.length === strips.length) {
          c.setPosition(prev.reduce((s, p) => s + p.x, 0) / prev.length, prev.reduce((s, p) => s + p.y, 0) / prev.length);
          c.setAngle(prev[0]!.angle);
          this.tweens.add({ targets: c, x: cx, y: cy, angle, duration: 170, ease: "Back.easeOut" });
        }
      }
      this.groups.push({ start: grp.start, end: grp.end, c });
    }
    this.prevStripPos = next;
  }

  private buildGroupView(
    start: number,
    end: number,
    d: number,
    cutLeft: boolean,
    cutRight: boolean,
    cx: number,
    cy: number,
    angle: number,
  ): Phaser.GameObjects.Container {
    const left = start === 0 || d === 1 ? -W / 2 : snapLineX(TOAST, d, start);
    const right = end === d - 1 || d === 1 ? W / 2 : snapLineX(TOAST, d, end + 1);
    const w = right - left;
    const c = this.add.container(cx, cy).setAngle(angle);
    const separated = this.flow.cutLines.length > 0;
    if (separated) c.add(this.add.rectangle(3, 4, w, H, INK, 0.3));
    const img = this.add.image(-(left + w / 2), 0, TOAST_KEY);
    img.setCrop(left + W / 2, 0, w, H);
    c.add(img);
    if (cutLeft) c.add(this.add.image(-w / 2 + 4, 0, EDGE_KEY));
    if (cutRight) c.add(this.add.image(w / 2 - 4, 0, EDGE_KEY).setFlipX(true));
    const g = this.add.graphics();
    if (separated) g.lineStyle(4, 0xffffff, 1).strokeRect(-w / 2, -H / 2, w, H);
    g.lineStyle(2.5, INK, 1).strokeRect(-w / 2, -H / 2, w, H);
    // Dashed snap lines still uncut inside this group.
    if (d > 1) {
      g.lineStyle(3, INK, 0.9);
      for (let i = start + 1; i <= end; i++) {
        if (this.flow.cutLines.includes(i)) continue;
        const x = snapLineX(TOAST, d, i) - (left + w / 2);
        for (let y = -H / 2 + 6; y < H / 2 - 6; y += 16) g.lineBetween(x, y, x, Math.min(y + 9, H / 2 - 6));
      }
    }
    c.add(g);
    this.toastC.add(c);
    return c;
  }

  private popToast(): void {
    this.toastC.setScale(0.94);
    this.tweens.add({ targets: this.toastC, scale: 1, duration: 220, ease: "Back.easeOut" });
  }

  private boing(target: Phaser.GameObjects.Container): void {
    const y0 = target.y;
    this.tweens.add({ targets: target, y: y0 - 16, duration: 110, yoyo: true, repeat: 1, ease: "Sine.easeOut" });
  }

  private spawnCrumbs(lines: ReadonlyArray<number>, pose: Pose): void {
    const d = this.flow.chosen;
    if (!d || lines.length === 0) return;
    let spawned = 0;
    for (const c of this.crumbs) {
      if (spawned >= 10) break; // ten crumbs a cut
      if (c.visible) continue;
      const i = lines[spawned % lines.length]!;
      const p = localToWorld(pose, { x: snapLineX(TOAST, d, i), y: -H / 2 + Math.random() * H });
      c.setPosition(p.x, p.y).setVisible(true).setAlpha(1).setFillStyle(spawned % 3 ? 0xb8652a : 0x6f8a2a);
      this.tweens.add({
        targets: c,
        x: p.x + (Math.random() - 0.5) * 60,
        y: p.y + 40 + Math.random() * 60,
        alpha: 0,
        duration: 600,
        onComplete: () => c.setVisible(false),
      });
      spawned++;
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: plate
  // ---------------------------------------------------------------------------

  private drawPlateBase(): void {
    const dish = this.add.ellipse(195, PLATE_RECT.y + PLATE_RECT.height - 10, PLATE_RECT.width + 100, 44, 0xffffff, 1).setStrokeStyle(3, 0xd8cdb8);
    const g = this.add.graphics();
    g.fillStyle(0xfffaf0, 1).fillRect(PLATE_RECT.x, PLATE_RECT.y, PLATE_RECT.width, PLATE_RECT.height);
    g.lineStyle(3, INK, 1).strokeRect(PLATE_RECT.x, PLATE_RECT.y, PLATE_RECT.width, PLATE_RECT.height);
    this.plateLayer.add([dish, g]);
  }

  /**
   * The order's amount shown on the plate before serving: one undivided, softly tinted region with a
   * dashed edge, from the left, as wide as the order is of the whole. It shows how much the customer
   * wants against the whole toast, but never how many pieces: there are no part lines in it, so the
   * choice of the number of pieces stays the child's (teacher's call, CHANGELOG).
   */
  private drawTarget(): void {
    this.targetLayer.removeAll(true);
    const w = PLATE_RECT.width * toNumber(currentOrder(this.flow).value);
    const g = this.add.graphics();
    g.fillStyle(GOLD, 0.55).fillRect(PLATE_RECT.x, PLATE_RECT.y, w, PLATE_RECT.height);
    g.lineStyle(2.5, INK, 0.75);
    const x = PLATE_RECT.x + w;
    for (let y = PLATE_RECT.y + 4; y < PLATE_RECT.y + PLATE_RECT.height - 4; y += 12) g.lineBetween(x, y, x, Math.min(y + 7, PLATE_RECT.y + PLATE_RECT.height - 4));
    this.targetLayer.add(g);
  }

  private clearPlate(): void {
    for (const o of this.plateObjs) o.destroy();
    this.plateObjs = [];
  }

  private fadePlate(): void {
    const objs = this.plateObjs;
    this.plateObjs = [];
    for (const obj of objs) this.tweens.add({ targets: obj, alpha: 0, duration: 300, onComplete: () => obj.destroy() });
  }

  private flyToPlate(k: number, slot: number, view: GroupView | undefined): void {
    const d = this.flow.chosen!;
    const slots = plateSlots(PLATE_RECT, d);
    const s = slots[slot]!;
    const left = k === 0 ? -W / 2 : snapLineX(TOAST, d, k);
    const w = W / d;
    const c = this.add.container(0, 0);
    const img = this.add.image(-(left + w / 2), 0, TOAST_KEY).setCrop(left + W / 2, 0, w, H);
    const g = this.add.graphics().lineStyle(2, INK, 0.9).strokeRect(-w / 2, -H / 2, w, H);
    c.add([img, g]);
    const from = view ? localToWorld(this.pose, { x: view.c.x, y: view.c.y }) : { x: TOAST_HOME.x, y: TOAST_HOME.y };
    c.setPosition(from.x, from.y).setAngle(view?.c.angle ?? 0);
    this.plateLayer.add(c);
    this.plateObjs.push(c);
    this.tweens.add({ targets: c, x: s.x + s.width / 2, y: s.y + s.height / 2, angle: 0, scale: PLATE_SCALE, duration: 260, ease: "Cubic.easeOut" });
    if (slot === 0) {
      // Faint slot guides once the plate starts filling, so each strip has its own slot.
      const guides = this.add.graphics().lineStyle(1, INK, 0.25);
      for (let j = 1; j < d; j++) guides.lineBetween(slots[j]!.x, s.y + 4, slots[j]!.x, s.y + s.height - 4);
      this.plateLayer.add(guides);
      this.plateObjs.push(guides);
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: bubble, message, dial, results, overlays
  // ---------------------------------------------------------------------------

  private drawBubble(): void {
    this.bubble.removeAll(true);
    const order = currentOrder(this.flow);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.97).fillRoundedRect(16, 14, 358, 146, 22);
    g.lineStyle(3, INK, 1).strokeRoundedRect(16, 14, 358, 146, 22);
    g.fillStyle(0xffffff, 1).fillTriangle(60, 158, 88, 158, 64, 178);
    g.lineStyle(3, INK, 1).lineBetween(60, 159, 64, 178).lineBetween(64, 178, 88, 159);
    this.bubble.add(g);
    const line = this.add.text(36, 32, customerLine(order.spoken), {
      fontFamily: FONT,
      fontSize: "25px",
      color: "#2b1d14",
      fontStyle: "bold",
      wordWrap: { width: 236 },
      lineSpacing: 4,
    });
    this.bubble.add(line);
    this.bubble.add(
      this.add.text(36, 126, COPY.orderOf(this.flow.orderIdx + 1, this.flow.orders.length), { fontFamily: FONT, fontSize: "17px", color: "#5c4128" }),
    );
    const label = labelFor(order);
    if (label.stacked) this.bubble.add(stackedFraction(this, 322, 62, label.stacked.numerator, label.stacked.denominator));
    // Replay button: a speaker drawn in code.
    const r = this.add.graphics();
    r.fillStyle(BRASS, 1).fillCircle(REPLAY.x, REPLAY.y, REPLAY.r).lineStyle(2, BRASS_DARK, 1).strokeCircle(REPLAY.x, REPLAY.y, REPLAY.r);
    r.fillStyle(INK, 1).fillRect(REPLAY.x - 10, REPLAY.y - 5, 6, 10).fillTriangle(REPLAY.x - 5, REPLAY.y - 5, REPLAY.x + 3, REPLAY.y - 11, REPLAY.x + 3, REPLAY.y + 11);
    r.fillTriangle(REPLAY.x - 5, REPLAY.y + 5, REPLAY.x + 3, REPLAY.y - 11, REPLAY.x + 3, REPLAY.y + 11);
    r.lineStyle(2, INK, 1).beginPath().arc(REPLAY.x + 4, REPLAY.y, 8, -0.9, 0.9).strokePath();
    this.bubble.add(r);
    this.buttons = this.buttons.filter((b) => b.id !== "replay");
    this.buttons.push({ id: "replay", x: REPLAY.x, y: REPLAY.y, hw: REPLAY.r + 10, hh: REPLAY.r + 10 });
  }

  /** Nelli's line, wrapped inside a cream pill well within the screen edges. */
  private say(text: string): void {
    this.message.setText(text);
    this.messageBg.clear();
    if (!text) return;
    const b = this.message.getBounds();
    const padX = 14;
    const padY = 6;
    this.messageBg
      .fillStyle(CREAM, 0.95)
      .fillRoundedRect(b.x - padX, b.y - padY, b.width + padX * 2, b.height + padY * 2, 16)
      .lineStyle(2, 0xd8c2a0, 1)
      .strokeRoundedRect(b.x - padX, b.y - padY, b.width + padX * 2, b.height + padY * 2, 16);
  }

  private dialPos(k: number): Vec2 {
    const n = this.flow.dial.length;
    // Spread the buttons over up to 170 degrees so neighbours keep clear space between them.
    const span = n > 1 ? Math.min(170, 44 * (n - 1)) : 0;
    const deg = 270 - span / 2 + (n > 1 ? (span * k) / (n - 1) : 0);
    const theta = (deg * Math.PI) / 180;
    return { x: DIAL_C.x + DIAL_R * Math.cos(theta), y: DIAL_C.y + DIAL_R * Math.sin(theta) };
  }

  private drawDial(): void {
    const g = this.add.graphics();
    g.fillStyle(BRASS_DARK, 1).fillCircle(DIAL_C.x, DIAL_C.y + 3, 54);
    g.fillStyle(BRASS, 1).fillCircle(DIAL_C.x, DIAL_C.y, 52);
    g.lineStyle(3, INK, 1).strokeCircle(DIAL_C.x, DIAL_C.y, 52);
    g.fillStyle(0xe8c56a, 1).fillCircle(DIAL_C.x - 14, DIAL_C.y - 16, 12);
    this.dialLayer.add(g);
    this.dialLayer.add(
      this.add.text(DIAL_C.x, DIAL_C.y + 26, COPY.dialCaption, { fontFamily: FONT, fontSize: "16px", color: "#2b1d14", fontStyle: "bold" }).setOrigin(0.5),
    );
    this.flow.dial.forEach((d, k) => {
      const p = this.dialPos(k);
      const b = this.add.graphics();
      b.fillStyle(BRASS_DARK, 1).fillCircle(p.x, p.y + 3, DIAL_BUTTON_R);
      b.fillStyle(0xf3dc9a, 1).fillCircle(p.x, p.y, DIAL_BUTTON_R);
      b.lineStyle(3, INK, 1).strokeCircle(p.x, p.y, DIAL_BUTTON_R);
      const t = this.add.text(p.x, p.y, String(d), { fontFamily: FONT, fontSize: "24px", color: "#2b1d14", fontStyle: "bold" }).setOrigin(0.5);
      this.dialLayer.add([b, t]);
      this.buttons.push({ id: `dial:${d}`, x: p.x, y: p.y, hw: DIAL_BUTTON_R + 3, hh: DIAL_BUTTON_R + 3 });
    });
    this.dialPointer = this.add.container(DIAL_C.x, DIAL_C.y);
    const ptr = this.add.graphics();
    ptr.fillStyle(INK, 1).fillTriangle(-6, 0, 6, 0, 0, -40).fillCircle(0, 0, 9);
    ptr.fillStyle(BRASS, 1).fillCircle(0, 0, 4);
    this.dialPointer.add(ptr);
    this.dialLayer.add(this.dialPointer);
  }

  private pointDial(d: number | null): void {
    const k = d === null ? -1 : this.flow.dial.indexOf(d);
    let angleDeg = 0;
    if (k >= 0) {
      const p = this.dialPos(k);
      angleDeg = (Math.atan2(p.y - DIAL_C.y, p.x - DIAL_C.x) * 180) / Math.PI + 90;
    }
    this.tweens.add({ targets: this.dialPointer, angle: angleDeg, duration: 160, ease: "Back.easeOut" });
  }

  private clearResult(): void {
    this.resultLayer.removeAll(true);
    this.buttons = this.buttons.filter((b) => b.id !== "next" && b.id !== "again" && !b.id.startsWith("mark:"));
  }

  private pill(x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
    return this.add
      .graphics()
      .fillStyle(CREAM, 0.97)
      .fillRoundedRect(x - w / 2, y - h / 2, w, h, Math.min(18, h / 2))
      .lineStyle(2, 0xd8c2a0, 1)
      .strokeRoundedRect(x - w / 2, y - h / 2, w, h, Math.min(18, h / 2));
  }

  private showResult(marks: Marks): void {
    this.clearResult();
    const label = labelFor(currentOrder(this.flow));
    if (label.stacked) {
      this.resultLayer.add(this.pill(338, 588, 52, 88));
      this.resultLayer.add(stackedFraction(this, 338, 588, label.stacked.numerator, label.stacked.denominator, { size: 30, color: "#2b1d14", barColor: INK }));
    }
    const words = this.add.text(195, 700, label.words, { fontFamily: FONT, fontSize: "26px", color: "#2b1d14", fontStyle: "bold" }).setOrigin(0.5);
    this.resultLayer.add([this.pill(195, 700, words.width + 36, 40), words]);

    // Only earned marks are shown: an icon plus one word, dark ink on gold. Tapping one says what it
    // was for. No greyed chip, nothing that reads as a miss.
    const earned: Array<[string, string]> = [];
    if (marks.exact) earned.push(["exact", COPY.markExact]);
    if (marks.smart) earned.push(["smart", COPY.markSmart]);
    if (marks.tidy) earned.push(["tidy", COPY.markTidy]);
    const chipW = 108;
    const gap = 10;
    const x0 = 195 - ((earned.length - 1) * (chipW + gap)) / 2;
    earned.forEach(([id, name], i) => {
      const x = x0 + i * (chipW + gap);
      const y = 746;
      const chip = this.add.container(x, y);
      const bgc = this.add.graphics();
      bgc.fillStyle(GOLD, 1).fillRoundedRect(-chipW / 2, -19, chipW, 38, 19);
      bgc.lineStyle(2, INK, 1).strokeRoundedRect(-chipW / 2, -19, chipW, 38, 19);
      const icon = this.markIcon(id, -chipW / 2 + 20, 0);
      const t = this.add.text(-chipW / 2 + 38, 0, name, { fontFamily: FONT, fontSize: "18px", color: "#2b1d14", fontStyle: "bold" }).setOrigin(0, 0.5);
      chip.add([bgc, icon, t]);
      chip.setScale(0.2);
      this.tweens.add({ targets: chip, scale: 1, duration: 260, delay: 120 * i, ease: "Back.easeOut" });
      this.resultLayer.add(chip);
      this.buttons.push({ id: `mark:${id}`, x, y, hw: chipW / 2, hh: 24 });
    });
    this.addButton(this.resultLayer, "next", 195, 802, COPY.next);
  }

  /** Mark icons drawn in code: a bullseye (Exact), a bulb (Smart), a single streak (Tidy). */
  private markIcon(id: string, x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    if (id === "exact") {
      g.lineStyle(2.5, INK, 1).strokeCircle(x, y, 11).strokeCircle(x, y, 6);
      g.fillStyle(INK, 1).fillCircle(x, y, 2.5);
    } else if (id === "smart") {
      g.fillStyle(0xffffff, 1).fillCircle(x, y - 3, 8).lineStyle(2.5, INK, 1).strokeCircle(x, y - 3, 8);
      g.fillStyle(INK, 1).fillRect(x - 4, y + 6, 8, 5);
    } else {
      g.lineStyle(3, INK, 1).beginPath().moveTo(x - 11, y + 8).lineTo(x + 11, y - 8).strokePath();
      g.fillStyle(0xffffff, 1).fillCircle(x + 9, y - 7, 3);
    }
    return g;
  }

  private explainMark(id: string): void {
    const line = id === "exact" ? COPY.markExactWhy : id === "smart" ? COPY.markSmartWhy : COPY.markTidyWhy;
    this.say(line);
    speakPlaceholder(line);
  }

  private addButton(layer: Phaser.GameObjects.Container, id: string, x: number, y: number, text: string): void {
    const g = this.add.graphics();
    g.fillStyle(BRASS_DARK, 1).fillRoundedRect(x - 90, y - 26 + 4, 180, 52, 26);
    g.fillStyle(BRASS, 1).fillRoundedRect(x - 90, y - 26, 180, 52, 26);
    g.lineStyle(3, INK, 1).strokeRoundedRect(x - 90, y - 26, 180, 52, 26);
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: "24px", color: "#2b1d14", fontStyle: "bold" }).setOrigin(0.5);
    layer.add([g, t]);
    this.buttons = this.buttons.filter((b) => b.id !== id);
    this.buttons.push({ id, x, y, hw: 92, hh: 30 });
  }

  private showStart(): void {
    this.overlay.add(this.add.rectangle(195, 422, 390, 844, 0x2b1d14, 0.55));
    this.overlay.add(
      this.add.text(195, 330, COPY.title, { fontFamily: FONT, fontSize: "40px", color: "#fff4e0", fontStyle: "bold", stroke: "#2b1d14", strokeThickness: 8 }).setOrigin(0.5),
    );
    this.addButton(this.overlay, "start", 195, 430, COPY.tapToStart);
    this.dialLayer.setVisible(false);
  }

  private speakOrder(): void {
    speakPlaceholder(customerLine(currentOrder(this.flow).spoken));
  }

  // ---------------------------------------------------------------------------
  // e2e hook (debug builds only, with ?e2e): read-only positions for the headless evidence run.
  // ---------------------------------------------------------------------------

  private exposeDebug(): void {
    if (!__KTN_DEBUG__) return; // lets the release build drop everything below
    const toView = (p: Vec2) => {
      const r = this.game.canvas.getBoundingClientRect();
      const s = r.width / 390;
      return { x: r.left + p.x * s, y: r.top + p.y * s };
    };
    (window as unknown as { __ktn: unknown }).__ktn = {
      state: () => {
        const f = this.flow;
        return {
          phase: f.phase,
          level: f.level,
          dial: [...f.dial],
          order: currentOrder(f).id,
          chosen: f.chosen,
          cutLines: [...f.cutLines],
          served: [...f.served],
          matched: f.plate.matched,
          retries: f.retries,
          marks: f.marks,
          message: this.message.text,
          canFill: f.chosen ? canFill(currentOrder(f).value, f.chosen) : null,
          separated: f.chosen ? Array.from({ length: f.chosen }, (_, k) => isSeparated(f.chosen!, f.cutLines, k)) : [],
          messageBounds: this.message.getBounds(),
        };
      },
      button: (id: string) => {
        const b = this.buttons.find((x) => x.id === id);
        return b ? toView(b) : null;
      },
      toastPoint: (lx: number, ly: number) => toView(localToWorld(this.pose, { x: lx, y: ly })),
      piece: (k: number) => {
        const f = this.flow;
        if (!f.chosen) return null;
        const L = this.layout(f.chosen, f.cutLines).find((q) => q.index === k);
        return L ? toView(localToWorld(this.pose, { x: L.x, y: L.y })) : null;
      },
    };
  }
}
