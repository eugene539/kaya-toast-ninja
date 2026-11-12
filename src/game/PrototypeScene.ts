// Phase 0 prototype: choose, cut, serve for the three demo orders (Docs/10 Phase 0 scope).
// All maths and geometry decisions come from src/core; this file only draws and animates.
import Phaser from "phaser";
import {
  DEMO_ORDERS,
  TOAST,
  canFill,
  createGestureTracker,
  dialFor,
  emptyPlate,
  groupsOf,
  isSeparated,
  labelFor,
  layoutCut,
  localToWorld,
  makePartition,
  marksFor,
  plateSlots,
  resolveSwipeOnGroups,
  serve,
  snapLineX,
  worldToLocal,
  type GestureEvent,
  type Order,
  type Partition,
  type Plate,
  type PointerSample,
  type Pose,
  type Rect,
  type Vec2,
} from "../core/index";
import { COPY, customerLine } from "../copy/strings";
import { Sfx } from "./audio";
import { attachLifecycle } from "./lifecycle";
import { attachPointer } from "./pointer";
import { speakPlaceholder, stopPlaceholderSpeech, warmVoices } from "./placeholderVoice";
import { EDGE_KEY, makeToastTextures, TOAST_KEY } from "./toastTexture";
import { stackedFraction } from "./ui/StackedFraction";

const W = TOAST.width;
const H = TOAST.height;
const INK = 0x2b1d14;
const BRASS = 0xc9a14a;
const BRASS_DARK = 0x8a6a22;
const FONT = "Trebuchet MS, Verdana, sans-serif";

const TOAST_HOME = { x: 195, y: 368 };
const PLATE_SCALE = 0.6;
const PLATE_RECT: Rect = { x: 195 - (W * PLATE_SCALE) / 2, y: 590 - (H * PLATE_SCALE) / 2, width: W * PLATE_SCALE, height: H * PLATE_SCALE };
const DIAL_C = { x: 195, y: 800 };
const DIAL_R = 100;
const REPLAY = { x: 322, y: 146, r: 20 };

type Phase = "start" | "choose" | "cut" | "busy" | "matched" | "end";

interface GroupView {
  start: number;
  end: number;
  c: Phaser.GameObjects.Container;
}

export class PrototypeScene extends Phaser.Scene {
  private readonly sfx = new Sfx();
  private readonly tracker = createGestureTracker();
  private readonly e2e = typeof location !== "undefined" && location.search.includes("e2e");

  private phase: Phase = "start";
  private orderIdx = 0;
  private order: Order = DEMO_ORDERS[0]!;
  private readonly dial = dialFor("P2");
  private chosen: number | null = null;
  private partition: Partition | null = null;
  private partitionSeq = 0;
  private cutLines: number[] = [];
  private served = new Set<number>();
  private plate: Plate = emptyPlate(DEMO_ORDERS[0]!.value);
  private swipesOnPartition = 0;
  private notYets = 0;
  private lastMarks: { exact: boolean; smart: boolean; tidy: boolean } | null = null;

  private pose: Pose = { ...TOAST_HOME, angle: 0 };
  private frozenPose: Pose | null = null;
  private swayT = 0;
  private prevStripPos = new Map<number, { x: number; y: number; angle: number }>();

  private toastC!: Phaser.GameObjects.Container;
  private groups: GroupView[] = [];
  private plateLayer!: Phaser.GameObjects.Container;
  private plateObjs: Phaser.GameObjects.GameObject[] = [];
  private bubble!: Phaser.GameObjects.Container;
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

    this.plateLayer = this.add.container(0, 0);
    this.drawPlateBase();
    this.toastC = this.add.container(TOAST_HOME.x, TOAST_HOME.y);
    this.trail = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      this.crumbs.push(this.add.rectangle(-50, -50, 5, 4, 0xb8652a).setVisible(false));
    }
    this.bubble = this.add.container(0, 0);
    this.message = this.add
      .text(195, 204, "", { fontFamily: FONT, fontSize: "21px", color: "#2b1d14", fontStyle: "bold", stroke: "#fff8ec", strokeThickness: 5 })
      .setOrigin(0.5);
    this.dialLayer = this.add.container(0, 0);
    this.resultLayer = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0);
    this.drawDial();
    this.showStart();

    const canvas = this.game.canvas;
    const detach = attachPointer(canvas, (s) => this.onSample(s), () => this.onReset());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach);
    const detachLifecycle = attachLifecycle({
      onPause: () => {
        this.sfx.suspend();
        stopPlaceholderSpeech();
      },
      onResume: () => this.sfx.resume(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detachLifecycle);
    if (this.e2e) this.exposeDebug();
  }

  override update(_t: number, dtMs: number): void {
    if (this.frozenPose || this.phase === "start" || this.phase === "end") return;
    this.swayT += dtMs / 1000;
    const amp = this.e2e ? 0 : this.cutLines.length ? 0.025 : 0.07;
    this.pose = { ...TOAST_HOME, angle: amp * Math.sin(this.swayT * 1.3) };
    this.toastC.setRotation(this.pose.angle);
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
    for (const b of this.buttons) if (Math.abs(p.x - b.x) <= b.hw && Math.abs(p.y - b.y) <= b.hh) return b.id;
    return null;
  }

  private onTap(p: Vec2): void {
    const id = this.hitButton(p);
    if (this.phase === "start") {
      if (id === "start") this.beginOrder(0);
      return;
    }
    if (id === "replay") return this.speakOrder();
    if (id === "next" && this.phase === "matched") return this.nextOrder();
    if (id === "again" && this.phase === "end") return this.beginOrder(0, true);
    if (id?.startsWith("dial:") && (this.phase === "choose" || (this.phase === "cut" && this.cutLines.length === 0))) {
      return this.choose(Number(id.slice(5)));
    }
    const k = this.pieceAt(p);
    if (k !== null && this.phase === "cut") this.serveStrip(k);
  }

  private onSwipe(path: ReadonlyArray<Vec2>): void {
    if (this.phase !== "cut" || this.chosen === null) return;
    const first = path[0]!;
    const last = path[path.length - 1]!;
    const k = this.pieceAt(first);
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    if (k !== null && dy > 30 && dy > Math.abs(dx)) {
      this.serveStrip(k); // a flick towards the plate
      return;
    }
    const pose = this.frozenPose ?? this.pose;
    const local = path.map((q) => worldToLocal(pose, q));
    const res = resolveSwipeOnGroups(TOAST, this.chosen, local, this.cutLines, this.groupPoses(this.chosen));
    if (res.lines.length === 0) return;
    this.cutLines = [...this.cutLines, ...res.lines].sort((a, b) => a - b);
    this.swipesOnPartition += 1;
    this.sfx.shink();
    this.spawnCrumbs(res.lines, pose);
    this.renderToast(true);
    const all = this.cutLines.length === this.chosen - 1;
    this.say(all ? COPY.flickPieces : COPY.keepCutting);
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
    const layout = this.layout(d, this.cutLines);
    return groupsOf(d, this.cutLines).map((g) => {
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

  /** Strip index of a separated, unserved piece under the design point, or null. */
  private pieceAt(p: Vec2): number | null {
    if (!this.chosen || this.cutLines.length === 0) return null;
    const pose = this.frozenPose ?? this.pose;
    const local = worldToLocal(pose, p);
    const layout = this.layout(this.chosen, this.cutLines);
    const pw = W / this.chosen;
    let best: number | null = null;
    let bestD = Infinity;
    for (const L of layout) {
      if (this.served.has(L.index) || !isSeparated(this.chosen, this.cutLines, L.index)) continue;
      const a = (-L.angle * Math.PI) / 180;
      const rx = (local.x - L.x) * Math.cos(a) - (local.y - L.y) * Math.sin(a);
      const ry = (local.x - L.x) * Math.sin(a) + (local.y - L.y) * Math.cos(a);
      // Hit area: the piece plus half the gap on each side.
      if (Math.abs(rx) <= pw / 2 + 4 && Math.abs(ry) <= H / 2 + 6 && Math.abs(rx) < bestD) {
        best = L.index;
        bestD = Math.abs(rx);
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------

  private beginOrder(idx: number, restart = false): void {
    this.overlay.removeAll(true);
    this.buttons = this.buttons.filter((b) => b.id === "replay" || b.id.startsWith("dial:"));
    if (restart) this.orderIdx = 0;
    this.orderIdx = idx;
    this.order = DEMO_ORDERS[idx]!;
    this.notYets = 0;
    this.resetToast();
    this.clearResult();
    this.dialLayer.setVisible(true);
    this.drawBubble();
    this.phase = "choose";
    this.say(COPY.intoHowMany);
    this.speakOrder();
  }

  private nextOrder(): void {
    if (this.orderIdx + 1 < DEMO_ORDERS.length) return this.beginOrder(this.orderIdx + 1);
    this.phase = "end";
    this.clearResult();
    this.say(COPY.allServed);
    this.addButton(this.resultLayer, "again", 195, 760, COPY.playAgain);
  }

  private resetToast(): void {
    this.chosen = null;
    this.partition = null;
    this.cutLines = [];
    this.served.clear();
    this.swipesOnPartition = 0;
    this.plate = emptyPlate(this.order.value);
    this.clearPlate();
    this.prevStripPos.clear();
    this.renderToast(false);
    this.pointDial(null);
  }

  private choose(d: number): void {
    this.sfx.click();
    this.chosen = d;
    this.partitionSeq += 1;
    this.partition = makePartition(`t${this.partitionSeq}`, d);
    this.cutLines = [];
    this.swipesOnPartition = 0;
    this.plate = emptyPlate(this.order.value);
    this.prevStripPos.clear();
    this.renderToast(false);
    this.pointDial(d);
    this.phase = "cut";
    this.say(COPY.swipeAcross);
  }

  private serveStrip(k: number): void {
    if (!this.partition || this.phase !== "cut") return;
    const piece = this.partition.pieces[k]!;
    const res = serve(this.plate, piece);
    const view = this.groups.find((g) => g.start === k && g.end === k);
    switch (res.outcome) {
      case "placed":
      case "matched": {
        this.plate = res.plate;
        this.served.add(k);
        this.sfx.pop();
        this.flyToPlate(k, this.plate.served.length - 1, view);
        this.renderToast(false);
        if (res.outcome === "matched") this.onMatched();
        return;
      }
      case "notYet":
        this.notYets += 1;
        this.sfx.boing();
        if (view) this.boing(view.c);
        this.phase = "busy";
        this.say(COPY.notYet);
        speakPlaceholder(COPY.notYet);
        this.time.delayedCall(1300, () => this.heal());
        return;
      default:
        this.sfx.boing();
        if (view) this.boing(view.c);
    }
  }

  private onMatched(): void {
    this.phase = "busy";
    this.time.delayedCall(350, () => {
      this.sfx.bell();
      this.lastMarks = marksFor(this.order, this.dial, {
        notYets: this.notYets,
        finalDenominator: this.chosen!,
        swipesOnFinal: this.swipesOnPartition,
      });
      this.say(COPY.matched);
      this.dialLayer.setVisible(false);
      this.showResult();
      this.phase = "matched";
    });
  }

  /** "Not yet": the served pieces come home, the toast heals, the dial is offered again. */
  private heal(): void {
    this.sfx.heal();
    const home = this.layout(this.chosen ?? 2, []);
    for (const obj of this.plateObjs) {
      this.tweens.add({ targets: obj, alpha: 0, duration: 300 });
    }
    for (const g of this.groups) {
      const strips = home.filter((L) => L.index >= g.start && L.index <= g.end);
      const cx = strips.reduce((s, L) => s + L.x, 0) / strips.length;
      this.tweens.add({ targets: g.c, x: cx, y: 0, angle: 0, duration: 380, ease: "Sine.easeInOut" });
    }
    this.time.delayedCall(420, () => {
      this.resetToast();
      this.phase = "choose";
      this.say(COPY.intoHowMany);
    });
  }

  // ---------------------------------------------------------------------------
  // Drawing: toast
  // ---------------------------------------------------------------------------

  private renderToast(animate: boolean): void {
    for (const g of this.groups) g.c.destroy();
    this.groups = [];
    const d = this.chosen ?? 1;
    if (d === 1) {
      this.groups.push({ start: 0, end: 0, c: this.buildGroupView(0, 0, 1, false, false, 0, 0, 0) });
      return;
    }
    const layout = this.layout(d, this.cutLines);
    const next = new Map<number, { x: number; y: number; angle: number }>();
    for (const L of layout) next.set(L.index, { x: L.x, y: L.y, angle: L.angle });
    for (const grp of groupsOf(d, this.cutLines)) {
      let live = 0;
      for (let k = grp.start; k <= grp.end; k++) if (!this.served.has(k)) live++;
      if (live === 0) continue;
      const strips = layout.filter((L) => L.index >= grp.start && L.index <= grp.end);
      const cx = strips.reduce((s, L) => s + L.x, 0) / strips.length;
      const cy = strips.reduce((s, L) => s + L.y, 0) / strips.length;
      const angle = strips[0]!.angle;
      const cutLeft = grp.start > 0 && this.cutLines.includes(grp.start);
      const cutRight = grp.end < d - 1 && this.cutLines.includes(grp.end + 1);
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
    const left = start === 0 ? -W / 2 : d === 1 ? -W / 2 : snapLineX(TOAST, d, start);
    const right = end === d - 1 || d === 1 ? W / 2 : snapLineX(TOAST, d, end + 1);
    const w = right - left;
    const c = this.add.container(cx, cy).setAngle(angle);
    const separated = this.cutLines.length > 0;
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
    if (d > 1 && this.phase !== "start") {
      g.lineStyle(3, INK, 0.9);
      for (let i = start + 1; i <= end; i++) {
        if (this.cutLines.includes(i)) continue;
        const x = snapLineX(TOAST, d, i) - (left + w / 2);
        for (let y = -H / 2 + 6; y < H / 2 - 6; y += 16) g.lineBetween(x, y, x, Math.min(y + 9, H / 2 - 6));
      }
    }
    c.add(g);
    this.toastC.add(c);
    return c;
  }

  private boing(target: Phaser.GameObjects.Container): void {
    const y0 = target.y;
    this.tweens.add({ targets: target, y: y0 - 16, duration: 110, yoyo: true, repeat: 1, ease: "Sine.easeOut" });
  }

  private spawnCrumbs(lines: ReadonlyArray<number>, pose: Pose): void {
    if (!this.chosen) return;
    let spawned = 0;
    for (const c of this.crumbs) {
      if (spawned >= 10) break; // ten crumbs a cut
      if (c.visible) continue;
      const i = lines[spawned % lines.length]!;
      const p = localToWorld(pose, { x: snapLineX(TOAST, this.chosen, i), y: -H / 2 + Math.random() * H });
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
    const dish = this.add.ellipse(195, PLATE_RECT.y + PLATE_RECT.height - 6, PLATE_RECT.width + 110, 56, 0xffffff, 1).setStrokeStyle(3, 0xd8cdb8);
    const g = this.add.graphics();
    g.fillStyle(0xfffaf0, 1).fillRect(PLATE_RECT.x, PLATE_RECT.y, PLATE_RECT.width, PLATE_RECT.height);
    g.lineStyle(3, INK, 1).strokeRect(PLATE_RECT.x, PLATE_RECT.y, PLATE_RECT.width, PLATE_RECT.height);
    this.plateLayer.add([dish, g]);
  }

  private clearPlate(): void {
    for (const o of this.plateObjs) o.destroy();
    this.plateObjs = [];
  }

  private flyToPlate(k: number, slot: number, view: GroupView | undefined): void {
    const d = this.chosen!;
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
    this.tweens.add({
      targets: c,
      x: s.x + s.width / 2,
      y: s.y + s.height / 2,
      angle: 0,
      scale: PLATE_SCALE,
      duration: 260,
      ease: "Cubic.easeOut",
    });
    if (slot === 0) {
      // Faint slot guides once the plate starts filling, so each strip has its own slot.
      const guides = this.add.graphics().lineStyle(1, INK, 0.25);
      for (let j = 1; j < d; j++) guides.lineBetween(slots[j]!.x, s.y + 4, slots[j]!.x, s.y + s.height - 4);
      this.plateLayer.add(guides);
      this.plateObjs.push(guides);
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: bubble, dial, results, overlays
  // ---------------------------------------------------------------------------

  private drawBubble(): void {
    this.bubble.removeAll(true);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.97).fillRoundedRect(16, 22, 358, 154, 22);
    g.lineStyle(3, INK, 1).strokeRoundedRect(16, 22, 358, 154, 22);
    g.fillStyle(0xffffff, 1).fillTriangle(60, 174, 92, 174, 66, 196);
    g.lineStyle(3, INK, 1).lineBetween(60, 175, 66, 196).lineBetween(66, 196, 92, 175);
    this.bubble.add(g);
    const line = this.add.text(36, 44, customerLine(this.order.spoken), {
      fontFamily: FONT,
      fontSize: "25px",
      color: "#2b1d14",
      fontStyle: "bold",
      wordWrap: { width: 236 },
      lineSpacing: 4,
    });
    this.bubble.add(line);
    this.bubble.add(
      this.add.text(36, 146, COPY.orderOf(this.orderIdx + 1, DEMO_ORDERS.length), { fontFamily: FONT, fontSize: "15px", color: "#7a5a3a" }),
    );
    const label = labelFor(this.order);
    if (label.stacked) this.bubble.add(stackedFraction(this, 322, 78, label.stacked.numerator, label.stacked.denominator));
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

  private dialPos(k: number): Vec2 {
    const n = this.dial.length;
    const theta = ((192 + (156 * k) / (n - 1)) * Math.PI) / 180;
    return { x: DIAL_C.x + DIAL_R * Math.cos(theta), y: DIAL_C.y + DIAL_R * Math.sin(theta) };
  }

  private drawDial(): void {
    const g = this.add.graphics();
    g.fillStyle(BRASS_DARK, 1).fillCircle(DIAL_C.x, DIAL_C.y + 3, 58);
    g.fillStyle(BRASS, 1).fillCircle(DIAL_C.x, DIAL_C.y, 56);
    g.lineStyle(3, INK, 1).strokeCircle(DIAL_C.x, DIAL_C.y, 56);
    g.fillStyle(0xe8c56a, 1).fillCircle(DIAL_C.x - 12, DIAL_C.y - 14, 14);
    this.dialLayer.add(g);
    this.dial.forEach((d, k) => {
      const p = this.dialPos(k);
      const b = this.add.graphics();
      b.fillStyle(BRASS_DARK, 1).fillCircle(p.x, p.y + 3, 24);
      b.fillStyle(0xf3dc9a, 1).fillCircle(p.x, p.y, 24);
      b.lineStyle(3, INK, 1).strokeCircle(p.x, p.y, 24);
      const t = this.add.text(p.x, p.y, String(d), { fontFamily: FONT, fontSize: "24px", color: "#2b1d14", fontStyle: "bold" }).setOrigin(0.5);
      this.dialLayer.add([b, t]);
      this.buttons.push({ id: `dial:${d}`, x: p.x, y: p.y, hw: 26, hh: 26 });
    });
    this.dialPointer = this.add.container(DIAL_C.x, DIAL_C.y);
    const ptr = this.add.graphics();
    ptr.fillStyle(INK, 1).fillTriangle(-7, 0, 7, 0, 0, -46).fillCircle(0, 0, 10);
    ptr.fillStyle(BRASS, 1).fillCircle(0, 0, 5);
    this.dialPointer.add(ptr);
    this.dialLayer.add(this.dialPointer);
  }

  private pointDial(d: number | null): void {
    const k = d === null ? -1 : this.dial.indexOf(d);
    let angleDeg = 0;
    if (k >= 0) {
      const p = this.dialPos(k);
      angleDeg = (Math.atan2(p.y - DIAL_C.y, p.x - DIAL_C.x) * 180) / Math.PI + 90;
    }
    this.tweens.add({ targets: this.dialPointer, angle: angleDeg, duration: 160, ease: "Back.easeOut" });
  }

  private clearResult(): void {
    this.resultLayer.removeAll(true);
    this.buttons = this.buttons.filter((b) => b.id !== "next" && b.id !== "again");
  }

  private showResult(): void {
    this.clearResult();
    const label = labelFor(this.order);
    if (label.stacked) {
      this.resultLayer.add(stackedFraction(this, 340, 590, label.stacked.numerator, label.stacked.denominator, { size: 30, color: "#2b1d14", barColor: INK }));
    }
    this.resultLayer.add(
      this.add.text(195, 690, label.words, { fontFamily: FONT, fontSize: "26px", color: "#2b1d14", fontStyle: "bold", stroke: "#fff8ec", strokeThickness: 5 }).setOrigin(0.5),
    );
    const m = this.lastMarks!;
    const marks: Array<[string, boolean]> = [
      [COPY.markExact, m.exact],
      [COPY.markSmart, m.smart],
      [COPY.markTidy, m.tidy],
    ];
    marks.forEach(([name, on], i) => {
      const x = 87 + i * 108;
      const chip = this.add.graphics();
      chip.fillStyle(on ? 0xffd166 : 0xf1e6d2, 1).fillRoundedRect(x - 48, 714, 96, 34, 17);
      chip.lineStyle(2, on ? INK : 0xc9b89a, 1).strokeRoundedRect(x - 48, 714, 96, 34, 17);
      const t = this.add.text(x, 731, name, { fontFamily: FONT, fontSize: "18px", color: on ? "#2b1d14" : "#a8957a", fontStyle: "bold" }).setOrigin(0.5);
      this.resultLayer.add([chip, t]);
    });
    this.addButton(this.resultLayer, "next", 195, 795, COPY.next);
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
    this.phase = "start";
    this.overlay.add(this.add.rectangle(195, 422, 390, 844, 0x2b1d14, 0.55));
    this.overlay.add(
      this.add.text(195, 330, COPY.title, { fontFamily: FONT, fontSize: "40px", color: "#fff4e0", fontStyle: "bold", stroke: "#2b1d14", strokeThickness: 8 }).setOrigin(0.5),
    );
    this.addButton(this.overlay, "start", 195, 430, COPY.tapToStart);
    this.dialLayer.setVisible(false);
  }

  private say(text: string): void {
    this.message.setText(text);
  }

  private speakOrder(): void {
    speakPlaceholder(customerLine(this.order.spoken));
  }

  // ---------------------------------------------------------------------------
  // e2e hook (only with ?e2e in the URL): read-only positions for the headless evidence run.
  // ---------------------------------------------------------------------------

  private exposeDebug(): void {
    const toView = (p: Vec2) => {
      const r = this.game.canvas.getBoundingClientRect();
      const s = r.width / 390;
      return { x: r.left + p.x * s, y: r.top + p.y * s };
    };
    (window as unknown as { __ktn: unknown }).__ktn = {
      state: () => ({
        phase: this.phase,
        order: this.order.id,
        chosen: this.chosen,
        cutLines: [...this.cutLines],
        served: [...this.served],
        matched: this.plate.matched,
        notYets: this.notYets,
        message: this.message.text,
        canFill: this.chosen ? canFill(this.order.value, this.chosen) : null,
      }),
      button: (id: string) => {
        const b = this.buttons.find((x) => x.id === id);
        return b ? toView(b) : null;
      },
      toastPoint: (lx: number, ly: number) => toView(localToWorld(this.pose, { x: lx, y: ly })),
      piece: (k: number) => {
        if (!this.chosen) return null;
        const L = this.layout(this.chosen, this.cutLines).find((q) => q.index === k);
        return L ? toView(localToWorld(this.pose, { x: L.x, y: L.y })) : null;
      },
    };
  }
}
