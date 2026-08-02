#!/usr/bin/env python3
"""Generate Android calendar launcher icons: weekday abbrev + day number (7 x 31).

Full canvas = 108dp adaptive layer (xxxhdpi 432px). Critical content stays inside
the center ~66% safe zone so circular launcher masks do not clip weekday/day.
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "calendar-icons")
SIZE = 432  # xxxhdpi for 108dp adaptive foreground
# Adaptive safe zone ≈ 72/108 of the layer (center). Keep content inside it.
SAFE = int(SIZE * 72 / 108)  # 288
SAFE_PAD = (SIZE - SAFE) // 2  # 72
WEEKDAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]
HEADER_BLUE = (0x13, 0x32, 0xF6)
WHITE = (255, 255, 255)
BLACK = (20, 20, 20)
# Slight cool gray body so a failed/partial adaptive mask never reads as "blank white".
BODY = (245, 247, 252)
EDGE = (180, 190, 220)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_icon(day: int, week: int, font_week: ImageFont.ImageFont, font_day: ImageFont.ImageFont) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (*BODY, 255))
    draw = ImageDraw.Draw(img)

    top = SAFE_PAD
    bottom = SAFE_PAD + SAFE

    # Header ~38% of safe square — strong blue so the icon never looks blank.
    header_h = int(SAFE * 0.38)
    header_bottom = top + header_h
    draw.rectangle([0, 0, SIZE, header_bottom], fill=HEADER_BLUE)

    # Soft edge ring (helps on launchers that inset the mask).
    inset_edge = max(2, SIZE // 64)
    draw.ellipse(
        [inset_edge, inset_edge, SIZE - 1 - inset_edge, SIZE - 1 - inset_edge],
        outline=EDGE,
        width=max(2, SIZE // 90),
    )

    label = WEEKDAYS[week]
    bbox = draw.textbbox((0, 0), label, font=font_week)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (SIZE - tw) // 2 - bbox[0]
    ty = top + (header_h - th) // 2 - bbox[1]
    draw.text((tx, ty), label, font=font_week, fill=WHITE)

    day_s = str(day)
    bbox = draw.textbbox((0, 0), day_s, font=font_day)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    inset = int(SAFE * 0.05)
    body_top = header_bottom + inset
    body_bottom = bottom - inset
    tx = (SIZE - tw) // 2 - bbox[0]
    ty = body_top + (body_bottom - body_top - th) // 2 - bbox[1]
    draw.text((tx, ty), day_s, font=font_day, fill=BLACK)

    return img


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    font_week = load_font(68)
    font_day = load_font(176)
    count = 0
    for w in range(7):
        for d in range(1, 32):
            path = os.path.join(OUT, f"ic_cal_d{d}_w{w}.png")
            draw_icon(d, w, font_week, font_day).save(path, optimize=True)
            count += 1
    print(f"Generated {count} icons in {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
