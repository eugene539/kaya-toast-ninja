// DOM pointer handling with pointer capture (Docs/10 section 2.3). Samples are converted to design
// space with a view transform recomputed on every pointer-down and every resize.
import { DESIGN, viewToDesign, type PointerSample, type ViewTransform } from "../core/index";

export type SampleSink = (s: PointerSample) => void;

export function attachPointer(canvas: HTMLCanvasElement, sink: SampleSink, onReset: () => void): () => void {
  let vt: ViewTransform = computeTransform(canvas);

  function computeTransform(c: HTMLCanvasElement): ViewTransform {
    const r = c.getBoundingClientRect();
    const scale = r.width > 0 ? r.width / DESIGN.width : 1;
    return { scale, offsetX: r.left, offsetY: r.top };
  }

  const toSample = (phase: PointerSample["phase"], e: PointerEvent): PointerSample => {
    const p = viewToDesign(vt, { x: e.clientX, y: e.clientY });
    return { phase, pointerId: e.pointerId, x: p.x, y: p.y, t: e.timeStamp };
  };

  const down = (e: PointerEvent) => {
    vt = computeTransform(canvas);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture can fail for synthetic events; the gesture still works */
    }
    e.preventDefault();
    sink(toSample("down", e));
  };
  const move = (e: PointerEvent) => {
    e.preventDefault();
    // Coalesced events keep a fast finger's path dense; the core intersects segment by segment anyway.
    const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    if (list.length > 1) for (const c of list) sink(toSample("move", c));
    else sink(toSample("move", e));
  };
  const up = (e: PointerEvent) => sink(toSample("up", e));
  const cancel = (e: PointerEvent) => sink(toSample("cancel", e));
  const lost = (e: PointerEvent) => sink(toSample("lostcapture", e));
  const resize = () => {
    vt = computeTransform(canvas);
    onReset();
  };
  const noGesture = (e: Event) => e.preventDefault();

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", lost);
  canvas.addEventListener("contextmenu", noGesture);
  canvas.addEventListener("touchstart", noGesture, { passive: false });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  document.addEventListener("visibilitychange", onReset);

  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("lostpointercapture", lost);
    canvas.removeEventListener("contextmenu", noGesture);
    canvas.removeEventListener("touchstart", noGesture);
    window.removeEventListener("resize", resize);
    window.removeEventListener("orientationchange", resize);
    document.removeEventListener("visibilitychange", onReset);
  };
}
