import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true, // nearest-neighbour sampling + roundPixels: crisp sprites at any integer zoom
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BootScene, WorldScene],
});

// Dev builds only: expose the game for automated browser tests and console debugging.
if (import.meta.env.DEV) (window as unknown as { __thistlevane: Phaser.Game }).__thistlevane = game;
