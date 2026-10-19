#!/usr/bin/env python3
"""由原图生成 App 背景（轻度虚化）。

原图：assets-src/bg-original.png
产物：app/src/assets/bg.jpg

调参：BLUR 越大越模糊（当前为“轻度”），WIDTH 越大越清晰、体积越大。
"""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "bg-original.png"
OUT = ROOT / "app" / "src" / "assets" / "bg.jpg"

WIDTH = 1000          # 分辨率：比 720 更清晰
BLUR = 6              # 虚化半径：轻度
BRIGHTNESS = 1.0      # 亮度：1.0 不压暗

img = Image.open(SRC).convert("RGB")
h = round(img.height * WIDTH / img.width)
img = img.resize((WIDTH, h), Image.LANCZOS)
img = img.filter(ImageFilter.GaussianBlur(radius=BLUR))
img = ImageEnhance.Brightness(img).enhance(BRIGHTNESS)
img.save(OUT, "JPEG", quality=84, optimize=True)
print(f"saved {OUT} ({img.width}x{img.height})")
