"""Generates Beacon's app icons: an orange beacon (pillar) rising from an isometric plinth.
Original artwork (the Remix Icon License forbids using its icons as an app icon), redrawn
here as geometry so every platform variant comes from the same source:
  icon.png                     iOS light / default (white background, full bleed)
  ios-dark.png                 iOS dark: transparent background, dimmed plinth lit by the beacon
  ios-tinted.png               iOS tinted: grayscale, iOS applies the user's tint
  android-icon-foreground.png  adaptive icon foreground (transparent, framed for the 72/108 dp mask)
  android-icon-background.png  adaptive icon background (white)
  android-icon-monochrome.png  Material You themed icon (alpha only, shades by opacity)
  favicon.png                  web
Requires Pillow and numpy. Run from the project root:  python3 assets/icon-src/generate.py"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT = Path("assets")
SIZE = 1024
SS = 2  # supersampling factor
L = 2048  # logo units: the artwork is drawn in a 2048 x 2048 frame

# Geometry (logo units). The plinth is an isometric cube with a 0.4434 edge slope.
K = 0.4434
CX = 1024
CUBE_SIDE_Y = 1261  # left / right corners of the top face (at x = 0 and x = 2048)
CUBE_FRONT_Y = CUBE_SIDE_Y + CX * K
CUBE_BACK_Y = CUBE_SIDE_Y - CX * K
PILLAR_HALF = 281
PILLAR_SIDE_Y = 1283  # side corners of the pillar's base
PILLAR_FRONT_Y = PILLAR_SIDE_Y + PILLAR_HALF * K
FAR = 100_000  # the pillar and the plinth run off the frame

LIGHT = {
    "bg": "#ffffff",
    "pillar_l": ("#f9672b", "#fb782d"),  # horizontal gradients, left edge -> right edge of the face
    "pillar_r": ("#ff7d27", "#fe9320"),
    "top": "#c2aea3", "glow": "#e4dad4",
    "left": ("#dfcab9", "#a48876"),
    "right": ("#564e44", "#403222"),
    "grain": 2.5,
}
DARK = {
    "bg": None,  # iOS draws its own dark backdrop behind a transparent dark icon
    "pillar_l": ("#fa6a2c", "#fb7a2d"),
    "pillar_r": ("#ff7f27", "#ff9622"),
    "top": "#4a3f38", "glow": "#b0694a",  # the beacon lights the plinth
    "left": ("#6d5e54", "#4e4139"),
    "right": ("#2a241f", "#1f1813"),
    "grain": 2.0,
}
TINTED = {
    "bg": "#000000",
    "pillar_l": ("#f2f2f2", "#f7f7f7"),
    "pillar_r": ("#ffffff", "#ffffff"),
    "top": "#7a7a7a", "glow": "#b8b8b8",
    "left": ("#9c9c9c", "#6e6e6e"),
    "right": ("#383838", "#2a2a2a"),
    "grain": 0,
}


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


class Frame:
    """Maps logo units to pixels. zoom = share of the canvas covered by the 2048-unit frame."""

    def __init__(self, size, zoom=1.0):
        self.n = size * SS
        self.k = zoom * self.n / L
        idx = np.arange(self.n, dtype=np.float32) + 0.5
        u = (idx - self.n / 2) / self.k + CX  # pixel centre -> logo units
        self.x, self.y = np.meshgrid(u, u)

    def pt(self, x, y):
        return ((x - CX) * self.k + self.n / 2, (y - CX) * self.k + self.n / 2)

    def mask(self, poly):
        m = Image.new("L", (self.n, self.n), 0)
        ImageDraw.Draw(m).polygon([self.pt(x, y) for x, y in poly], fill=255)
        return np.asarray(m, dtype=np.float32) / 255


def hgrad(f, x0, x1, c0, c1):
    t = np.clip((f.x - x0) / (x1 - x0), 0, 1)[..., None]
    return rgb(c0) * (1 - t) + rgb(c1) * t


def faces(f):
    """(mask, kind) for each face, back to front."""
    top = f.mask([(0, CUBE_SIDE_Y), (CX, CUBE_BACK_Y), (L, CUBE_SIDE_Y), (CX, CUBE_FRONT_Y)])
    left = f.mask([(0, CUBE_SIDE_Y), (CX, CUBE_FRONT_Y), (CX, FAR), (0, FAR)])
    right = f.mask([(CX, CUBE_FRONT_Y), (L, CUBE_SIDE_Y), (L, FAR), (CX, FAR)])
    pl = f.mask([(CX - PILLAR_HALF, -FAR), (CX, -FAR), (CX, PILLAR_FRONT_Y), (CX - PILLAR_HALF, PILLAR_SIDE_Y)])
    pr = f.mask([(CX, -FAR), (CX + PILLAR_HALF, -FAR), (CX + PILLAR_HALF, PILLAR_SIDE_Y), (CX, PILLAR_FRONT_Y)])
    return [(top, "top"), (left, "left"), (right, "right"), (pl, "pillar_l"), (pr, "pillar_r")]


def glow(f):
    """Light pooled around the pillar's foot, as an isometric ellipse falling off from its edge."""
    d = np.sqrt((f.x - CX) ** 2 + ((f.y - PILLAR_SIDE_Y) / K) ** 2)
    return np.exp(-np.clip(d - PILLAR_HALF, 0, None) / 160)[..., None]


def render(p, zoom=1.0, size=SIZE, transparent=False):
    f = Frame(size, zoom)
    img = np.zeros((f.n, f.n, 3), np.float32)
    alpha = np.zeros((f.n, f.n), np.float32)
    if p["bg"] and not transparent:
        img[:] = rgb(p["bg"])
        alpha[:] = 1
    fills = {
        "top": rgb(p["top"]) * (1 - glow(f)) + rgb(p["glow"]) * glow(f),
        "left": hgrad(f, 0, CX, *p["left"]),
        "right": hgrad(f, CX, L, *p["right"]),
        "pillar_l": hgrad(f, CX - PILLAR_HALF, CX, *p["pillar_l"]),
        "pillar_r": hgrad(f, CX, CX + PILLAR_HALF, *p["pillar_r"]),
    }
    for m, kind in faces(f):
        a = m[..., None]
        img = img * (1 - a) + fills[kind] * a
        alpha = alpha * (1 - m) + m
    return finish(img, alpha, size, p["grain"])


def finish(img, alpha, size, grain=0.0):
    # Premultiplied downsample so edges against transparency don't pick up dark fringes.
    pre = np.dstack([img * alpha[..., None], alpha * 255])
    out = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)
    a = np.asarray(out, np.float32)
    al = a[..., 3:4] / 255
    col = np.where(al > 0, a[..., :3] / np.maximum(al, 1e-6), 0)
    if grain:  # the film grain of the original artwork
        col += np.random.default_rng(7).normal(0, grain, col.shape)
    return Image.fromarray(np.clip(np.dstack([col, a[..., 3]]), 0, 255).astype(np.uint8), "RGBA")


def monochrome(zoom):
    """Material You themed icon: Android uses only the alpha, so faces are told apart by opacity."""
    f = Frame(SIZE, zoom)
    g = glow(f)[..., 0]
    level = {
        "top": 0.42 + 0.3 * g,
        "left": 0.78 - 0.18 * np.clip(f.x / CX, 0, 1),
        "right": 0.24 * np.ones_like(f.x),
        "pillar_l": np.ones_like(f.x),
        "pillar_r": np.ones_like(f.x),
    }
    alpha = np.zeros((f.n, f.n), np.float32)
    for m, kind in faces(f):
        alpha = alpha * (1 - m) + level[kind] * m
    return finish(np.full((f.n, f.n, 3), 255, np.float32), alpha, SIZE)


def save(img, name):
    img.save(OUT / name)
    print("wrote", OUT / name)


# Android adaptive icons are 108 dp layers seen through a 72 dp mask: draw the frame at 72/108
# so the visible part matches the iOS icon; the pillar and plinth simply continue under the margin.
ANDROID_ZOOM = 72 / 108

save(render(LIGHT), "icon.png")
save(render(DARK), "ios-dark.png")
save(render(TINTED).convert("L").convert("RGB"), "ios-tinted.png")
save(render(LIGHT, zoom=ANDROID_ZOOM, transparent=True), "android-icon-foreground.png")
save(Image.new("RGB", (SIZE, SIZE), LIGHT["bg"]), "android-icon-background.png")
save(monochrome(ANDROID_ZOOM), "android-icon-monochrome.png")
save(render(LIGHT, size=48), "favicon.png")
