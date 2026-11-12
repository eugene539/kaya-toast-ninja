// Public core, implementing spec/api.d.ts. Pure TypeScript: no Phaser, no DOM.
export * from "./rational";
export {
  DESIGN, TOAST, MIN_GAP, DEFAULT_GAP, MAX_FAN_DEGREES, DEFAULT_FAN_DEGREES, MIN_PIECE_WIDTH,
  SNAP_LINE_MIN_WIDTH, TAP_SLOP, polygonArea, clipHalfPlane, toastPolygon, snapLineX, stripPolygon,
  fitPlayfield, viewToDesign, designToView, worldToLocal, localToWorld, plateSlots,
} from "./geometry";
export type { Vec2, Polygon, ToastSpec, Rect, ViewTransform, Pose } from "./geometry";
export * from "./input";
export * from "./forgiveness";
export * from "./partition";
export * from "./serve";
export * from "./marks";
export * from "./orders";
