import Phaser from "phaser";
import { DESIGN } from "./core/index";
import { PrototypeScene } from "./game/PrototypeScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: DESIGN.width,
  height: DESIGN.height,
  backgroundColor: "#2b1d14",
  // Pointer handling is ours (src/game/pointer.ts, with pointer capture); Phaser input stays off.
  input: { mouse: false, touch: false, keyboard: false, gamepad: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  banner: false,
  scene: [PrototypeScene],
});
