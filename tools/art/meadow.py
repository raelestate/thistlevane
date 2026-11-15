"""
Generates the PLACEHOLDER meadow tileset and the big test map (v2).

Highlights
  - Auto-tiled materials with rounded edges (dirt path, cobblestone plaza, tilled soil,
    water with shoreline + 4-frame ripples). Tiles are generated on demand per
    neighbour mask, so the tileset only contains shapes the map actually uses.
  - 32x48 trees (2x2 canopy drawn above players + trunk row), bushes, rocks, stumps,
    logs, fences, a wooden bridge over the river, flowers, tufts, tall grass, lilies,
    mushrooms, crop sprouts.
  - 80x56 map: forest border, river with bridge, pond, cobbled plaza, farm plot,
    flower meadows, tall-grass patches, forest clumps.

Everything the game needs to know about a tile lives in the Tiled data (see
docs/content-guide.md for the property list). Tiles with `walkable: true`
(the bridge) override `collides` from layers below.

Usage:  python tools/art/meadow.py     (needs Pillow)
"""
import json
import math
import os
import random
from PIL import Image
from pix import ramp, rgb, shift

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
T = 16
COLS = 16
rng = random.Random(2026)

# ------------------------------------------------------------------ dynamic tileset
class Tileset:
    def __init__(self):
        self.tiles = []      # list of PIL 16x16 images
        self.meta = {}       # local id -> {'properties': [...], 'animation': [...]}
        self.byKey = {}

    def add(self, key, img, props=None, animation=None):
        if key in self.byKey:
            return self.byKey[key]
        tid = len(self.tiles)
        self.tiles.append(img)
        self.byKey[key] = tid
        m = {}
        if props:
            m['properties'] = props
        if animation:
            m['animation'] = animation
        if m:
            self.meta[tid] = m
        return tid

    def image(self):
        rows = math.ceil(len(self.tiles) / COLS)
        sheet = Image.new('RGBA', (COLS * T, max(1, rows) * T), (0, 0, 0, 0))
        for i, t in enumerate(self.tiles):
            sheet.paste(t, ((i % COLS) * T, (i // COLS) * T))
        return sheet

TS = Tileset()

def prop(name, value):
    return {'name': name, 'type': 'bool' if isinstance(value, bool) else 'string', 'value': value}

def new_tile():
    return Image.new('RGBA', (T, T), (0, 0, 0, 0))

# ------------------------------------------------------------------ palettes
GRASS = ramp('63a84e')
GRASS_DARK = shift(rgb('63a84e'), -0.07, 0, 0.01)
GRASS_LIGHT = shift(rgb('63a84e'), 0.07, 0, -0.01)
DIRT = ramp('d2ab76')
COBBLE = ramp('a9a39a')
SOIL = ramp('8a5f3c')
WATER = ramp('3f86c9')
WOOD = ramp('a2713f')
LEAF = ramp('3f8f3f')
TRUNK = ramp('7a5334')
STONE = ramp('8e8a86')

def grass_pixel(x, y, seed=0):
    """Calm grass: base colour with sparse 2px dabs; much less noisy than per-pixel random."""
    r = random.Random((x * 73856093) ^ (y * 19349663) ^ seed)
    v = r.random()
    if v < 0.06:
        return GRASS_DARK
    if v < 0.10:
        return GRASS_LIGHT
    return GRASS['base']

def grass_tile(seed=0, tufts=0):
    img = new_tile(); p = img.load()
    for y in range(T):
        for x in range(T):
            p[x, y] = grass_pixel(x, y, seed) + (255,)
    r = random.Random(seed * 31 + 7)
    for _ in range(tufts):
        bx, by = r.randrange(1, 14), r.randrange(3, 15)
        p[bx, by] = GRASS_DARK + (255,); p[bx + 1, by] = GRASS_DARK + (255,)
        p[bx, by - 1] = GRASS_LIGHT + (255,); p[bx + 2, by - 1] = GRASS_LIGHT + (255,)
    return img

# ------------------------------------------------------------------ auto-tiling
# Neighbour bit order: N=1, E=2, S=4, W=8, NE=16, SE=32, SW=64, NW=128
N, E, S, W, NE, SE, SW, NW = 1, 2, 4, 8, 16, 32, 64, 128

def inside_shape(mask, x, y, r_out=5.5, r_in=0.0):
    """Is pixel (x, y) of a tile with neighbour `mask` part of the material?"""
    px, py = x + 0.5, y + 0.5
    corners = [  # (needs edge A, needs edge B, diagonal, corner point)
        (N, W, NW, (0, 0)), (N, E, NE, (T, 0)), (S, E, SE, (T, T)), (S, W, SW, (0, T)),
    ]
    for a, b, d, (cx, cy) in corners:
        dist = math.hypot(px - cx, py - cy)
        if not (mask & a) and not (mask & b):
            # convex corner: round it off
            ox = cx + (r_out if cx == 0 else -r_out)
            oy = cy + (r_out if cy == 0 else -r_out)
            in_quadrant = (px < ox if cx == 0 else px > ox) and (py < oy if cy == 0 else py > oy)
            if in_quadrant and math.hypot(px - ox, py - oy) > r_out:
                return False
        elif (mask & a) and (mask & b) and not (mask & d):
            # concave corner: the other material pokes in a little
            if dist < r_in:
                return False
    return True

def edge_distance(mask, x, y):
    """Rough distance (in px) from the pixel to the nearest outside region; used for edge bands."""
    px, py = x + 0.5, y + 0.5
    d = 99
    if not mask & N: d = min(d, py)
    if not mask & S: d = min(d, T - py)
    if not mask & W: d = min(d, px)
    if not mask & E: d = min(d, T - px)
    for a, b, dg, (cx, cy) in [(N, W, NW, (0, 0)), (N, E, NE, (T, 0)), (S, E, SE, (T, T)), (S, W, SW, (0, T))]:
        if not (mask & a) and not (mask & b):
            ox = cx + (5.5 if cx == 0 else -5.5); oy = cy + (5.5 if cy == 0 else -5.5)
            d = min(d, 5.5 - math.hypot(px - ox, py - oy) + 0.0) if ((px < ox if cx == 0 else px > ox) and (py < oy if cy == 0 else py > oy)) else d
    return d

def material_tile(kind, mask, frame=0):
    img = new_tile(); p = img.load()
    rr = random.Random(mask * 7 + kind.__hash__() % 1000)
    for y in range(T):
        for x in range(T):
            if not inside_shape(mask, x, y):
                p[x, y] = grass_pixel(x, y, 3) + (255,)
                continue
            d = edge_distance(mask, x, y)
            if kind == 'dirt':
                c = DIRT['base']
                v = rr.random()
                if v < 0.08: c = DIRT['shadow']
                elif v < 0.14: c = DIRT['light']
                if d < 1.0: c = DIRT['shadow'] if (y > 8 or (not mask & S and y > 10)) else DIRT['light']
            elif kind == 'cobble':
                # 4x4 stones offset per row, mortar lines
                row = (y // 4); off = 2 if row % 2 else 0
                mortar = (y % 4 == 3) or ((x + off) % 4 == 3)
                c = COBBLE['shadow'] if mortar else (COBBLE['light'] if (y % 4 == 0) else COBBLE['base'])
                if not mortar and ((x // 4 + row) % 3 == 0): c = shift(c, -0.04, 0, 0.01)
                if d < 1.0: c = COBBLE['outline'] if y > 8 else COBBLE['shadow']
            elif kind == 'soil':
                c = SOIL['base'] if (y % 4) in (0, 1) else SOIL['shadow']
                if (y % 4) == 2: c = SOIL['outline']
                if rr.random() < 0.05: c = SOIL['light']
                if d < 1.0: c = SOIL['outline']
            else:  # water, animated
                c = WATER['base']
                if ((x + y * 2 + frame * 2) % 11) == 0: c = WATER['light']
                if ((x * 3 + y + frame * 3) % 17) == 0: c = WATER['shadow']
                if d < 2.0: c = WATER['shadow']                                   # dark shoreline band
                if d < 1.0: c = shift(WATER['shadow'], -0.08)                     # deeper at the very edge
                if 2.0 <= d < 3.0 and (x + y + frame) % 4 != 0: c = WATER['bright']  # foam line
                elif 2.0 <= d < 3.0: c = WATER['light']
            p[x, y] = c + (255,)
    return img

MATERIAL_PROPS = {
    'dirt': [],
    'cobble': [],
    'soil': [],
    'water': [prop('collides', True), prop('bumpEffect', 'splash')],
}

def material_gid(kind, mask):
    """Local tile id for a material with a given neighbour mask (creates it if needed)."""
    # Diagonal bits only matter when both adjacent edges are present.
    if not (mask & N and mask & W): mask &= ~NW
    if not (mask & N and mask & E): mask &= ~NE
    if not (mask & S and mask & E): mask &= ~SE
    if not (mask & S and mask & W): mask &= ~SW
    key = (kind, mask)
    if key in TS.byKey:
        return TS.byKey[key]
    if kind == 'water':
        frames = [TS.add((kind, mask, f), material_tile(kind, mask, f), MATERIAL_PROPS[kind]) for f in range(4)]
        anim = [{'tileid': f, 'duration': 280} for f in frames]
        tid = frames[0]
        TS.meta.setdefault(tid, {})['animation'] = anim
        TS.byKey[key] = tid
        return tid
    return TS.add(key, material_tile(kind, mask), MATERIAL_PROPS[kind])

# ------------------------------------------------------------------ decor & objects (hand-built)
def over_grass(draw, seed=0):
    img = grass_tile(seed)
    draw(img.load())
    return img

def flowers(variant, sway):
    cols = [('e9b3d6', 'fff0f6'), ('f4d56a', 'fff7c2'), ('b7a0e8', 'ece4ff'), ('f0f0e6', 'ffffff')]
    def d(p):
        r = random.Random(variant)
        for _ in range(4):
            fx, fy = r.randrange(2, 13), r.randrange(4, 14)
            c, hi = cols[r.randrange(len(cols))]
            p[fx, fy + 1] = GRASS_DARK + (255,)
            x = fx + sway
            for dx, dy in ((0, 0), (-1, 0), (1, 0), (0, -1)):
                if 0 <= x + dx < T and 0 <= fy + dy < T: p[x + dx, fy + dy] = rgb(c) + (255,)
            p[x, fy] = rgb(hi) + (255,)
    return over_grass(d, 11 + variant)

def tuft(sway, seed):
    def d(p):
        r = random.Random(seed)
        for _ in range(4):
            bx, by, h = r.randrange(2, 13), r.randrange(6, 15), r.randrange(3, 6)
            for i in range(h):
                xx = bx + round(sway * i / (h - 1))
                if 0 <= xx < T: p[xx, by - i] = (GRASS_LIGHT if i >= h - 2 else GRASS_DARK) + (255,)
    return over_grass(d, seed)

def tall_grass(lean, flat=False):
    img = new_tile(); p = img.load()
    base = shift(rgb('63a84e'), -0.06, 0.02, 0.02)
    for y in range(T):
        for x in range(T):
            p[x, y] = (base if (x * 3 + y) % 5 else shift(base, -0.05)) + (255,)
    r = random.Random(5)
    for x in range(T):
        h = (13 if not flat else 5) - r.randrange(0, 5)
        dark = x % 3 == 0
        for i in range(h):
            k = i / max(1, h - 1)
            off = round((lean if not flat else (4 if x % 2 else -4)) * k * k)
            c = shift(base, -0.08) if dark else shift(base, 0.08)
            if i >= h - 3: c = shift(base, 0.22, -0.05, -0.03) if not dark else shift(base, 0.1)
            xx = x + off
            if 0 <= xx < T: p[xx, 15 - i] = c + (255,)
    return img

def rock():
    def d(p):
        for y in range(T):
            for x in range(T):
                dd = ((x - 7.5) / 6.5) ** 2 + ((y - 9.5) / 5.2) ** 2
                if dd <= 1:
                    c = STONE['light'] if y < 7 and x < 10 else (STONE['shadow'] if dd > .6 or y > 11 else STONE['base'])
                    p[x, y] = c + (255,)
                elif dd <= 1.3 and y >= 5:
                    p[x, y] = STONE['outline'] + (255,)
        p[5, 6] = STONE['bright'] + (255,); p[6, 5] = STONE['bright'] + (255,)
    return over_grass(d, 21)

def bush(shift_x, berries=True):
    def d(p):
        for y in range(T):
            for x in range(T):
                sx = x - shift_x * (1 - y / 15)
                dd = ((sx - 7.5) / 7.2) ** 2 + ((y - 9) / 6.4) ** 2
                if dd <= 1:
                    c = LEAF['base']
                    if y < 6 and dd < .7: c = LEAF['light']
                    if y > 11 or dd > .75: c = LEAF['shadow']
                    if (x * 7 + y * 3) % 11 == 0: c = shift(c, 0.06)
                    p[x, y] = c + (255,)
                elif dd <= 1.2:
                    p[x, y] = LEAF['outline'] + (255,)
        if berries:
            for bx, by in ((4, 7), (10, 6), (7, 11)):
                p[bx + shift_x, by] = (216, 72, 74, 255); p[bx + shift_x + 1, by] = (170, 54, 58, 255)
    return over_grass(d, 22)

def thistle(sway):
    def d(p):
        for y in range(6, 16):
            for x in range(T):
                if ((x - 7.5) / 5.5) ** 2 + ((y - 11.5) / 4.5) ** 2 <= 1:
                    p[x, y] = (LEAF['base'] if (x + y) % 3 else LEAF['shadow']) + (255,)
        for tx, ty in ((4, 5), (8, 3), (12, 5), (6, 7), (10, 7)):
            s = sway if ty < 6 else 0
            for ax, ay in ((0, 0), (1, 0), (0, 1), (1, 1)): p[tx + ax + s, ty + ay] = (155, 95, 192, 255)
            p[tx + s, ty - 1] = (196, 138, 224, 255); p[tx + 1 + s, ty - 1] = (216, 168, 238, 255)
    return over_grass(d, 23)

def mushrooms():
    def d(p):
        for mx, my in ((4, 9), (10, 6), (9, 12)):
            p[mx, my + 1] = (241, 230, 210, 255); p[mx, my + 2] = (210, 196, 176, 255)
            for dx in (-1, 0, 1): p[mx + dx, my] = (214, 90, 74, 255)
            p[mx, my - 1] = (214, 90, 74, 255); p[mx, my] = (251, 232, 224, 255)
    return over_grass(d, 24)

def stump():
    def d(p):
        for y in range(5, 15):
            for x in range(3, 13):
                p[x, y] = (TRUNK['base'] if y > 8 else WOOD['light']) + (255,)
        for x in range(5, 11): p[x, 7] = WOOD['base'] + (255,)
        for x in range(3, 13): p[x, 14] = TRUNK['outline'] + (255,); p[x, 5] = WOOD['bright'] + (255,)
        for y in range(5, 15): p[3, y] = TRUNK['outline'] + (255,); p[12, y] = TRUNK['shadow'] + (255,)
    return over_grass(d, 25)

def log():
    def d(p):
        for y in range(6, 12):
            for x in range(1, 15):
                c = TRUNK['base'] if 7 < y < 11 else (TRUNK['light'] if y == 7 else TRUNK['shadow'])
                if y in (6, 11) or x in (1, 14): c = TRUNK['outline']
                p[x, y] = c + (255,)
        for y in range(7, 11): p[14, y] = WOOD['light'] + (255,)
    return over_grass(d, 26)

def fence(kind):
    def d(p):
        if kind in ('h', 'hl', 'hr'):
            xs = range(0, T) if kind == 'h' else (range(6, T) if kind == 'hl' else range(0, 10))
            for x in xs:
                for y in (6, 7, 11, 12): p[x, y] = (WOOD['light'] if y in (6, 11) else WOOD['shadow']) + (255,)
        if kind in ('v', 'vt', 'vb'):
            ys = range(0, T) if kind == 'v' else (range(6, T) if kind == 'vt' else range(0, 10))
            for y in ys:
                for x in (6, 7): p[x, y] = (WOOD['light'] if x == 6 else WOOD['shadow']) + (255,)
        for y in range(3, 15):
            p[6, y] = WOOD['base'] + (255,); p[7, y] = TRUNK['shadow'] + (255,)
        p[6, 3] = WOOD['bright'] + (255,); p[7, 3] = WOOD['light'] + (255,)
        p[6, 14] = TRUNK['outline'] + (255,); p[7, 14] = TRUNK['outline'] + (255,)
    return over_grass(d, 27)

def bridge(part):
    """Planks over water for a vertical (N-S) bridge; part 'l' / 'm' / 'r' decides which side has a rail."""
    img = new_tile(); p = img.load()
    for y in range(T):
        for x in range(T):
            plank = (y // 4) % 2
            c = WOOD['base'] if plank else WOOD['light']
            if y % 4 == 3: c = WOOD['shadow']
            if y % 4 == 0 and (x + y) % 5 == 0: c = WOOD['bright']
            p[x, y] = c + (255,)
    rail_x = {'l': (0, 1), 'r': (14, 15), 'm': ()}[part]
    for x in rail_x:
        for y in range(T):
            p[x, y] = (TRUNK['light'] if x in (0, 15) else TRUNK['outline']) + (255,)
    return img

def crop(stage):
    img = new_tile(); p = img.load()
    for y in range(T):
        for x in range(T):
            p[x, y] = (SOIL['base'] if (y % 4) in (0, 1) else (SOIL['shadow'] if y % 4 == 3 else SOIL['outline'])) + (255,)
    for cx in (3, 8, 13):
        for cy in (4, 12):
            p[cx, cy] = LEAF['light'] + (255,); p[cx, cy - 1] = LEAF['base'] + (255,)
            if stage > 0:
                p[cx - 1, cy - 1] = LEAF['base'] + (255,); p[cx + 1, cy - 1] = LEAF['light'] + (255,)
            if stage > 1:
                p[cx, cy - 2] = (240, 190, 90, 255)
    return img

def lily(frame):
    base = material_tile('water', 0xFF, frame)
    p = base.load()
    dy = [0, 0, 1, 1][frame]
    for y in range(T):
        for x in range(T):
            if ((x - 7) / 5) ** 2 + ((y - 8 - dy) / 4) ** 2 <= 1 and not (x > 7 and abs(y - 8 - dy) < 1):
                p[x, y] = (LEAF['base'] if y > 7 + dy else LEAF['light']) + (255,)
    p[6, 7 + dy] = (246, 192, 216, 255); p[5, 7 + dy] = (251, 226, 236, 255)
    return base

def tree_images(frame):
    """Returns 2x2 canopy tiles + 2 trunk tiles for a 32x48 tree."""
    W_, H_ = 32, 48
    img = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); p = img.load()
    sw = [0, 1][frame]
    # trunk + roots
    for y in range(26, 46):
        for x in range(12, 20):
            c = TRUNK['base'] if x < 17 else TRUNK['shadow']
            if x == 12: c = TRUNK['light']
            p[x, y] = c + (255,)
    for x in range(9, 23):
        for y in range(42, 46):
            if ((x - 15.5) / 7) ** 2 + ((y - 45) / 3.5) ** 2 <= 1:
                p[x, y] = (TRUNK['shadow'] if x > 16 else TRUNK['base']) + (255,)
    # canopy blobs
    blobs = [(16, 17, 14, 12), (8, 21, 8, 8), (24, 21, 8, 8), (16, 9, 9, 7), (11, 13, 7, 6), (21, 12, 7, 6)]
    def inside(x, y):
        return any(((x + 0.5 - cx - (sw if y < 18 else 0)) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 for cx, cy, rx, ry in blobs)
    for y in range(0, 32):
        for x in range(W_):
            if inside(x, y):
                c = LEAF['base']
                if y > 24 or (x > 24 and y > 14): c = LEAF['shadow']
                if y < 12 and x < 20 and ((x * 5 + y * 3) % 7 != 0): c = LEAF['light']
                if y < 7 and 10 < x < 18: c = LEAF['bright']
                # leafy texture
                if (x * 3 + y * 5) % 13 == 0: c = shift(c, -0.06)
                p[x, y] = c + (255,)
    # outline
    q = img.copy().load()
    for y in range(H_):
        for x in range(W_):
            if q[x, y][3] == 0 and any(0 <= x + dx < W_ and 0 <= y + dy < H_ and q[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                p[x, y] = (LEAF['outline'] if y < 30 else TRUNK['outline']) + (255,)
    # trunk tiles sit on grass
    tl = grass_tile(31); tr = grass_tile(32)
    tl.alpha_composite(img.crop((0, 32, 16, 48))); tr.alpha_composite(img.crop((16, 32, 32, 48)))
    return {'tl': img.crop((0, 0, 16, 16)), 'tr': img.crop((16, 0, 32, 16)),
            'bl': img.crop((0, 16, 16, 32)), 'br': img.crop((16, 16, 32, 32)), 'trunk_l': tl, 'trunk_r': tr}

def anim(frames_ids, durations):
    return [{'tileid': t, 'duration': d} for t, d in zip(frames_ids, durations)]

# register decor/object tiles
G = {}
G['grass'] = TS.add('grass', grass_tile(0))
G['grass1'] = TS.add('grass1', grass_tile(1, 1))
G['grass2'] = TS.add('grass2', grass_tile(2, 2))
def tinted_grass(dl, seed):
    img = grass_tile(seed); p = img.load()
    for y in range(T):
        for x in range(T):
            p[x, y] = shift(p[x, y][:3], dl) + (255,)
    return img
G['grass_light'] = TS.add('grass_light', tinted_grass(0.012, 3))
G['grass_dark'] = TS.add('grass_dark', tinted_grass(-0.012, 4))
tuft_ids = [TS.add(f'tuft{i}', tuft(s, 40)) for i, s in enumerate([0, 1, -1])]
TS.meta[tuft_ids[0]] = {'properties': [prop('desync', True)],
                        'animation': anim([tuft_ids[0], tuft_ids[1], tuft_ids[0], tuft_ids[2]], [600, 400, 600, 400])}
G['tuft'] = tuft_ids[0]
flower_ids = {}
for v in range(3):
    ids = [TS.add(f'flowers{v}_{i}', flowers(v, s)) for i, s in enumerate([0, 1, -1])]
    TS.meta[ids[0]] = {'properties': [prop('desync', True)],
                       'animation': anim([ids[0], ids[1], ids[0], ids[2]], [700, 450, 700, 450])}
    flower_ids[v] = ids[0]
tall_ids = [TS.add(f'tall{i}', tall_grass(l)) for i, l in enumerate([0, 1, -1])]
tall_flat = [TS.add('tall_flat0', tall_grass(0, True)), TS.add('tall_flat1', tall_grass(1))]
TS.meta[tall_ids[0]] = {
    'properties': [prop('desync', True), prop('stepEffect', 'leaves'),
                   prop('stepAnimation', json.dumps(anim([tall_flat[0], tall_flat[1], tall_ids[1], tall_ids[0]], [220, 160, 120, 1])))],
    'animation': anim([tall_ids[0], tall_ids[1], tall_ids[0], tall_ids[2]], [500, 380, 500, 380])}
G['tall'] = tall_ids[0]
G['rock'] = TS.add('rock', rock(), [prop('collides', True)])
bush_ids = [TS.add('bush', bush(0)), TS.add('bush_l', bush(-1)), TS.add('bush_r', bush(1))]
TS.meta[bush_ids[0]] = {'properties': [prop('collides', True), prop('bumpEffect', 'leaves'),
                                       prop('rustleAnimation', json.dumps(anim([bush_ids[1], bush_ids[2], bush_ids[1], bush_ids[2], bush_ids[0]], [70, 70, 70, 70, 1])))]}
G['bush'] = bush_ids[0]
th_ids = [TS.add(f'thistle{i}', thistle(s)) for i, s in enumerate([0, 1, -1])]
TS.meta[th_ids[0]] = {'properties': [prop('collides', True), prop('desync', True), prop('bumpEffect', 'leaves')],
                      'animation': anim([th_ids[0], th_ids[1], th_ids[0], th_ids[2]], [700, 450, 700, 450])}
G['thistle'] = th_ids[0]
G['mushrooms'] = TS.add('mushrooms', mushrooms())
G['stump'] = TS.add('stump', stump(), [prop('collides', True)])
G['log'] = TS.add('log', log(), [prop('collides', True)])
for k in ('h', 'v', 'hl', 'hr', 'vt', 'vb'):
    G[f'fence_{k}'] = TS.add(f'fence_{k}', fence(k), [prop('collides', True)])
for part in ('l', 'm', 'r'):
    G[f'bridge_{part}'] = TS.add(f'bridge_{part}', bridge(part), [prop('walkable', True)])
BRIDGE_GIDS = {G['bridge_l'] + 1, G['bridge_m'] + 1, G['bridge_r'] + 1}
for st in range(3):
    G[f'crop{st}'] = TS.add(f'crop{st}', crop(st))
lily_ids = [TS.add(f'lily{f}', lily(f), [prop('collides', True), prop('bumpEffect', 'splash')]) for f in range(4)]
TS.meta[lily_ids[0]]['properties'].append(prop('desync', True))
TS.meta[lily_ids[0]]['animation'] = anim(lily_ids, [300, 300, 300, 300])
G['lily'] = lily_ids[0]
tree_frames = [tree_images(f) for f in range(2)]
tree = {}
for part in ('tl', 'tr', 'bl', 'br'):
    ids = [TS.add(f'tree_{part}{f}', tree_frames[f][part]) for f in range(2)]
    TS.meta[ids[0]] = {'animation': anim(ids, [1100, 800])}
    tree[part] = ids[0]
tree['trunk_l'] = TS.add('tree_trunk_l', tree_frames[0]['trunk_l'], [prop('collides', True)])
tree['trunk_r'] = TS.add('tree_trunk_r', tree_frames[0]['trunk_r'], [prop('collides', True)])

# ------------------------------------------------------------------ map
MW, MH = 80, 56
material = [[None] * MW for _ in range(MH)]   # 'dirt' | 'cobble' | 'soil' | 'water' | None (grass)
decor = [[0] * MW for _ in range(MH)]
objects = [[0] * MW for _ in range(MH)]
above = [[0] * MW for _ in range(MH)]
collision = [[0] * MW for _ in range(MH)]
occupied = [[False] * MW for _ in range(MH)]   # anything that should keep other placements away

def inb(x, y): return 0 <= x < MW and 0 <= y < MH

def paint(kind, cells):
    for x, y in cells:
        if inb(x, y): material[y][x] = kind

def disk(cx, cy, rx, ry):
    return [(x, y) for y in range(MH) for x in range(MW) if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1]

def thick_line(points, width):
    cells = set()
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        steps = max(abs(x1 - x0), abs(y1 - y0)) * 2 + 1
        for i in range(steps + 1):
            t = i / steps
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            wi = math.ceil(width)
            for dy in range(-wi, wi + 1):
                for dx in range(-wi, wi + 1):
                    if dx * dx + dy * dy <= width * width + 0.5:
                        cells.add((round(x + dx), round(y + dy)))
    return cells

# paths
paint('dirt', thick_line([(40, 2), (40, 54)], 1))
paint('dirt', thick_line([(2, 22), (78, 22)], 1))
paint('dirt', thick_line([(40, 22), (50, 20), (57, 16), (62, 17)], 1.4))   # to the pond
paint('dirt', thick_line([(40, 30), (32, 32), (24, 34), (14, 36), (14, 42)], 1.4))   # to the farm
# plaza
paint('cobble', disk(40, 22, 6, 5))
# farm plot (soil) bottom-left
for y in range(44, 51):
    for x in range(8, 22):
        material[y][x] = 'soil'
# river (painted last: water wins over paths), winding left to right
river_pts = [(0, 40), (10, 41), (20, 39), (30, 38), (40, 39), (50, 41), (60, 40), (70, 38), (80, 37)]
paint('water', thick_line(river_pts, 2))
# pond top-right
paint('water', disk(64, 10, 7, 4.5))
# bridge: where the N-S path crosses the river, replace water by bridge planks
for y in range(MH):
    for x, part in ((39, 'l'), (40, 'm'), (41, 'r')):
        if material[y][x] == 'water' and 34 <= y <= 46:
            material[y][x] = None
            objects[y][x] = G[f'bridge_{part}'] + 1
            occupied[y][x] = True
# remove dirt where water is (river wins), except at the bridge
for y in range(MH):
    for x in range(MW):
        if material[y][x] == 'dirt' and any(material[yy][xx] == 'water' for xx, yy in ((x, y),)):
            pass

# occupancy for materials
for y in range(MH):
    for x in range(MW):
        if material[y][x]:
            occupied[y][x] = True

HARD = ('dirt', 'cobble', 'soil')  # ground materials that join seamlessly with each other

def mask_at(kind, x, y):
    def is_k(xx, yy):
        if not inb(xx, yy):
            return True
        other = material[yy][xx]
        if kind == 'water':
            return other == 'water' or objects[yy][xx] in BRIDGE_GIDS
        return other == kind or (kind in HARD and other in HARD)
    m = 0
    for bit, (dx, dy) in ((N, (0, -1)), (E, (1, 0)), (S, (0, 1)), (W, (-1, 0)), (NE, (1, -1)), (SE, (1, 1)), (SW, (-1, 1)), (NW, (-1, -1))):
        if is_k(x + dx, y + dy):
            m |= bit
    return m

ground = [[0] * MW for _ in range(MH)]
for y in range(MH):
    for x in range(MW):
        k = material[y][x]
        if k:
            ground[y][x] = material_gid(k, mask_at(k, x, y)) + 1
        else:
            # low-frequency patches of lighter / darker grass, plus a few tufty tiles
            n = math.sin(x * 0.21 + 1.3) * math.cos(y * 0.17 - 0.4) + math.sin((x + y) * 0.09) * 0.6
            r = rng.random()
            if n > 0.55:
                tile = G['grass_light']
            elif n < -0.6:
                tile = G['grass_dark']
            else:
                tile = G['grass1'] if r < .25 else (G['grass2'] if r < .4 else G['grass'])
            ground[y][x] = tile + 1
# water under the bridge (so the planks sit on water visually)
for y in range(MH):
    for x in range(MW):
        if objects[y][x] in BRIDGE_GIDS:
            ground[y][x] = material_gid('water', mask_at('water', x, y)) + 1

def free(x, y, w=1, h=1):
    return all(inb(x + dx, y + dy) and not occupied[y + dy][x + dx] for dy in range(h) for dx in range(w))

def place_tree(x, y):
    """x,y = top-left of the 2x3 footprint (canopy 2x2 above, trunk row collides)."""
    if not (inb(x, y) and inb(x + 1, y + 2)):
        return False
    if not free(x, y + 2, 2, 1):
        return False
    above[y][x], above[y][x + 1] = tree['tl'] + 1, tree['tr'] + 1
    above[y + 1][x], above[y + 1][x + 1] = tree['bl'] + 1, tree['br'] + 1
    objects[y + 2][x], objects[y + 2][x + 1] = tree['trunk_l'] + 1, tree['trunk_r'] + 1
    for dy in range(3):
        for dx in range(2):
            if inb(x + dx, y + dy):
                occupied[y + dy][x + dx] = True
    return True

# forest border: 2-3 tiles deep, dense, plus hard collision ring
for y in range(MH):
    for x in range(MW):
        if x < 2 or x >= MW - 2 or y < 3 or y >= MH - 2:
            collision[y][x] = 1
for x in range(-1, MW, 2):
    place_tree(x, -1 + rng.randrange(0, 2)); place_tree(x + rng.randrange(0, 2), MH - 3)
for y in range(1, MH - 3, 2):
    place_tree(0, y - 1 + rng.randrange(0, 2)); place_tree(MW - 2, y + rng.randrange(0, 2) - 1)
# inner forest clumps
for cx, cy, n in ((12, 10, 9), (68, 30, 8), (22, 50, 6), (60, 50, 7), (8, 28, 6), (70, 46, 5)):
    for _ in range(n):
        place_tree(cx + rng.randrange(-5, 6), cy + rng.randrange(-4, 5))
# scattered trees
for _ in range(30):
    place_tree(rng.randrange(3, MW - 4), rng.randrange(3, MH - 5))

def put_obj(x, y, gid):
    if free(x, y):
        objects[y][x] = gid + 1; occupied[y][x] = True; return True
    return False

def put_decor(x, y, gid):
    if inb(x, y) and not occupied[y][x] and material[y][x] is None and decor[y][x] == 0:
        decor[y][x] = gid + 1; return True
    return False

# farm fence + crops
for x in range(7, 23):
    if x != 14:
        put_obj(x, 43, G['fence_h']); put_obj(x, 51, G['fence_h'])
for y in range(44, 51):
    put_obj(7, y, G['fence_v']); put_obj(22, y, G['fence_v'])
for y in range(44, 51):
    for x in range(8, 22):
        if (x - 8) % 3 != 2:
            decor[y][x] = G[f'crop{rng.randrange(3)}'] + 1
# pond fence + lilies
for x in range(56, 73):
    if x not in (62, 63):
        put_obj(x, 16, G['fence_h'])
for _ in range(10):
    x, y = 64 + rng.randrange(-6, 7), 10 + rng.randrange(-3, 4)
    if material[y][x] == 'water' and mask_at('water', x, y) == 0xFF:
        ground[y][x] = G['lily'] + 1
# stone-free plaza: ring of thistles & bushes around it
for i in range(10):
    a = i / 10 * math.tau
    x, y = round(40 + math.cos(a) * 8), round(22 + math.sin(a) * 6.5)
    put_obj(x, y, G['bush'] if i % 2 else G['thistle'])
# tall grass patches
for cx, cy, rx, ry in ((24, 12, 6, 3), (58, 30, 5, 3), (30, 46, 5, 2.5), (70, 22, 4, 3), (16, 36, 4, 2)):
    for x, y in disk(cx, cy, rx, ry):
        if rng.random() < .96: put_decor(x, y, G['tall'])
# flower meadows
for cx, cy, rx, ry in ((54, 44, 7, 4), (14, 18, 6, 4), (48, 8, 5, 3), (28, 28, 4, 3)):
    for x, y in disk(cx, cy, rx, ry):
        if rng.random() < .55: put_decor(x, y, flower_ids[rng.randrange(3)])
# sprinkle tufts, flowers, mushrooms, rocks, stumps, logs
for _ in range(500):
    put_decor(rng.randrange(MW), rng.randrange(MH), G['tuft'])
for _ in range(120):
    put_decor(rng.randrange(MW), rng.randrange(MH), flower_ids[rng.randrange(3)])
for _ in range(25):
    put_decor(rng.randrange(MW), rng.randrange(MH), G['mushrooms'])
for gid, n in ((G['rock'], 18), (G['stump'], 10), (G['log'], 8), (G['bush'], 25), (G['thistle'], 12)):
    for _ in range(n):
        x, y = rng.randrange(3, MW - 3), rng.randrange(4, MH - 3)
        if material[y][x] is None:
            put_obj(x, y, gid)

# keep paths clear: no objects on dirt/cobble, no decor on them either
for y in range(MH):
    for x in range(MW):
        if material[y][x] in ('dirt', 'cobble'):
            if objects[y][x] and objects[y][x] not in BRIDGE_GIDS: objects[y][x] = 0
            decor[y][x] = 0

# ------------------------------------------------------------------ write files
flat = lambda g: [v for row in g for v in row]
lid = iter(range(1, 100))
def tile_layer(name, grid, props=None, visible=True):
    layer = {'id': next(lid), 'name': name, 'type': 'tilelayer', 'width': MW, 'height': MH,
             'x': 0, 'y': 0, 'opacity': 1, 'visible': visible, 'data': flat(grid)}
    if props: layer['properties'] = props
    return layer

sheet = TS.image()
tiles_json = [{'id': tid, **m} for tid, m in sorted(TS.meta.items())]
the_map = {
    'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal',
    'renderorder': 'right-down', 'infinite': False, 'width': MW, 'height': MH, 'tilewidth': T, 'tileheight': T,
    'nextlayerid': 8, 'nextobjectid': 2,
    'properties': [prop('displayName', 'Thistlevane Meadow (test map)')],
    'tilesets': [{'firstgid': 1, 'name': 'meadow', 'image': '../tilesets/meadow.png',
                  'imagewidth': sheet.width, 'imageheight': sheet.height, 'tilewidth': T, 'tileheight': T,
                  'tilecount': len(TS.tiles), 'columns': COLS, 'margin': 0, 'spacing': 0, 'tiles': tiles_json}],
    'layers': [
        tile_layer('ground', ground),
        tile_layer('decor', decor),
        tile_layer('objects', objects),
        tile_layer('above', above, [prop('aboveCharacters', True)]),
        tile_layer('collision', [[G['rock'] + 1 if v else 0 for v in row] for row in collision], visible=False),
        {'id': next(lid), 'name': 'spawns', 'type': 'objectgroup', 'draworder': 'topdown', 'x': 0, 'y': 0,
         'opacity': 1, 'visible': True, 'objects': [
             {'id': 1, 'name': 'plaza', 'type': 'player_spawn', 'point': True, 'x': 40 * T + 8, 'y': 22 * T + 8,
              'width': 0, 'height': 0, 'rotation': 0, 'visible': True}]},
    ],
}
os.makedirs(os.path.join(ROOT, 'assets', 'tilesets'), exist_ok=True)
sheet.save(os.path.join(ROOT, 'assets', 'tilesets', 'meadow.png'))
with open(os.path.join(ROOT, 'assets', 'maps', 'meadow.json'), 'w') as fh:
    json.dump(the_map, fh, separators=(',', ':'))
print(f'tileset {len(TS.tiles)} tiles ({sheet.width}x{sheet.height}), map {MW}x{MH}')
