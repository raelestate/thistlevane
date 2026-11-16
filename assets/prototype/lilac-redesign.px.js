// Thistlevane — Lilac (Hedge Mage) Full Spritesheet
// Same format as Rowan: 26 cols × 8 rows of 24×32 (idle 6 + walk 8 + run 8 + attack 4)

pal({
  K: "#1a1020",
  h: "#ffd5b3", H: "#c89060", n: "#8a5838",        // skin
  l: "#c898d8", L: "#9060a8", v: "#604078",          // lavender hair
  t: "#58b8a0", T: "#308870", D: "#185848",          // teal robe
  s: "#f0e0c0", S: "#c8b080",                        // shirt
  y: "#d8a848", Y: "#907828",                        // gold accents
  p: "#9878b8", P: "#685090",                        // purple pants
  b: "#584038", B: "#382820",                        // boots
  m: "#a87848", M: "#6a4a2a", q: "#584038", z: "#d8ffb0",  // hedge-mage branch wand + leaf spark
})
ramps("KnvHh", "KvLl", "KDTt", "KBbPp", "KYy", "KSs")

// ======== UPPER BODY PARTS ========

sprite("_d_body", { w: 22, h: 22 }, `
  ........llllll........
  .......lLLLLLLl.......
  ......lLLLLLLLLl......
  ......LLLLLLLLLL......
  ......LLhhhhhhLL......
  .......LhKhhKhL.......
  .......LhhhhhhL.......
  ........HhhhhH........
  .........HhhH.........
  ........lHhhHl........
  ........tsssst........
  ......ttsssssstt......
  ......ttsssssstt......
  .....HttssssssttH.....
  .....HttssssssttH.....
  ......ttyYYYYytt......
  ......ttsssssstt......
  ......TTTssssTTT......
  .......TTTTTTTT.......
  ........DTTTTD........
  .........DDDD.........
  ......................`)

sprite("_u_body", { w: 22, h: 22 }, `
  ........llllll........
  .......lLLLLLLl.......
  ......lLLLLLLLLl......
  ......LLLLLLLLLL......
  ......LLLLLLLLLL......
  .......LLLLLLLL.......
  .......LLLLLLLL.......
  ........LLLLLL........
  .........LLLL.........
  ........lLLLLl........
  ........tsssst........
  ......ttsssssstt......
  ......ttsssssstt......
  .....HttssssssttH.....
  .....HttssssssttH.....
  ......ttyYYYYytt......
  ......ttsssssstt......
  ......TTTssssTTT......
  .......TTTTTTTT.......
  ........DTTTTD........
  .........DDDD.........
  ......................`)

sprite("_l_body", { w: 22, h: 22 }, `
  ........llll..........
  ......lLLLLLl.........
  .....lLLLLLLLLl.......
  .....LLLLLLLLLL.......
  .....LLhhhhhLLl.......
  ......LhKhhhLLl.......
  ......LhhhhhLl........
  .......HhhhHL........
  ........HhHL.........
  ........HhHl..........
  .......tsssst.........
  ......ttssssstt.......
  .......tssssst........
  .......tssssstH.......
  .......tssssstH.......
  .......tyYYYytt.......
  .......tssssst........
  .......TTssssTT.......
  ........TTTTTT........
  ........DTTTTD........
  ..........DDD.........
  ......................`)

sprite("_r_body", { w: 22, h: 22 }, `
  ..........llll........
  .........lLLLLLl......
  .......lLLLLLLLLl.....
  .......LLLLLLLLLL.....
  .......lLLhhhhhLL.....
  .......lLLhhhKhL......
  ........lLhhhhhL......
  ........LHhhhH........
  .........LHhH.........
  ..........lHhH........
  .........tsssst.......
  .......ttssssstt......
  ........tssssst.......
  .......Htsssssst......
  .......Htsssssst......
  .......ttyYYYyt.......
  ........tssssst.......
  .......TTssssTT.......
  ........TTTTTT........
  ........DTTTTD........
  .........DDD..........
  ......................`)

// ======== DIAGONAL BODY PARTS (¾ angle) ========

sprite("_dl_body", { w: 22, h: 22 }, `
  ........llll..........
  ......lLLLLLl.........
  .....lLLLLLLLLl.......
  .....LLLLLLLLLL.......
  .....LLhhhhhLLl.......
  ......LhKhhKhL........
  ......LhhhhhLl........
  .......HhhhHL.........
  ........HhHL..........
  ........HhHl..........
  ........tsssst........
  ......ttsssssstt......
  ......ttsssssstt......
  .....HttssssssttH.....
  .....HttssssssttH.....
  ......ttyYYYYytt......
  ......ttsssssstt......
  ......TTTssssTTT......
  .......TTTTTTTT.......
  ........DTTTTD........
  .........DDDD.........
  ......................`)

sprite("_ul_body", { w: 22, h: 22 }, `
  ........llll..........
  ......lLLLLLl.........
  .....lLLLLLLLLl.......
  .....LLLLLLLLLL.......
  .....LLLLLLLLLL.......
  ......LLLLLLLL........
  ......LLLLLLLL........
  .......LLLLLL.........
  ........LLLL..........
  ........lLLLl.........
  ........tsssst........
  ......ttsssssstt......
  ......ttsssssstt......
  .....HttssssssttH.....
  .....HttssssssttH.....
  ......ttyYYYYytt......
  ......ttsssssstt......
  ......TTTssssTTT......
  .......TTTTTTTT.......
  ........DTTTTD........
  .........DDDD.........
  ......................`)

// ======== LEG DRAWING (shared with Rowan) ========

const WALK_DY = [
  [0, 0], [1, -1], [2, -1], [1, 0],
  [0, 0], [-1, 1], [-1, 2], [0, 1],
]
const RUN_DY = [
  [0, 0], [2, -2], [3, -1], [1, 0],
  [0, 0], [-2, 2], [-1, 3], [0, 1],
]

function drawLeg(c, x, y, shadow) {
  if (y < 0 || y > 23) return
  if (shadow) {
    c.px(x, y, "P");   c.px(x+1, y, "P")
    c.px(x, y+1, "P"); c.px(x+1, y+1, "P")
    c.px(x, y+2, "P"); c.px(x+1, y+2, "P")
    c.px(x, y+3, "B"); c.px(x+1, y+3, "B")
    c.px(x, y+4, "B"); c.px(x+1, y+4, "B")
    c.px(x, y+5, "B"); c.px(x+1, y+5, "B")
    c.px(x, y+6, "B"); c.px(x+1, y+6, "B")
  } else {
    c.px(x, y, "p");   c.px(x+1, y, "p")
    c.px(x, y+1, "p"); c.px(x+1, y+1, "P")
    c.px(x, y+2, "P"); c.px(x+1, y+2, "P")
    c.px(x, y+3, "b"); c.px(x+1, y+3, "b")
    c.px(x, y+4, "b"); c.px(x+1, y+4, "B")
    c.px(x, y+5, "b"); c.px(x+1, y+5, "B")
    c.px(x, y+6, "B"); c.px(x+1, y+6, "B")
  }
}

function drawLegsDown(c, frame, table) {
  const dy = table[frame]
  drawLeg(c, 8, 21 + dy[0], false)
  drawLeg(c, 12, 21 + dy[1], false)
}
function drawLegsUp(c, frame, table) {
  const dy = table[frame]
  drawLeg(c, 8, 21 + dy[0], false)
  drawLeg(c, 12, 21 + dy[1], false)
}
function drawLegsSide(c, frame, table) {
  const dy = table[frame]
  drawLeg(c, 9, 21 + dy[0], true)
  drawLeg(c, 11, 21 + dy[1], false)
}

function blinkDown(c) {
  if (c.frame >= 4) { c.px(9, 5, "h"); c.px(12, 5, "h") }
}
function blinkLeft(c) {
  if (c.frame >= 4) { c.px(8, 5, "h") }
}
function blinkRight(c) {
  if (c.frame >= 4) { c.px(13, 5, "h") }
}
function blinkDiagLeft(c) {
  if (c.frame >= 4) { c.px(8, 5, "h"); c.px(11, 5, "h") }
}
function blinkDiagRight(c) {
  if (c.frame >= 4) { c.px(10, 5, "h"); c.px(13, 5, "h") }
}

function swingArmsDown(c, frame, table) {
  const dy = table[frame]
  const lS = dy[0] > 0 ? -1 : dy[0] < 0 ? 1 : 0
  const rS = dy[1] > 0 ? -1 : dy[1] < 0 ? 1 : 0
  if (lS !== 0) {
    c.px(5, 13, "_"); c.px(5, 14, "_")
    c.px(5, 13 + lS, "H"); c.px(5, 14 + lS, "H")
  }
  if (rS !== 0) {
    c.px(16, 13, "_"); c.px(16, 14, "_")
    c.px(16, 13 + rS, "H"); c.px(16, 14 + rS, "H")
  }
}
function swingArmLeft(c, frame, table) {
  const dy = table[frame]
  const s = dy[1] > 0 ? -1 : dy[1] < 0 ? 1 : 0
  if (s !== 0) {
    c.px(14, 13, "_"); c.px(14, 14, "_")
    c.px(14, 13 + s, "H"); c.px(14, 14 + s, "H")
  }
}
function swingArmRight(c, frame, table) {
  const dy = table[frame]
  const s = dy[1] > 0 ? -1 : dy[1] < 0 ? 1 : 0
  if (s !== 0) {
    c.px(7, 13, "_"); c.px(7, 14, "_")
    c.px(7, 13 + s, "H"); c.px(7, 14 + s, "H")
  }
}

// ======== ANIMATIONS ========

anim("d_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsDown(c, 0, WALK_DY), stamp("_d_body", 0, 0), blinkDown)
anim("d_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsDown(c, c.frame, WALK_DY), stamp("_d_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, WALK_DY))
anim("d_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsDown(c, c.frame, RUN_DY), stamp("_d_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, RUN_DY))

anim("l_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY), stamp("_l_body", 0, 0), blinkLeft)
anim("l_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY), stamp("_l_body", 0, 0),
  (c) => swingArmLeft(c, c.frame, WALK_DY))
anim("l_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY), stamp("_l_body", 0, 0),
  (c) => swingArmLeft(c, c.frame, RUN_DY))

anim("r_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY), stamp("_r_body", 0, 0), blinkRight)
anim("r_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY), stamp("_r_body", 0, 0),
  (c) => swingArmRight(c, c.frame, WALK_DY))
anim("r_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY), stamp("_r_body", 0, 0),
  (c) => swingArmRight(c, c.frame, RUN_DY))

anim("u_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsUp(c, 0, WALK_DY), stamp("_u_body", 0, 0))
anim("u_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsUp(c, c.frame, WALK_DY), stamp("_u_body", 0, 0))
anim("u_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsUp(c, c.frame, RUN_DY), stamp("_u_body", 0, 0))

// --- DOWN-LEFT (¾) ---
anim("dl_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY), stamp("_dl_body", 0, 0), blinkDiagLeft)
anim("dl_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY), stamp("_dl_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, WALK_DY))
anim("dl_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY), stamp("_dl_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, RUN_DY))

// --- DOWN-RIGHT (¾, flipped) ---
anim("dr_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY), stamp("_dl_body", 0, 0, { flip: "x" }), blinkDiagRight)
anim("dr_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY), stamp("_dl_body", 0, 0, { flip: "x" }),
  (c) => swingArmsDown(c, c.frame, WALK_DY))
anim("dr_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY), stamp("_dl_body", 0, 0, { flip: "x" }),
  (c) => swingArmsDown(c, c.frame, RUN_DY))

// --- UP-LEFT (¾) ---
anim("ul_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY), stamp("_ul_body", 0, 0))
anim("ul_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY), stamp("_ul_body", 0, 0))
anim("ul_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY), stamp("_ul_body", 0, 0))

// --- UP-RIGHT (¾, flipped) ---
anim("ur_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY), stamp("_ul_body", 0, 0, { flip: "x" }))
anim("ur_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY), stamp("_ul_body", 0, 0, { flip: "x" }))
anim("ur_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY), stamp("_ul_body", 0, 0, { flip: "x" }))

// ======== ATTACK (4-frame weapon swing) ========
// An overhead chop: f0 raises the weapon, f1 winds up, f2 lands the hit, f3
// recovers. The weapon stays clear of the body silhouette so the pose reads at
// 24x32; the slash arc itself is a world effect (effects.json "slash-*").
// Angles are screen degrees: 0 = right, 90 = down (y grows downwards).

const WEAPON = { scale: 1.1, guard: false, tipGlow: true } // Lilac: branch wand, glowing tip
const D2R = Math.PI / 180
const LUNGE = [0, 0, 1, 0] // the body steps into the impact frame

// hx,hy = shoulder the arm swings from · pose = [angle, weapon length] per frame
const SWING = {
  d:  { hx: 15, hy: 13, pose: [[282, 10], [320, 8], [58, 10], [76, 7]],  push: [0, 1],   behind: false },
  u:  { hx: 15, hy: 13, pose: [[278, 11], [302, 9], [256, 7], [272, 9]], push: [0, -1],  behind: true },
  l:  { hx: 8,  hy: 13, pose: [[258, 9], [220, 9], [162, 8], [142, 7]],  push: [-1, 0],  behind: false },
  dl: { hx: 8,  hy: 14, pose: [[260, 9], [226, 9], [152, 8], [134, 7]],  push: [-1, 1],  behind: false },
  ul: { hx: 8,  hy: 13, pose: [[270, 9], [236, 9], [204, 7], [248, 8]],  push: [-1, -1], behind: true },
}
// Right-facing views mirror the left ones about the sprite's centre line.
const mirrorSwing = (s) => ({
  hx: 21 - s.hx, hy: s.hy,
  pose: s.pose.map(([a, l]) => [(180 - a + 360) % 360, l]),
  push: [-s.push[0], s.push[1]],
  behind: s.behind,
})
SWING.r = mirrorSwing(SWING.l)
SWING.dr = mirrorSwing(SWING.dl)
SWING.ur = mirrorSwing(SWING.ul)

function swingWeapon(c, cfg, frame) {
  const [ang, rawLen] = cfg.pose[frame]
  const len = Math.max(4, Math.round(rawLen * WEAPON.scale))
  const rad = ang * D2R
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const { hx, hy } = cfg
  const at = (d) => [Math.round(hx + cos * d), Math.round(hy + sin * d)]
  const [ex, ey] = at(2)              // elbow
  const [ax, ay] = at(3)              // hand
  const [gx, gy] = at(Math.min(5, len - 2)) // guard / shaft start
  const [tx, ty] = at(len)            // tip

  c.line(hx, hy, ex, ey, "H")         // upper arm, out of the body part's shoulder
  c.px(ax, ay, "h")                   // hand
  c.line(ex, ey, gx, gy, "q")         // grip
  if (WEAPON.guard) {
    c.px(gx - Math.round(sin), gy + Math.round(cos), "O")
    c.px(gx + Math.round(sin), gy - Math.round(cos), "O")
  }
  c.line(gx, gy, tx, ty, "M")         // blade / shaft
  // Lit edge: top for a horizontal weapon, left for a vertical one (light is top-left).
  const flat = Math.abs(cos) > Math.abs(sin)
  const ox = flat ? 0 : -1, oy = flat ? -1 : 0
  c.line(gx + ox, gy + oy, tx + ox, ty + oy, "m")
  if (WEAPON.tipGlow) {
    c.px(tx, ty, "z")
    if (frame === 2) { c.px(tx - 1, ty, "z"); c.px(tx + 1, ty, "z"); c.px(tx, ty - 1, "z"); c.px(tx, ty + 1, "z") }
  } else if (frame === 2) {
    c.px(tx, ty, "z")                 // impact glint
  }
}

/** Builds `<dir>_attack` from a body part, the usual legs and the swing. */
function attackAnim(name, body, legs, cfg, opts = {}) {
  anim(name, { w: 22, h: 30, outline: "K", fps: 14, frames: 4, loop: false },
    (c) => legs(c, 0, WALK_DY),
    (c) => { if (cfg.behind) swingWeapon(c, cfg, c.frame) },
    (c) => {
      const k = LUNGE[c.frame]
      c.stamp(body, cfg.push[0] * k, cfg.push[1] * k, opts)
    },
    (c) => { if (!cfg.behind) swingWeapon(c, cfg, c.frame) },
  )
}

attackAnim("d_attack", "_d_body", drawLegsDown, SWING.d)
attackAnim("u_attack", "_u_body", drawLegsUp, SWING.u)
attackAnim("l_attack", "_l_body", drawLegsSide, SWING.l)
attackAnim("r_attack", "_r_body", drawLegsSide, SWING.r)
attackAnim("dl_attack", "_dl_body", drawLegsSide, SWING.dl)
attackAnim("dr_attack", "_dl_body", drawLegsSide, SWING.dr, { flip: "x" })
attackAnim("ul_attack", "_ul_body", drawLegsSide, SWING.ul)
attackAnim("ur_attack", "_ul_body", drawLegsSide, SWING.ur, { flip: "x" })

// ======== SPRITESHEET ========

const R = n => Array.from({length: n}, (_, i) => i)

scene("lilac", { w: 624, h: 256 },
  ...R(6).map(f => stamp("d_idle", f*24, 0, { frame: f })),
  ...R(8).map(f => stamp("d_walk", (6+f)*24, 0, { frame: f })),
  ...R(8).map(f => stamp("d_run", (14+f)*24, 0, { frame: f })),
  ...R(4).map(f => stamp("d_attack", (22+f)*24, 0, { frame: f })),
  ...R(6).map(f => stamp("l_idle", f*24, 32, { frame: f })),
  ...R(8).map(f => stamp("l_walk", (6+f)*24, 32, { frame: f })),
  ...R(8).map(f => stamp("l_run", (14+f)*24, 32, { frame: f })),
  ...R(4).map(f => stamp("l_attack", (22+f)*24, 32, { frame: f })),
  ...R(6).map(f => stamp("r_idle", f*24, 64, { frame: f })),
  ...R(8).map(f => stamp("r_walk", (6+f)*24, 64, { frame: f })),
  ...R(8).map(f => stamp("r_run", (14+f)*24, 64, { frame: f })),
  ...R(4).map(f => stamp("r_attack", (22+f)*24, 64, { frame: f })),
  ...R(6).map(f => stamp("u_idle", f*24, 96, { frame: f })),
  ...R(8).map(f => stamp("u_walk", (6+f)*24, 96, { frame: f })),
  ...R(8).map(f => stamp("u_run", (14+f)*24, 96, { frame: f })),
  ...R(4).map(f => stamp("u_attack", (22+f)*24, 96, { frame: f })),
  ...R(6).map(f => stamp("dl_idle", f*24, 128, { frame: f })),
  ...R(8).map(f => stamp("dl_walk", (6+f)*24, 128, { frame: f })),
  ...R(8).map(f => stamp("dl_run", (14+f)*24, 128, { frame: f })),
  ...R(4).map(f => stamp("dl_attack", (22+f)*24, 128, { frame: f })),
  ...R(6).map(f => stamp("dr_idle", f*24, 160, { frame: f })),
  ...R(8).map(f => stamp("dr_walk", (6+f)*24, 160, { frame: f })),
  ...R(8).map(f => stamp("dr_run", (14+f)*24, 160, { frame: f })),
  ...R(4).map(f => stamp("dr_attack", (22+f)*24, 160, { frame: f })),
  ...R(6).map(f => stamp("ul_idle", f*24, 192, { frame: f })),
  ...R(8).map(f => stamp("ul_walk", (6+f)*24, 192, { frame: f })),
  ...R(8).map(f => stamp("ul_run", (14+f)*24, 192, { frame: f })),
  ...R(4).map(f => stamp("ul_attack", (22+f)*24, 192, { frame: f })),
  ...R(6).map(f => stamp("ur_idle", f*24, 224, { frame: f })),
  ...R(8).map(f => stamp("ur_walk", (6+f)*24, 224, { frame: f })),
  ...R(8).map(f => stamp("ur_run", (14+f)*24, 224, { frame: f })),
  ...R(4).map(f => stamp("ur_attack", (22+f)*24, 224, { frame: f })),
)
