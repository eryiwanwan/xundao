#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成站点用图：favicon / apple-touch-icon / og 分享图
源图全部取自 game/assets/bg/，输出到 game/assets/
用法： python scripts/make_site_images.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, "game", "assets", "bg")
OUT = os.path.join(ROOT, "game", "assets")

FONT_SERIF = r"C:\Windows\Fonts\STSONG.TTF"   # 华文宋体
FONT_SANS = r"C:\Windows\Fonts\msyhl.ttc"     # 微软雅黑 Light


def load_font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.load_default()


def make_icon(src, size, out_name, zoom=1.0):
    """从背景图裁一个正方形做图标：取画面偏上中部（门与暖光）"""
    im = Image.open(os.path.join(BG, src)).convert("RGB")
    w, h = im.size
    side = int(min(w, h) / zoom)
    left = (w - side) // 2
    top = int(h * 0.30)
    if top + side > h:
        top = h - side
    box = im.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    # 轻微压暗 + 圆角（图标容器会给圆角，这里只压一点亮度让白色剪影不刺眼）
    box = box.point(lambda v: int(v * 0.94))
    p = os.path.join(OUT, out_name)
    box.save(p, "PNG", optimize=True)
    print(f"  {out_name}  {size}x{size}  {os.path.getsize(p)//1024}KB")


def make_og():
    """1200x630 分享图：背景 + 左侧暗角 + 标题"""
    W, H = 1200, 630
    im = Image.open(os.path.join(BG, "title_stairs.jpg")).convert("RGB")
    iw, ih = im.size
    scale = max(W / iw, H / ih)
    im = im.resize((int(iw * scale), int(ih * scale)), Image.LANCZOS)
    iw, ih = im.size
    im = im.crop(((iw - W) // 2, int((ih - H) * 0.35), (iw - W) // 2 + W, int((ih - H) * 0.35) + H))

    # 左侧渐变暗角，保证文字可读
    veil = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(veil)
    for x in range(W):
        a = int(215 * max(0.0, 1 - x / (W * 0.78)) ** 1.25)
        d.line([(x, 0), (x, H)], fill=a)
    dark = Image.new("RGB", (W, H), (7, 7, 10))
    im = Image.composite(dark, im, veil)
    # 整体再压一点
    im = Image.blend(im, Image.new("RGB", (W, H), (7, 7, 10)), 0.18)

    d = ImageDraw.Draw(im)
    f_title = load_font(FONT_SERIF, 116)
    f_sub = load_font(FONT_SANS, 30)
    f_tag = load_font(FONT_SANS, 22)

    x = 92
    d.text((x, 196), "驯刀", font=f_title, fill=(240, 236, 230))
    # 一条细线
    d.line([(x + 6, 344), (x + 96, 344)], fill=(178, 62, 58), width=2)
    d.text((x + 6, 376), "现代都市 · 双线双视角 · 文字游戏", font=f_sub, fill=(196, 190, 182))
    d.text((x + 6, 470), "全篇成人向　仅限 18 岁以上", font=f_tag, fill=(140, 132, 124))

    p = os.path.join(OUT, "og.jpg")
    im.save(p, "JPEG", quality=90, optimize=True, progressive=True)
    print(f"  og.jpg  {W}x{H}  {os.path.getsize(p)//1024}KB")


if __name__ == "__main__":
    print("生成站点图片：")
    make_og()
    make_icon("title_stairs.jpg", 180, "apple-touch-icon.png", zoom=1.6)
    make_icon("title_stairs.jpg", 64, "favicon.png", zoom=1.6)
    print("完成。")
