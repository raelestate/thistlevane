"""Small pixel-art helpers shared by the generators: palettes with hue-shifted ramps, canvases, outlines."""
import colorsys


def rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def shift(c, dl, ds=0.0, dh=0.0):
    """Shift lightness/saturation/hue (hue in turns). Classic pixel-art ramps move hue toward
    purple-blue in shadows and toward yellow in highlights."""
    r, g, b = (v / 255 for v in c)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h = (h + dh) % 1.0
    l = min(1, max(0, l + dl))
    s = min(1, max(0, s + ds))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (round(r * 255), round(g * 255), round(b * 255))


def ramp(hex_or_rgb):
    """4-tone ramp: outline, shadow, base, light (+ 'bright' for specular)."""
    c = rgb(hex_or_rgb) if isinstance(hex_or_rgb, str) else hex_or_rgb
    return {
        'outline': shift(c, -0.34, 0.05, +0.04),
        'shadow': shift(c, -0.14, 0.04, +0.025),
        'base': c,
        'light': shift(c, +0.10, 0.0, -0.02),
        'bright': shift(c, +0.20, -0.08, -0.04),
    }


class Canvas:
    """Sparse pixel canvas: (x, y) -> (rgb, material). Outlines are added at render time."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = {}

    def put(self, x, y, c, mat='m'):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[(x, y)] = (c, mat)

    def rect(self, x0, y0, x1, y1, c, mat='m'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c, mat)

    def ellipse(self, cx, cy, rx, ry):
        pts = []
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                    pts.append((x, y))
        return pts

    def fill(self, pts, c, mat='m'):
        for (x, y) in pts:
            self.put(x, y, c, mat)

    def has(self, x, y):
        return (x, y) in self.px

    def mirror(self):
        m = Canvas(self.w, self.h)
        for (x, y), v in self.px.items():
            m.px[(self.w - 1 - x, y)] = v
        return m

    def render(self, img, ox, oy, outlines, soft=()):
        """Blit onto a PIL image. `outlines` maps material -> outline colour; materials in `soft`
        get no outline (shadows, effects)."""
        p = img.load()
        out = {}
        for (x, y), (c, mat) in self.px.items():
            if mat in soft:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n in self.px and self.px[n][1] not in soft:
                    continue
                if 0 <= n[0] < self.w and 0 <= n[1] < self.h:
                    out.setdefault(n, outlines.get(mat, (30, 22, 38)))
        for (x, y), c in out.items():
            p[ox + x, oy + y] = c + (255,)
        for (x, y), (c, mat) in self.px.items():
            a = 255
            if mat == 'shadow':
                a = 80
            p[ox + x, oy + y] = c + (a,)
