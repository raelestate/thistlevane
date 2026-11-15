"""
Procedural generator for Thistlevane's PLACEHOLDER character spritesheets (v2).

Chibi proportions (head ≈ half the height), hue-shifted 4-tone ramps, per-material
outlines, 8-frame walk/run cycles with hair bounce, idle breathing + blink.

Output per character: assets/characters/<id>.png
  frame 24x32, rows: down, left, right, up
  columns: 0-5 idle (6), 6-13 walk (8), 14-21 run (8)
The layout is written to assets/data/characters.json, so the game never assumes it.

Usage:  python tools/art/characters.py            (needs Pillow)
"""
import json
import os
from PIL import Image
from pix import Canvas, ramp, rgb, shift

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'assets', 'characters')
DATA_FILE = os.path.join(ROOT, 'assets', 'data', 'characters.json')

FW, FH = 24, 32
ROWS = ['down', 'left', 'right', 'up']
ANIMS = {'idle': (0, 6, 5), 'walk': (6, 8, 14), 'run': (14, 8, 20)}  # name -> (first col, frames, fps)

CHARACTERS = [
    dict(id='rowan', name='Rowan', title='Thistle Wayfarer',
         skin='f3c9a4', hair='c9552c', hairStyle='spiky', eyes='3d4a7a',
         top='4e8f52', trim='e9c46a', sleeves='4e8f52', pants='5c4634', boots='3d2b22', scarf='8a5bbd'),
    dict(id='lilac', name='Lilac', title='Hedge Mage',
         skin='f6d7bb', hair='a68ae0', hairStyle='bob', eyes='5a3f8f',
         top='2e8c86', trim='f2e4bf', sleeves='2e8c86', pants='2e8c86', boots='5b4030', skirt=True, hat=True),
    dict(id='pip', name='Pip', title='Cat-folk Courier',
         skin='f8dfc6', hair='e6943d', hairStyle='tufty', eyes='2f6b3f',
         top='c8a16a', trim='7a4f2a', sleeves='c8a16a', pants='4c6a9c', boots='3b2b24', scarf='4a86c8',
         ears='cat', earInner='f3b1a9', tail=True),
    dict(id='ash', name='Ash', title='Lantern Scholar',
         skin='efcaa5', hair='e1e4ec', hairStyle='long', eyes='8a3f4a',
         top='6c3f72', trim='e4ba5c', sleeves='6c3f72', pants='3a3448', boots='2d2634', coat=True),
]

# --------------------------------------------------------------------------- poses
def pose(anim, i):
    """Body offsets per frame. stride: front/back leg x offsets (side view) or lifts (front view)."""
    if anim == 'idle':
        breath = [0, 0, 1, 1, 1, 0][i]
        return dict(bob=breath, hairBob=0, legA=0, legB=0, strideA=0, strideB=0, armA=0, armB=0, lean=0,
                    blink=(i == 4), squash=breath)
    if anim == 'walk':
        s = [3, 2, 0, -2, -3, -2, 0, 2][i]          # leg A horizontal offset (side view)
        la = [0, 1, 2, 1, 0, 0, 0, 0][i]            # leg A lift
        lb = [0, 0, 0, 0, 0, 1, 2, 1][i]
        bob = [0, -1, -1, 0, 0, -1, -1, 0][i]
        return dict(bob=bob, hairBob=[0, 0, -1, 0, 0, 0, -1, 0][i], legA=la, legB=lb, strideA=s, strideB=-s,
                    armA=-s // 2, armB=s // 2, lean=0, blink=False, squash=0)
    s = [4, 3, 0, -3, -4, -3, 0, 3][i]
    la = [0, 1, 3, 1, 0, 0, 1, 0][i]
    lb = [0, 0, 1, 0, 0, 1, 3, 1][i]
    bob = [0, -1, -2, -1, 0, -1, -2, -1][i]
    return dict(bob=bob, hairBob=[0, -1, -1, 0, 0, -1, -1, 0][i], legA=la, legB=lb, strideA=s, strideB=-s,
                armA=-s // 2, armB=s // 2, lean=1, blink=False, squash=0)


# --------------------------------------------------------------------------- drawing
class CharacterArtist:
    def __init__(self, ch):
        self.ch = ch
        self.r = {k: ramp(ch[k]) for k in ('skin', 'hair', 'top', 'trim', 'sleeves', 'pants', 'boots')}
        if ch.get('scarf'):
            self.r['scarf'] = ramp(ch['scarf'])
        self.eye = rgb(ch['eyes'])
        self.outlines = {k: v['outline'] for k, v in self.r.items()}
        self.outlines['shadow'] = (0, 0, 0)

    # ---- helpers
    def shaded_box(self, c, x0, y0, x1, y1, r, mat, light='left'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                col = r['base']
                if y == y1:
                    col = r['shadow']
                elif (x == x0 and light == 'left') or (x == x1 and light == 'right'):
                    col = r['light']
                elif (x == x1 and light == 'left') or (x == x0 and light == 'right'):
                    col = r['shadow']
                elif y == y0:
                    col = r['light']
                c.put(x, y, col, mat)

    # ---- parts
    def shadow(self, c):
        c.fill(c.ellipse(12, 30.5, 6, 1.6), (20, 14, 30), 'shadow')

    def legs(self, c, view, p):
        pants, boots = self.r['pants'], self.r['boots']
        if view in ('down', 'up'):
            for x0, lift in ((8, p['legA']), (13, p['legB'])):
                top = 22 + p['squash']
                bottom = 29 - lift
                self.shaded_box(c, x0, top, x0 + 2, bottom - 2, pants, 'pants')
                self.shaded_box(c, x0, bottom - 1, x0 + 2, bottom, boots, 'boots')
                c.put(x0 + 1, bottom - 1, boots['light'], 'boots')
        else:
            # Side view: leg B is the far leg (darker), A the near leg.
            for x0, lift, stride, far in ((11, p['legB'], p['strideB'], True), (11, p['legA'], p['strideA'], False)):
                x = x0 + stride
                bottom = 29 - lift
                pr = {k: (shift(v, -0.08) if far else v) for k, v in pants.items()}
                br = {k: (shift(v, -0.08) if far else v) for k, v in boots.items()}
                # thigh stays under the hip, shin angles toward the foot
                for y in range(22, bottom - 1):
                    t = (y - 22) / max(1, bottom - 23)
                    xx = round(11 + stride * t)
                    c.rect(xx, y, xx + 2, y, pr['base'] if y > 22 else pr['light'], 'pants')
                    c.put(xx + 2, y, pr['shadow'], 'pants')
                c.rect(x - 1, bottom - 1, x + 2, bottom, br['base'], 'boots')
                c.put(x + 2, bottom, br['shadow'], 'boots')
                c.put(x - 1, bottom - 1, br['light'], 'boots')

    def torso(self, c, view, p):
        top, trim = self.r['top'], self.r['trim']
        b = p['bob']
        y0, y1 = 14 + b + p['squash'], 22 + p['squash']
        if view in ('down', 'up'):
            self.shaded_box(c, 6, y0, 17, y1, top, 'top')
            if self.ch.get('skirt'):
                self.shaded_box(c, 5, 20, 18, 25, top, 'top')
                for x in range(5, 19):
                    c.put(x, 25, trim['base'] if x % 2 else trim['light'], 'trim')
            if self.ch.get('coat'):
                self.shaded_box(c, 5, 20, 18, 27, top, 'top')
                c.rect(11, 20, 12, 27, top['shadow'], 'top')
            c.rect(6, 21, 17, 21, trim['shadow'], 'trim')
            c.put(11, 21, trim['light'], 'trim'); c.put(12, 21, trim['light'], 'trim')
            if view == 'down':
                c.rect(11, y0, 12, y0 + 1, self.r['skin']['base'], 'skin')  # collar opening
                c.put(10, y0, trim['base'], 'trim'); c.put(13, y0, trim['base'], 'trim')
                c.put(9, y0 + 4, top['light'], 'top'); c.put(9, y0 + 5, top['light'], 'top')  # fold highlight
            else:
                c.rect(11, y0 + 1, 12, y1 - 1, top['shadow'], 'top')  # back seam
        else:
            lean = p['lean'] if view == 'right' else -p['lean']
            x0 = 8 + lean
            self.shaded_box(c, x0, y0, x0 + 7, y1, top, 'top', light='left' if view == 'left' else 'right')
            if self.ch.get('skirt') or self.ch.get('coat'):
                self.shaded_box(c, x0 - 1, 20, x0 + 8, 25 if self.ch.get('skirt') else 27, top, 'top',
                                light='left' if view == 'left' else 'right')
            c.rect(x0, 21, x0 + 7, 21, trim['shadow'], 'trim')

    def arm(self, c, view, p, front):
        sl, skin = self.r['sleeves'], self.r['skin']
        b = p['bob'] + p['squash']
        if view in ('down', 'up'):
            if not front:
                return
            for x, swing in ((4, p['armA']), (18, p['armB'])):
                ys, ye = 15 + b + max(0, swing), 20 + b + swing // 2
                self.shaded_box(c, x, ys, x + 1, ye, sl, 'sleeves')
                c.rect(x, ye + 1, x + 1, ye + 2, skin['base'], 'skin')
                c.put(x + 1, ye + 2, skin['shadow'], 'skin')
        else:
            sign = -1 if view == 'left' else 1
            swing = p['armA'] if front else p['armB']
            cx = 11 + sign * p['lean'] + sign * swing
            dark = -0.1 if not front else 0
            for y in range(15 + b, 20 + b):
                c.rect(cx, y, cx + 1, y, shift(sl['base'] if y > 15 + b else sl['light'], dark), 'sleeves')
            c.rect(cx, 20 + b, cx + 1, 21 + b, shift(skin['base'], dark), 'skin')

    def scarf(self, c, view, p):
        if 'scarf' not in self.r:
            return
        s = self.r['scarf']
        b = p['bob'] + p['squash']
        if view == 'down':
            c.rect(6, 14 + b, 17, 15 + b, s['base'], 'scarf'); c.rect(6, 15 + b, 17, 15 + b, s['shadow'], 'scarf')
            c.rect(13, 16 + b, 14, 19 + b, s['base'], 'scarf'); c.put(14, 19 + b, s['shadow'], 'scarf')
            c.put(13, 16 + b, s['light'], 'scarf')
        elif view == 'up':
            c.rect(6, 14 + b, 17, 15 + b, s['base'], 'scarf')
            tail = p['armA']
            c.rect(10 + tail // 2, 16 + b, 12 + tail // 2, 21 + b, s['shadow'], 'scarf')
            c.put(11 + tail // 2, 16 + b, s['base'], 'scarf')
        else:
            sign = -1 if view == 'left' else 1
            c.rect(8, 14 + b, 15, 15 + b, s['base'], 'scarf')
            flutter = 2 + abs(p['strideA']) // 2
            tx = 16 if view == 'left' else 7
            for i in range(flutter):
                c.put(tx - sign * i * -1 if False else tx + (i if view == 'left' else -i), 15 + b + (i % 2),
                      s['shadow'] if i % 2 else s['base'], 'scarf')

    def tail(self, c, view, p):
        if not self.ch.get('tail'):
            return
        h = self.r['hair']
        wag = [0, 1, 1, 0, -1, -1, 0, 0][(p['strideA'] + 4) % 8]
        if view == 'up':
            pts = [(12, 24), (13, 25), (14, 25), (15, 24 + wag), (16, 23 + wag), (16, 22 + wag), (16, 21 + wag)]
        elif view == 'left':
            pts = [(16, 23), (17, 22), (18, 21 + wag), (19, 20 + wag), (19, 19 + wag), (19, 18 + wag)]
        elif view == 'right':
            pts = [(7, 23), (6, 22), (5, 21 + wag), (4, 20 + wag), (4, 19 + wag), (4, 18 + wag)]
        else:
            pts = [(17, 24), (18, 23 + wag), (19, 22 + wag), (19, 21 + wag)]
        for i, (x, y) in enumerate(pts):
            c.put(x, y, h['light'] if i >= len(pts) - 2 else h['base'], 'hair')
            c.put(x + (1 if view != 'right' else -1), y, h['shadow'], 'hair')

    def head(self, c, view, p):
        skin, hair = self.r['skin'], self.r['hair']
        b = p['bob']
        hb = b + p['hairBob']
        lean = (p['lean'] if view == 'right' else -p['lean']) if view in ('left', 'right') else 0
        cx, top = 12 + lean, 1 + b
        head = c.ellipse(cx, top + 7.5, 7.6, 7.5)
        minx, maxx = min(x for x, _ in head), max(x for x, _ in head)
        style = self.ch['hairStyle']

        # beast ears (behind hair)
        if self.ch.get('ears') == 'cat':
            inner = rgb(self.ch['earInner'])
            show_l, show_r = view != 'right', view != 'left'
            for r_ in range(5):
                y = top - 3 + r_ + p['hairBob']
                for k in range(r_ + 1):
                    if show_l: c.put(minx + 1 + k, y, hair['light'] if k == 0 else hair['base'], 'hair')
                    if show_r: c.put(maxx - 1 - k, y, hair['shadow'] if k == 0 else hair['base'], 'hair')
            if view != 'up':
                for y in (top - 1 + p['hairBob'], top + p['hairBob']):
                    if show_l: c.put(minx + 2, y, inner, 'hair')
                    if show_r: c.put(maxx - 2, y, inner, 'hair')

        # face
        for (x, y) in head:
            col = skin['base']
            if (x, y + 1) not in set(head) or y >= top + 13:
                col = skin['shadow']
            elif y <= top + 2 and x < cx:
                col = skin['light']
            c.put(x, y, col, 'skin')

        # hair mask
        hs = {'spiky': dict(bangs=[6, 7, 5, 7, 8, 6, 7, 5, 7, 8, 6, 7, 5, 7, 6, 6], side=10, back=0, spikes=True),
              'bob':   dict(bangs=[10, 9, 7, 6, 6, 7, 6, 5, 6, 7, 6, 6, 7, 9, 10, 10], side=14, back=0),
              'tufty': dict(bangs=[7, 7, 6, 7, 8, 6, 7, 7, 6, 8, 7, 6, 7, 7, 7, 7], side=11, back=0),
              'long':  dict(bangs=[11, 10, 8, 7, 6, 6, 7, 6, 6, 6, 7, 8, 10, 11, 11, 11], side=16, back=6)}[style]
        hair_pix = set()
        hy = p['hairBob']
        if view == 'up':
            hair_pix = {(x, y) for (x, y) in head}
            for y in range(top + 13, top + 14 + hs['back']):
                for x in range(minx + 1, maxx):
                    hair_pix.add((x, y))
        elif view == 'down':
            for (x, y) in head:
                i = min(15, max(0, x - minx))
                if y < top + hs['bangs'][i] or ((x <= minx + 1 or x >= maxx - 1) and y < top + hs['side']):
                    hair_pix.add((x, y))
            for y in range(top + 13, top + 13 + hs['back']):
                for x in (minx, minx + 1, maxx - 1, maxx):
                    hair_pix.add((x, y))
        else:
            front_left = view == 'left'
            for (x, y) in head:
                rel = (x - minx) if front_left else (maxx - x)  # 0 = front edge of face
                fringe = [5, 5, 6, 5, 5, 4][rel] if rel < 6 else 99
                if rel >= 9 or y < top + 4 or (rel < 6 and y < top + fringe):
                    hair_pix.add((x, y))
            for y in range(top + 13, top + 13 + hs['back']):
                rng_ = range(minx + 9, maxx + 1) if front_left else range(minx, maxx - 8)
                for x in rng_:
                    hair_pix.add((x, y))
        if hs.get('spikes'):
            for i, x in enumerate(range(minx + 2, maxx - 1, 3)):
                hair_pix.add((x, top - 1)); hair_pix.add((x + 1, top - 1 - (i % 2))); hair_pix.add((x + 1, top - 1))
        hair_pix = {(x, y + hy) for (x, y) in hair_pix}
        # hair shading: light band near the top, shadow at the bottom edge and against the face
        for (x, y) in hair_pix:
            col = hair['base']
            below = (x, y + 1) not in hair_pix
            if below:
                col = hair['shadow']
            elif (y - top - hy) in (1, 2) and (x + y) % 4 != 0:
                col = hair['light']
            elif (y - top - hy) == 1 and x in (cx - 2, cx - 1):
                col = hair['bright']
            c.put(x, y, col, 'hair')

        if self.ch.get('hat'):  # soft pointed hat
            t = self.r['top']
            for y in range(top - 6 + hy, top + 2 + hy):
                half = max(1, (y - (top - 6 + hy)) * 1.1)
                for x in range(round(cx - half) - 1, round(cx + half) + 2):
                    c.put(x, y, t['light'] if x < cx - 1 else (t['shadow'] if x > cx + 1 else t['base']), 'top')
            c.rect(minx - 1, top + 2 + hy, maxx + 1, top + 3 + hy, t['base'], 'top')
            c.rect(minx - 1, top + 3 + hy, maxx + 1, top + 3 + hy, t['shadow'], 'top')
            c.put(cx + 3, top - 5 + hy, self.r['trim']['light'], 'trim')

        if view == 'up':
            return
        # eyes
        ey = top + 9
        blush = shift(skin['base'], -0.08, 0.3, -0.03)
        mouth = skin['outline']
        def eye(ex, closed):
            if closed:
                c.rect(ex, ey + 1, ex + 1, ey + 1, self.eye, 'skin')
                return
            c.put(ex, ey, shift(self.eye, -0.2), 'skin'); c.put(ex + 1, ey, shift(self.eye, -0.2), 'skin')
            c.put(ex, ey + 1, (255, 255, 255), 'skin'); c.put(ex + 1, ey + 1, self.eye, 'skin')
            c.put(ex, ey + 2, self.eye, 'skin'); c.put(ex + 1, ey + 2, shift(self.eye, 0.25), 'skin')
        if view == 'down':
            eye(cx - 5, p['blink']); eye(cx + 2, p['blink'])
            c.put(cx - 6, ey + 3, blush, 'skin'); c.put(cx + 4, ey + 3, blush, 'skin')
            c.put(cx - 1, ey + 4, mouth, 'skin')
        elif view == 'left':
            eye(minx + 2, p['blink']); c.put(minx + 2, ey + 3, blush, 'skin'); c.put(minx, ey + 3, skin['shadow'], 'skin')
            c.put(minx - 1 + 1, ey + 1, skin['light'], 'skin')  # nose
        else:
            eye(maxx - 3, p['blink']); c.put(maxx - 2, ey + 3, blush, 'skin'); c.put(maxx, ey + 3, skin['shadow'], 'skin')
            c.put(maxx, ey + 1, skin['light'], 'skin')

    def frame(self, view, anim, i):
        c = Canvas(FW, FH)
        p = pose(anim, i)
        self.shadow(c)
        if view in ('left', 'right'):
            self.arm(c, view, p, front=False)
        if view != 'up':
            self.tail(c, view, p)
        self.legs(c, view, p)
        self.torso(c, view, p)
        if view == 'up':
            self.tail(c, view, p)
        if view != 'up':
            self.scarf(c, view, p)
        self.arm(c, view, p, front=True)
        self.head(c, view, p)
        if view == 'up':
            self.scarf(c, view, p)
        return c

    def sheet(self):
        cols = sum(n for (_, n, _) in ANIMS.values())
        img = Image.new('RGBA', (FW * cols, FH * len(ROWS)), (0, 0, 0, 0))
        for r_, view in enumerate(ROWS):
            for anim, (start, count, _) in ANIMS.items():
                for i in range(count):
                    fr = self.frame('left', anim, i).mirror() if view == 'right' else self.frame(view, anim, i)
                    fr.render(img, (start + i) * FW, r_ * FH, self.outlines, soft=('shadow',))
        return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    defs = []
    for ch in CHARACTERS:
        img = CharacterArtist(ch).sheet()
        img.save(os.path.join(OUT_DIR, f"{ch['id']}.png"))
        defs.append({
            'id': ch['id'], 'name': ch['name'], 'title': ch['title'],
            'sheet': f"characters/{ch['id']}.png",
            'frameWidth': FW, 'frameHeight': FH, 'columns': img.width // FW,
            'anchor': {'x': 0.5, 'y': 30 / FH}, 'footOffsetY': -2,
            'rows': {v: i for i, v in enumerate(ROWS)},
            'animations': {n: {'startColumn': s, 'frames': k, 'frameRate': f} for n, (s, k, f) in ANIMS.items()},
            'effects': {'walkStep': 'dust-small', 'runStep': 'dust-large'},
        })
    with open(DATA_FILE, 'w') as fh:
        json.dump({'defaultCharacter': 'rowan', 'characters': defs}, fh, indent=2)
        fh.write('\n')
    print(f'wrote {len(defs)} characters')


if __name__ == '__main__':
    main()
