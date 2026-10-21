#!/usr/bin/env python3
"""Generate the DSH Hub app icon from code.

Usage:
  python scripts/make-icon.py
Requires Pillow (bundled with the DSH runtime or pip install pillow).
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

SIZE = 1024
OUT = 512


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_background(size: int) -> Image.Image:
    top = (8, 15, 27)
    bottom = (10, 28, 46)
    image = Image.new("RGB", (size, size), top)
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x * 0.25 + y * 0.75) / size
            pixels[x, y] = lerp(top, bottom, t)
    return image.convert("RGBA")


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def main() -> None:
    image = gradient_background(SIZE)

    # Soft aurora glows.
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((80, 80, 720, 720), fill=(62, 224, 192, 60))
    gd.ellipse((420, 360, 1050, 980), fill=(91, 140, 255, 56))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    image = Image.alpha_composite(image, glow)

    # Subtle grid.
    grid = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for i in range(0, SIZE, 64):
        gd.line((i, 0, i, SIZE), fill=(255, 255, 255, 10), width=1)
        gd.line((0, i, SIZE, i), fill=(255, 255, 255, 10), width=1)
    image = Image.alpha_composite(image, grid)

    # Orbit.
    center = (SIZE / 2, SIZE / 2)
    orbit_r = 285
    nodes = []
    for i in range(3):
        angle = math.radians(-90 + i * 120)
        nodes.append((center[0] + orbit_r * math.cos(angle), center[1] + orbit_r * math.sin(angle)))

    line_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(line_layer)
    for i, (x, y) in enumerate(nodes):
        ld.line((center[0], center[1], x, y), fill=(120, 180, 255, 150), width=10)
    for i in range(3):
        a = nodes[i]
        b = nodes[(i + 1) % 3]
        ld.line((a[0], a[1], b[0], b[1]), fill=(80, 220, 210, 70), width=5)
    line_layer = line_layer.filter(ImageFilter.GaussianBlur(1.2))
    image = Image.alpha_composite(image, line_layer)

    # Outer ring.
    ring = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse((center[0] - 210, center[1] - 210, center[0] + 210, center[1] + 210),
               outline=(120, 200, 255, 60), width=4)
    image = Image.alpha_composite(image, ring)

    # Hub: a stylized H made of two pillars and a bridge.
    hub = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hub)
    left = center[0] - 88
    right = center[0] + 88
    top = center[1] - 118
    bottom = center[1] + 118
    pillar_w = 46
    hd.rounded_rectangle((left - pillar_w / 2, top, left + pillar_w / 2, bottom), radius=23, fill=(238, 252, 255, 255))
    hd.rounded_rectangle((right - pillar_w / 2, top, right + pillar_w / 2, bottom), radius=23, fill=(238, 252, 255, 255))
    hd.rounded_rectangle((left, center[1] - 23, right, center[1] + 23), radius=23, fill=(238, 252, 255, 255))
    hub = hub.filter(ImageFilter.GaussianBlur(1.5))
    # Cyan edge light under the H.
    edge = hub.filter(ImageFilter.GaussianBlur(16))
    edge_tint = Image.new("RGBA", (SIZE, SIZE), (62, 224, 192, 0))
    edge_tint.putalpha(edge.getchannel("A").point(lambda a: int(a * 0.55)))
    image = Image.alpha_composite(image, edge_tint)
    image = Image.alpha_composite(image, hub)

    # Nodes.
    node_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    nd = ImageDraw.Draw(node_layer)
    colors = [(62, 224, 192, 255), (91, 140, 255, 255), (255, 159, 110, 255)]
    for (x, y), color in zip(nodes, colors):
        nd.ellipse((x - 34, y - 34, x + 34, y + 34), fill=(8, 16, 28, 255))
        nd.ellipse((x - 22, y - 22, x + 22, y + 22), fill=color)
        nd.ellipse((x - 8, y - 8, x + 8, y + 8), fill=(255, 255, 255, 235))
    image = Image.alpha_composite(image, node_layer)

    # Border and mask.
    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle((3, 3, SIZE - 4, SIZE - 4), radius=232, outline=(160, 220, 255, 50), width=4)
    image = Image.alpha_composite(image, border)
    image.putalpha(rounded_mask(SIZE, 232))

    final = image.resize((OUT, OUT), Image.LANCZOS)
    final.save(ASSETS / "icon.png")
    final.save(ASSETS / "icon-256.png", sizes=[(256, 256)])
    final.save(ASSETS / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"wrote {ASSETS / 'icon.png'} and {ASSETS / 'icon.ico'}")


if __name__ == "__main__":
    main()
