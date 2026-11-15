"""
Generates PLACEHOLDER one-shot visual effects and their definitions.

Outputs:
  assets/effects/effects.png     16x16 frames, one row per effect
  assets/data/effects.json       effect definitions read by the client

Usage:  python tools/art/effects.py     (needs Pillow)
"""
import json
import math
import os
import random
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
S = 16
EFFECTS = {
    # id: (frames, frameRate, anchor y, depth hint)
    'dust-small': (4, 14, 1.0, 'below'),
    'dust-large': (5, 16, 1.0, 'below'),
    'leaves': (6, 14, 0.75, 'above'),
    'splash': (6, 16, 0.75, 'above'),
}
MAX_FRAMES = max(v[0] for v in EFFECTS.values())
img = Image.new('RGBA', (S * MAX_FRAMES, S * len(EFFECTS)), (0, 0, 0, 0))
P = img.load()

def dot(row, frame, x, y, c):
    x, y = round(x), round(y)
    if 0 <= x < S and 0 <= y < S:
        P[frame * S + x, row * S + y] = c

def puff(row, frames, size):
    r = random.Random(row)
    blobs = [(r.uniform(-1, 1), r.uniform(-0.3, 0.2)) for _ in range(5 if size > 1 else 3)]
    for f in range(frames):
        t = f / (frames - 1)
        rad = (1.2 + 2.2 * t) * size
        alpha = round(200 * (1 - t) + 30)
        for (bx, by) in blobs:
            cx = 8 + bx * (2 + 4 * t) * size
            cy = 13 + by * 3 - 2.5 * t * size
            for y in range(S):
                for x in range(S):
                    if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                        light = y < cy
                        dot(row, f, x, y, (232, 214, 182, alpha) if light else (196, 174, 140, alpha))

def leaves(row, frames):
    r = random.Random(7)
    parts = [(r.uniform(4, 12), r.uniform(9, 13), r.uniform(-2.5, 2.5), r.uniform(-5, -2.5)) for _ in range(6)]
    for f in range(frames):
        t = f / (frames - 1)
        for i, (x, y, vx, vy) in enumerate(parts):
            px_ = x + vx * t * 2
            py_ = y + vy * t * 2 + 6 * t * t
            c = (186, 228, 120, 255) if i % 2 else (232, 214, 120, 255)
            if t > 0.7:
                c = c[:3] + (150,)
            dot(row, f, px_, py_, c)
            dot(row, f, px_ + (1 if i % 2 else 0), py_ + (0 if i % 2 else 1), c)

def splash(row, frames):
    for f in range(frames):
        t = f / (frames - 1)
        rad = 2 + 5 * t
        for a in range(0, 360, 20):
            x = 8 + math.cos(math.radians(a)) * rad
            y = 11 + math.sin(math.radians(a)) * rad * 0.45
            dot(row, f, x, y, (196, 228, 247, round(255 * (1 - t))))
        for k, dx in enumerate((-3, 0, 3)):
            h = 6 * math.sin(math.pi * min(1, t * 1.4))
            dot(row, f, 8 + dx * (1 + t), 11 - h - (k == 1) * 2, (232, 246, 255, 255 if t < .8 else 120))

defs = {}
for row, (eid, (frames, rate, anchor_y, layer)) in enumerate(EFFECTS.items()):
    if eid.startswith('dust'):
        puff(row, frames, 1 if eid == 'dust-small' else 1.5)
    elif eid == 'leaves':
        leaves(row, frames)
    else:
        splash(row, frames)
    defs[eid] = {
        'sheet': 'effects/effects.png',
        'frameWidth': S,
        'frameHeight': S,
        'startFrame': row * MAX_FRAMES,
        'frames': frames,
        'frameRate': rate,
        'anchor': {'x': 0.5, 'y': anchor_y},
        'layer': layer,
    }

os.makedirs(os.path.join(ROOT, 'assets', 'effects'), exist_ok=True)
img.save(os.path.join(ROOT, 'assets', 'effects', 'effects.png'))
with open(os.path.join(ROOT, 'assets', 'data', 'effects.json'), 'w') as fh:
    json.dump({'effects': defs}, fh, indent=2)
    fh.write('\n')
print(f'wrote {len(defs)} effects')
