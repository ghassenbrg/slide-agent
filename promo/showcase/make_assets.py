"""Renders the two raster grounds the showcase uses: the architecture slide's
night glow and the keynote slide's pastel light. Everything else is native."""

import pathlib
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).parent / "assets"
W, H = 2667, 1500


def glow(base, blobs, blur, path):
    img = Image.new("RGB", (W, H), base)
    for (cx, cy, r, color, alpha) in blobs:
        # Blur only the mask: blurring RGBA would bleed black into the edges and leave grey halos.
        mask = Image.new("L", (W, H), 0)
        x, y, rr = cx * W, cy * H, r * W
        ImageDraw.Draw(mask).ellipse([x - rr, y - rr * 0.8, x + rr, y + rr * 0.8], fill=alpha)
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
        img.paste(Image.new("RGB", (W, H), color), (0, 0), mask)
    img.save(path, optimize=True)


# Night: a low blue core light behind the service tier, violet over the AI runtime, teal over data.
glow((10, 16, 34), [
    (0.52, 0.55, 0.22, (37, 99, 235), 70),
    (0.86, 0.30, 0.16, (124, 58, 237), 80),
    (0.86, 0.72, 0.15, (20, 184, 166), 55),
    (0.15, 0.50, 0.12, (56, 189, 248), 28),
], 220, HERE / "night-glow.png")

# Keynote: white paper lit from the right by lavender, sky and rose.
glow((255, 255, 255), [
    (0.78, 0.30, 0.26, (196, 181, 253), 150),
    (0.95, 0.70, 0.20, (147, 197, 253), 140),
    (0.62, 0.92, 0.20, (249, 168, 212), 110),
    (0.70, 0.55, 0.18, (233, 213, 255), 120),
], 260, HERE / "keynote-light.png")
print("ok")
