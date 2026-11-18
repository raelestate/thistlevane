import type { MapModel } from '@thistlevane/shared';

/** Internal canvas resolution; CSS scales the element itself via --ui-scale. */
const SIZE = 128;
const BG = '#0a0614';
const BORDER = '#3a302a';
const PORTAL_COLOR = '#d4b060';
const OTHER_COLOR = '#b0a488';
const SELF_COLOR = '#ffe9a8';

/**
 * A small whole-zone overview in the corner, scaled to fit regardless of the zone's actual
 * size. Only markers are drawn (self, other players, portals) — the terrain itself isn't,
 * since MapView only ever keeps a scrolling window of the real tile data loaded, not the
 * whole (huge) zone, so there is nothing cheap to sample from for a background render.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private mapWidth = 1;
  private mapHeight = 1;
  private portals: Array<{ x: number; y: number }> = [];

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.className = 'panel';
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);
  }

  /** Call once per zone load (model.width/height + portals only change then). */
  setZone(model: MapModel): void {
    this.mapWidth = model.width;
    this.mapHeight = model.height;
    this.portals = model.portals.map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 }));
  }

  /** Positions are all in tile units (fractional), same space as predictor/remote render positions. */
  update(selfTileX: number, selfTileY: number, others: Array<{ x: number; y: number }>): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const sx = SIZE / this.mapWidth;
    const sy = SIZE / this.mapHeight;
    const toCanvas = (x: number, y: number): [number, number] => [
      Math.max(2, Math.min(SIZE - 2, x * sx)),
      Math.max(2, Math.min(SIZE - 2, y * sy)),
    ];

    ctx.fillStyle = PORTAL_COLOR;
    for (const p of this.portals) {
      const [cx, cy] = toCanvas(p.x, p.y);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx + 4, cy);
      ctx.lineTo(cx, cy + 4);
      ctx.lineTo(cx - 4, cy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = OTHER_COLOR;
    for (const o of others) {
      const [cx, cy] = toCanvas(o.x, o.y);
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const [mx, my] = toCanvas(selfTileX, selfTileY);
    ctx.fillStyle = SELF_COLOR;
    ctx.strokeStyle = '#1b1a22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }
}
