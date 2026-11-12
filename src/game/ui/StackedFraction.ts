// The only place a fraction is turned into text. Numerator over a bar over denominator; never a slash.
import Phaser from "phaser";

export interface StackedFractionStyle {
  size: number;
  color: string;
  barColor: number;
}

export function stackedFraction(
  scene: Phaser.Scene,
  x: number,
  y: number,
  numerator: number,
  denominator: number,
  style: StackedFractionStyle = { size: 34, color: "#3a2416", barColor: 0x3a2416 },
): Phaser.GameObjects.Container {
  const font = { fontFamily: "Trebuchet MS, Verdana, sans-serif", fontSize: `${style.size}px`, color: style.color, fontStyle: "bold" };
  const top = scene.add.text(0, -style.size * 0.62, String(numerator), font).setOrigin(0.5);
  const bottom = scene.add.text(0, style.size * 0.62, String(denominator), font).setOrigin(0.5);
  const barW = Math.max(top.width, bottom.width) + style.size * 0.35;
  const bar = scene.add.rectangle(0, 0, barW, Math.max(2, style.size * 0.09), style.barColor);
  return scene.add.container(x, y, [top, bar, bottom]);
}
