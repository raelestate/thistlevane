// Thistlevane — Rowan Full Spritesheet Redesign
// 22 columns × 8 rows of 24×32 frames (528×256 sheet)
// Layout: idle(6f) + walk(8f) + run(8f) per direction
// Rows: down(0), left(1), right(2), up(3), down-left(4), down-right(5), up-left(6), up-right(7)

pal({
  K: "#1a1020",
  h: "#ffd5b3", H: "#c89060", n: "#8a5838",        // skin
  a: "#e88850", A: "#b85830", c: "#783020",          // hair
  g: "#78b838", G: "#488828", d: "#286018",          // tunic
  s: "#f0e0c0", S: "#c8b080",                        // shirt
  o: "#d8a848", O: "#907828",                        // belt
  p: "#988860", P: "#685840",                        // pants
  b: "#704828", B: "#482818",                        // boots
})
ramps("KncHh", "KcAa", "KdGg", "KBbPp", "KOo", "KSs")

// ======== UPPER BODY PARTS (no outline, no legs) ========

sprite("_d_body", { w: 22, h: 22 }, `
  .........aaaa.........
  .......aAAAAAAa.......
  ......aAAAAAAAAa......
  ......AAAAAAAAAA......
  ......AAhhhhhhAA......
  .......AhKhhKhA.......
  .......AhhhhhhA.......
  ........HhhhhH........
  .........HhhH.........
  .......ccHhhHcc.......
  ........gssssg........
  ......ggssssssgg......
  ......ggssssssgg......
  .....HggssssssggH.....
  .....HggssssssggH.....
  ......ggooOOoogg......
  ......ggssssssgg......
  ......GGGssssGGG......
  .......GGGGGGGG.......
  ........dGGGGd........
  .........dddd.........
  ......................`)

sprite("_u_body", { w: 22, h: 22 }, `
  .........aaaa.........
  .......aAAAAAAa.......
  ......aAAAAAAAAa......
  ......AAAAAAAAAA......
  ......AAAAAAAAAA......
  .......AAAAAAAA.......
  .......AAAAAAAA.......
  ........AAAAAA........
  .........AAAA.........
  ........cAAAAc........
  ........gssssg........
  ......ggssssssgg......
  ......ggssssssgg......
  .....HggssssssggH.....
  .....HggssssssggH.....
  ......ggooOOoogg......
  ......ggssssssgg......
  ......GGGssssGGG......
  .......GGGGGGGG.......
  ........dGGGGd........
  .........dddd.........
  ......................`)

sprite("_l_body", { w: 22, h: 22 }, `
  ........aaaa..........
  ......aAAAAAa.........
  .....aAAAAAAAAcc......
  .....AAAAAAAAAcc......
  .....AAhhhhhAAcc......
  ......AhKhhhAAcc......
  ......AhhhhhAcc.......
  .......HhhhHAc........
  ........HhHAc.........
  ........HhHc..........
  .......gssssg.........
  ......ggsssssgg.......
  .......gssssssg.......
  .......gsssssgH.......
  .......gsssssgH.......
  .......gooOOogg.......
  .......gssssssg.......
  .......GGssssGG.......
  ........GGGGGG........
  ........dGGGGd........
  ..........ddd.........
  ......................`)

sprite("_r_body", { w: 22, h: 22 }, `
  ..........aaaa........
  .........aAAAAAa......
  ......ccAAAAAAAAa.....
  ......ccAAAAAAAAA.....
  ......ccAAhhhhhAA.....
  ......ccAAhhhKhA......
  .......ccAhhhhhA......
  ........cAHhhhH.......
  .........cAHhH........
  ..........cHhH........
  .........gssssg.......
  .......ggsssssgg......
  .......gsssssg........
  .......Hgssssssg......
  .......Hgssssssg......
  .......ggooOOog.......
  .......gssssssg.......
  .......GGssssGG.......
  ........GGGGGG........
  ........dGGGGd........
  .........ddd..........
  ......................`)

// ======== DIAGONAL BODY PARTS (¾ angle) ========

sprite("_dl_body", { w: 22, h: 22 }, `
  ........aaaa..........
  ......aAAAAAa.........
  .....aAAAAAAAAac......
  .....AAAAAAAAAcc......
  .....AAhhhhhAAc.......
  ......AhKhhKhA........
  ......AhhhhhAa........
  .......HhhhHAc........
  ........HhHcc.........
  .......ccHhHc.........
  ........gssssg........
  ......ggssssssgg......
  ......ggssssssgg......
  .....HggssssssggH.....
  .....HggssssssggH.....
  ......ggooOOoogg......
  ......ggssssssgg......
  ......GGGssssGGG......
  .......GGGGGGGG.......
  ........dGGGGd........
  .........dddd.........
  ......................`)

sprite("_ul_body", { w: 22, h: 22 }, `
  ........aaaa..........
  ......aAAAAAa.........
  .....aAAAAAAAAac......
  .....AAAAAAAAAcc......
  .....AAAAAAAAAAc......
  ......AAAAAAAA........
  ......AAAAAAAA........
  .......AAAAAA.........
  ........AAAAc.........
  .......cAAAAc.........
  ........gssssg........
  ......ggssssssgg......
  ......ggssssssgg......
  .....HggssssssggH.....
  .....HggssssssggH.....
  ......ggooOOoogg......
  ......ggssssssgg......
  ......GGGssssGGG......
  .......GGGGGGGG.......
  ........dGGGGd........
  .........dddd.........
  ......................`)

// ======== LEG DRAWING ========

const WALK_DY = [
  [0, 0],    // 0: both center
  [1, -1],   // 1: L forward, R back
  [2, -1],   // 2: L stride
  [1, 0],    // 3: L recover
  [0, 0],    // 4: both center
  [-1, 1],   // 5: R forward, L back
  [-1, 2],   // 6: R stride
  [0, 1],    // 7: R recover
]

const RUN_DY = [
  [0, 0],
  [2, -2],
  [3, -1],
  [1, 0],
  [0, 0],
  [-2, 2],
  [-1, 3],
  [0, 1],
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
  const sway = dy[0] > 0 ? 1 : dy[0] < 0 ? -1 : 0
  for (let y = 21; y < 28; y++) {
    const pcol = y < 24 ? "c" : "A"
    c.px(10 + sway, y, pcol); c.px(11 + sway, y, pcol)
  }
  drawLeg(c, 8, 21 + dy[0], false)
  drawLeg(c, 12, 21 + dy[1], false)
}

function drawLegsSide(c, frame, table) {
  const dy = table[frame]
  drawLeg(c, 9, 21 + dy[0], true)    // back leg (shadowed)
  drawLeg(c, 11, 21 + dy[1], false)  // front leg
}

function drawLegsDiagUp(c, frame, table) {
  const dy = table[frame]
  const sway = dy[0] > 0 ? 1 : dy[0] < 0 ? -1 : 0
  for (let y = 21; y < 28; y++) {
    const pcol = y < 24 ? "c" : "A"
    c.px(10 + sway, y, pcol); c.px(11 + sway, y, pcol)
  }
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

// --- DOWN ---
anim("d_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsDown(c, 0, WALK_DY),
  stamp("_d_body", 0, 0),
  blinkDown)

anim("d_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsDown(c, c.frame, WALK_DY),
  stamp("_d_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, WALK_DY))

anim("d_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsDown(c, c.frame, RUN_DY),
  stamp("_d_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, RUN_DY))

// --- LEFT ---
anim("l_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY),
  stamp("_l_body", 0, 0),
  blinkLeft)

anim("l_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY),
  stamp("_l_body", 0, 0),
  (c) => swingArmLeft(c, c.frame, WALK_DY))

anim("l_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY),
  stamp("_l_body", 0, 0),
  (c) => swingArmLeft(c, c.frame, RUN_DY))

// --- RIGHT ---
anim("r_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY),
  stamp("_r_body", 0, 0),
  blinkRight)

anim("r_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY),
  stamp("_r_body", 0, 0),
  (c) => swingArmRight(c, c.frame, WALK_DY))

anim("r_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY),
  stamp("_r_body", 0, 0),
  (c) => swingArmRight(c, c.frame, RUN_DY))

// --- UP ---
anim("u_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsUp(c, 0, WALK_DY),
  stamp("_u_body", 0, 0))

anim("u_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsUp(c, c.frame, WALK_DY),
  stamp("_u_body", 0, 0))

anim("u_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsUp(c, c.frame, RUN_DY),
  stamp("_u_body", 0, 0))

// --- DOWN-LEFT (¾) ---
anim("dl_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY),
  stamp("_dl_body", 0, 0),
  blinkDiagLeft)

anim("dl_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY),
  stamp("_dl_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, WALK_DY))

anim("dl_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY),
  stamp("_dl_body", 0, 0),
  (c) => swingArmsDown(c, c.frame, RUN_DY))

// --- DOWN-RIGHT (¾, flipped) ---
anim("dr_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsSide(c, 0, WALK_DY),
  stamp("_dl_body", 0, 0, { flip: "x" }),
  blinkDiagRight)

anim("dr_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsSide(c, c.frame, WALK_DY),
  stamp("_dl_body", 0, 0, { flip: "x" }),
  (c) => swingArmsDown(c, c.frame, WALK_DY))

anim("dr_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsSide(c, c.frame, RUN_DY),
  stamp("_dl_body", 0, 0, { flip: "x" }),
  (c) => swingArmsDown(c, c.frame, RUN_DY))

// --- UP-LEFT (¾) ---
anim("ul_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsDiagUp(c, 0, WALK_DY),
  stamp("_ul_body", 0, 0))

anim("ul_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsDiagUp(c, c.frame, WALK_DY),
  stamp("_ul_body", 0, 0))

anim("ul_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsDiagUp(c, c.frame, RUN_DY),
  stamp("_ul_body", 0, 0))

// --- UP-RIGHT (¾, flipped) ---
anim("ur_idle", { w: 22, h: 30, outline: "K", fps: 5, frames: 6 },
  (c) => drawLegsDiagUp(c, 0, WALK_DY),
  stamp("_ul_body", 0, 0, { flip: "x" }))

anim("ur_walk", { w: 22, h: 30, outline: "K", fps: 14, frames: 8 },
  (c) => drawLegsDiagUp(c, c.frame, WALK_DY),
  stamp("_ul_body", 0, 0, { flip: "x" }))

anim("ur_run", { w: 22, h: 30, outline: "K", fps: 20, frames: 8 },
  (c) => drawLegsDiagUp(c, c.frame, RUN_DY),
  stamp("_ul_body", 0, 0, { flip: "x" }))

// ======== SPRITESHEET ========

const R = n => Array.from({length: n}, (_, i) => i)

scene("rowan", { w: 528, h: 256 },
  // Row 0: down (y=0)
  ...R(6).map(f => stamp("d_idle", f*24, 0, { frame: f })),
  ...R(8).map(f => stamp("d_walk", (6+f)*24, 0, { frame: f })),
  ...R(8).map(f => stamp("d_run", (14+f)*24, 0, { frame: f })),
  // Row 1: left (y=32)
  ...R(6).map(f => stamp("l_idle", f*24, 32, { frame: f })),
  ...R(8).map(f => stamp("l_walk", (6+f)*24, 32, { frame: f })),
  ...R(8).map(f => stamp("l_run", (14+f)*24, 32, { frame: f })),
  // Row 2: right (y=64)
  ...R(6).map(f => stamp("r_idle", f*24, 64, { frame: f })),
  ...R(8).map(f => stamp("r_walk", (6+f)*24, 64, { frame: f })),
  ...R(8).map(f => stamp("r_run", (14+f)*24, 64, { frame: f })),
  // Row 3: up (y=96)
  ...R(6).map(f => stamp("u_idle", f*24, 96, { frame: f })),
  ...R(8).map(f => stamp("u_walk", (6+f)*24, 96, { frame: f })),
  ...R(8).map(f => stamp("u_run", (14+f)*24, 96, { frame: f })),
  // Row 4: down-left (y=128)
  ...R(6).map(f => stamp("dl_idle", f*24, 128, { frame: f })),
  ...R(8).map(f => stamp("dl_walk", (6+f)*24, 128, { frame: f })),
  ...R(8).map(f => stamp("dl_run", (14+f)*24, 128, { frame: f })),
  // Row 5: down-right (y=160)
  ...R(6).map(f => stamp("dr_idle", f*24, 160, { frame: f })),
  ...R(8).map(f => stamp("dr_walk", (6+f)*24, 160, { frame: f })),
  ...R(8).map(f => stamp("dr_run", (14+f)*24, 160, { frame: f })),
  // Row 6: up-left (y=192)
  ...R(6).map(f => stamp("ul_idle", f*24, 192, { frame: f })),
  ...R(8).map(f => stamp("ul_walk", (6+f)*24, 192, { frame: f })),
  ...R(8).map(f => stamp("ul_run", (14+f)*24, 192, { frame: f })),
  // Row 7: up-right (y=224)
  ...R(6).map(f => stamp("ur_idle", f*24, 224, { frame: f })),
  ...R(8).map(f => stamp("ur_walk", (6+f)*24, 224, { frame: f })),
  ...R(8).map(f => stamp("ur_run", (14+f)*24, 224, { frame: f })),
)
