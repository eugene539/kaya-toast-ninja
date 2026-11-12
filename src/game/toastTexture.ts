// The toast top drawn in code (placeholder for L26). Touchable items are drawn in code; the count,
// lines, gaps and outlines never come from art.
import Phaser from "phaser";
import { TOAST } from "../core/index";

export const TOAST_KEY = "toast_top";
export const EDGE_KEY = "toast_edge";

export function makeToastTextures(scene: Phaser.Scene): void {
  const W = TOAST.width;
  const H = TOAST.height;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Crust
  g.fillStyle(0xb8652a, 1).fillRect(0, 0, W, H);
  // Crumb
  g.fillStyle(0xf2b35e, 1).fillRect(10, 10, W - 20, H - 20);
  g.fillStyle(0xf7c77a, 1).fillRect(18, 18, W - 36, H - 36);
  // Toasty grill bars (horizontal, so they never look like cut lines)
  g.fillStyle(0xd98c3f, 0.35);
  for (let y = 40; y < H - 20; y += 44) g.fillRect(18, y, W - 36, 8);
  // Butter pat and kaya specks (deterministic)
  g.fillStyle(0xfff1b8, 0.85).fillRect(W / 2 - 34, H / 2 - 22, 68, 44);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle(0x8a9a3a, 0.45);
  for (let i = 0; i < 70; i++) g.fillCircle(20 + rnd() * (W - 40), 20 + rnd() * (H - 40), 1.5 + rnd() * 2.5);
  g.fillStyle(0xffffff, 0.25).fillRect(24, 22, W - 48, 10);
  g.generateTexture(TOAST_KEY, W, H);
  g.destroy();

  // Cut-edge strip (placeholder for L25): crust, bread, kaya, butter seen edge-on.
  const e = scene.make.graphics({ x: 0, y: 0 }, false);
  const bands: Array<[number, number]> = [
    [0xb8652a, 2],
    [0xf4d9a6, 3],
    [0x6f8a2a, 2],
    [0xfff1b8, 1],
  ];
  let x = 0;
  for (const [c, w] of bands) {
    e.fillStyle(c, 1).fillRect(x, 0, w, H);
    x += w;
  }
  e.generateTexture(EDGE_KEY, x, H);
  e.destroy();
}
