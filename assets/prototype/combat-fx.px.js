// Thistlevane — combat effects sheet
// 24×24 frames, laid out row-major for Phaser's uniform spritesheet slicing:
//   row 0 (frames 0-4)    slash             — the weapon arc, played in front of the attacker
//   row 1 (frames 5-9)    impact            — hit burst, played on the defender
//   row 2 (frame 10)      target-ring       — one static frame: corner ticks under a target
//   row 2 (frame 11)      windup-telegraph  — one static frame: warning glyph before a mob attack lands
//   row 2 (frame 12)      projectile-bolt   — one static frame: generic ranged shot, rotated at runtime
// Build:  node .claude/skills/pxl-pixel-art/bin/pxl.js build assets/prototype/combat-fx.px.js
// Output: out/sheets/combat_fx.png -> assets/effects/combat.png

pal({
  w: "#fffdf2", s: "#ffe9b8", S: "#ffb860", o: "#d8822c", // slash / impact: warm white -> ember
  c: "#bfe8ff", C: "#6aa8e0",                              // cool rim on the fastest part of the arc
  r: "#ff9a3c", R: "#d05818",                              // impact core (ember, not blood)
  g: "#ffd24a", G: "#b07818",                              // target ring
  K: "#1a1020",
})

const D2R = Math.PI / 180
const CX = 12, CY = 12

/** Arc band between two radii over an angular span, in one colour. */
function arcBand(c, a0, a1, r0, r1, color, cx = CX, cy = CY) {
  const steps = Math.max(8, Math.round(Math.abs(a1 - a0) * 1.6))
  for (let i = 0; i <= steps; i++) {
    const a = (a0 + ((a1 - a0) * i) / steps) * D2R
    for (let r = r0; r <= r1; r += 0.5) {
      c.px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), color)
    }
  }
}

// ──────────────── SLASH ────────────────
// A crescent sweeping clockwise through the lower half: it grows, peaks on
// frame 2 (the attack's impact frame) and breaks up into sparks.
const SLASH = [
  { a0: 212, a1: 250, r0: 7, r1: 8, core: null },
  { a0: 206, a1: 290, r0: 7, r1: 9, core: [224, 272] },
  { a0: 200, a1: 340, r0: 7, r1: 9.5, core: [230, 310] },
  { a0: 250, a1: 352, r0: 7, r1: 9, core: [280, 330] },
  { a0: 300, a1: 350, r0: 8, r1: 9, core: null },
]

const SLASH_CY = 18 // the arc pivots below centre, so the crescent lands mid-frame

anim("slash", { w: 24, h: 24, frames: 5, fps: 20, loop: false }, (c) => {
  const f = SLASH[c.frame]
  arcBand(c, f.a0, f.a1, f.r0, f.r1, "S", CX, SLASH_CY)               // warm outer edge
  arcBand(c, f.a0 + 6, f.a1 - 6, f.r0 + 0.5, f.r1 - 0.5, "s", CX, SLASH_CY)
  if (f.core) arcBand(c, f.core[0], f.core[1], f.r0 + 1, f.r1 - 1, "w", CX, SLASH_CY) // hot core
  if (c.frame === 2) arcBand(c, f.a0 + 4, f.a0 + 22, f.r1 - 1, f.r1, "c", CX, SLASH_CY) // cool rim
  if (c.frame >= 3) {
    // the arc breaks into a few sparks as it fades
    const n = c.frame === 3 ? 5 : 3
    for (let i = 0; i < n; i++) {
      const a = (f.a0 + ((f.a1 - f.a0) * i) / (n - 1)) * D2R
      const r = f.r1 + 1 + (i % 2)
      c.px(Math.round(CX + Math.cos(a) * r), Math.round(SLASH_CY + Math.sin(a) * r), i % 2 ? "s" : "S")
    }
  }
})

// ──────────────── IMPACT ────────────────
// A spark, not a smoke ball: short spokes and a tiny core, so the creature
// you are hitting stays visible underneath.
const SPOKES = [24, 76, 128, 198, 250, 312]
anim("impact", { w: 24, h: 24, frames: 5, fps: 22, loop: false }, (c) => {
  const inner = [1, 3, 5, 7, 9][c.frame]
  const outer = [3, 7, 9, 11, 12][c.frame]
  for (let i = 0; i < SPOKES.length; i++) {
    // Alternate long and short spokes so the star does not read as a disc.
    const long = i % 2 === 0
    const a = (SPOKES[i] + c.frame * 5) * D2R
    const dx = Math.cos(a), dy = Math.sin(a)
    const tip = long ? outer : outer - 3
    for (let r = inner; r <= tip; r += 0.8) {
      c.px(Math.round(CX + dx * r), Math.round(CY + dy * r), r > tip - 1.6 ? "S" : "s")
    }
    if (c.frame >= 2 && long) c.px(Math.round(CX + dx * (tip + 2)), Math.round(CY + dy * (tip + 2)), "o")
  }
  if (c.frame <= 1) {
    c.circ(CX, CY, c.frame === 0 ? 1 : 2, "w")
    if (c.frame === 1) { c.px(CX, CY, "r"); c.px(CX + 1, CY, "r") }
  } else if (c.frame === 2) {
    c.ring(CX, CY, 2, "r")
  }
})

// ──────────────── TARGET RING ────────────────
// Four small corner ticks mark the selected target, reticle-style — deliberately *not* a ground
// ring/ellipse (that read as a generic prototype selection circle). One frame: the scene pulses
// it with a tween, which costs no extra texture.
sprite("target_ring", { w: 24, h: 24 }, (c) => {
  const ticks = [
    { x: CX - 9, y: CY, dx: 1, dy: 0 },
    { x: CX + 9, y: CY, dx: -1, dy: 0 },
    { x: CX, y: CY - 9, dx: 0, dy: 1 },
    { x: CX, y: CY + 9, dx: 0, dy: -1 },
  ]
  for (const t of ticks) {
    c.px(t.x, t.y, "g")
    c.px(t.x + t.dx, t.y + t.dy, "G")
  }
})

// ──────────────── WINDUP TELEGRAPH ────────────────
// A warning chevron with an exclamation mark — the brief tell before a mob's attack lands.
// Replaces a plain red circle; the scene still owns the pulse/fade timing via tween.
sprite("windup_telegraph", { w: 24, h: 24 }, (c) => {
  c.line(12, 4, 4, 19, "R")
  c.line(12, 4, 20, 19, "R")
  c.line(4, 19, 20, 19, "R")
  for (let y = 9; y <= 14; y++) c.px(12, y, "w")
  c.px(12, 16, "w")
})

// ──────────────── PROJECTILE BOLT ────────────────
// A small generic ranged shot, drawn pointing right (0°) — the scene rotates it to the actual
// flight direction at runtime (setRotation), so one frame covers every aim instead of 8.
sprite("projectile_bolt", { w: 24, h: 24 }, (c) => {
  c.ellipse(CX - 1, CY, 6, 2, "o")
  c.ellipse(CX + 1, CY, 4, 1.5, "s")
  c.ellipse(CX + 3, CY, 2, 1, "w")
})

sheet("combat_fx", ["slash", "impact", "target_ring", "windup_telegraph", "projectile_bolt"], { cols: 5, pad: 0 })
