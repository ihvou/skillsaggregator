#!/usr/bin/env python3
"""
Generate Subskills store assets: Play icon, Play feature graphic, and captioned
screenshot compositions sized exactly to each store's spec.

Sizes are deliberately exact — Apple rejects screenshots that are not one of its
listed device sizes, and Play warns on aspect ratios outside 9:16..16:9 (real
phone captures are 20:9, so composing onto a 9:16 canvas sidesteps that entirely).
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = "/Users/bobdean/Projects/skillsaggregator"
OUT = os.path.join(ROOT, "store-assets")

GREEN = (15, 61, 46)        # #0F3D2E brand ground
MINT = (184, 242, 208)      # #B8F2D0
CREAM = (246, 241, 232)     # #F6F1E8
RED = (229, 61, 47)         # #E53D2F

SF = "/System/Library/Fonts/SFNS.ttf"


def font(size, weight="Bold"):
    f = ImageFont.truetype(SF, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def rounded(img, radius):
    """Apply rounded corners with an antialiased mask."""
    ss = 4  # supersample so the corner curve is smooth
    mask = Image.new("L", (img.width * ss, img.height * ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.width * ss - 1, img.height * ss - 1], radius * ss, fill=255
    )
    mask = mask.resize(img.size, Image.LANCZOS)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def compose(src, caption, out_path, W, H):
    """Caption on brand ground, device-framed screenshot bleeding off the bottom."""
    canvas = Image.new("RGB", (W, H), GREEN)
    draw = ImageDraw.Draw(canvas)

    margin = int(W * 0.075)
    cap_size = int(W * 0.058)
    fnt = font(cap_size, "Bold")
    lines = wrap(draw, caption, fnt, W - 2 * margin)

    # Caption block, vertically centred in the top band.
    line_h = int(cap_size * 1.20)
    block_h = line_h * len(lines)
    top_band = int(H * 0.175)
    y = (top_band - block_h) // 2 + int(H * 0.015)
    for ln in lines:
        draw.text((W // 2, y), ln, font=fnt, fill=CREAM, anchor="ma")
        y += line_h

    # Screenshot, scaled to a fixed fraction of canvas width.
    shot = Image.open(src).convert("RGB")
    target_w = int(W * 0.80)
    target_h = int(shot.height * target_w / shot.width)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)
    shot = rounded(shot, int(target_w * 0.058))

    sx = (W - target_w) // 2
    sy = top_band + int(H * 0.028)

    # Soft drop shadow so the screen separates from the ground.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh = Image.new("RGBA", shot.size, (0, 0, 0, 90))
    sh.putalpha(shot.getchannel("A").point(lambda a: int(a * 0.45)))
    shadow.paste(sh, (sx, sy + int(H * 0.008)), sh)
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(W * 0.018)))
    canvas.paste(Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB"), (0, 0))

    canvas.paste(shot, (sx, sy), shot)
    canvas.save(out_path, "PNG", optimize=True)
    return out_path


def play_icon():
    """Play listing icon: 512x512, 32-bit PNG, full-bleed square (Play masks it)."""
    src = Image.open(os.path.join(ROOT, "apps/mobile/assets/icon.png")).convert("RGB")
    dst = os.path.join(OUT, "graphics/play-icon-512.png")
    src.resize((512, 512), Image.LANCZOS).save(dst, "PNG", optimize=True)
    return dst


def draw_mark(size_h):
    """The Subskills mark drawn from its source geometry rather than pasted from
    the app icon — the icon carries ~35% internal padding and its green plate is
    invisible against the green ground, so it reads far too small when reused."""
    ss = 4  # supersample, then downscale for clean curves
    # Source viewBox is 64x64; the mark itself occupies x 18..52, y 21..46.
    s = size_h * ss / 25.0
    w, h = int(34 * s), int(25 * s)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def X(v):
        return (v - 18) * s

    def Y(v):
        return (v - 21) * s

    d.rounded_rectangle([X(18), Y(21), X(38), Y(31)], radius=5 * s, fill=MINT)
    d.rounded_rectangle([X(18), Y(36), X(46), Y(46)], radius=5 * s, fill=CREAM)
    d.polygon([(X(40), Y(23.5)), (X(52), Y(32)), (X(40), Y(40.5))], fill=RED)

    return img.resize((w // ss, h // ss), Image.LANCZOS)


def feature_graphic():
    """Play feature graphic: exactly 1024x500, no alpha. The lockup is centred and
    kept well inside the edges because Play overlays install UI and crops it on
    some surfaces."""
    W, H = 1024, 500
    canvas = Image.new("RGB", (W, H), GREEN)
    draw = ImageDraw.Draw(canvas)

    # Sized so the whole lockup stays inside the central ~80%: Play crops the
    # feature graphic on some promotional surfaces and overlays install UI.
    mark = draw_mark(150)
    gap = 52
    name_f = font(94, "Heavy")
    tag_f = font(34, "Medium")
    name, tag = "Subskills", "Curated tutorials for every sport skill"

    text_w = max(draw.textlength(name, font=name_f), draw.textlength(tag, font=tag_f))
    lockup_w = mark.width + gap + text_w
    x0 = int((W - lockup_w) / 2)

    canvas.paste(mark, (x0, (H - mark.height) // 2), mark)

    tx = x0 + mark.width + gap
    draw.text((tx, H // 2 - 56), name, font=name_f, fill=CREAM, anchor="lm")
    draw.text((tx, H // 2 + 40), tag, font=tag_f, fill=MINT, anchor="lm")

    dst = os.path.join(OUT, "graphics/play-feature-graphic-1024x500.png")
    canvas.save(dst, "PNG", optimize=True)
    return dst


# (source basename, caption)
SHOTS = [
    ("04-discover.png",      "Find the best free tutorials for any sport"),
    ("06-learning-path.png", "Follow a path from beginner to advanced"),
    ("07-skill.png",         "Every sub-skill, with its own reviewed shortlist"),
    ("08-search.png",        "Search once, get results across every sport"),
    ("05-category.png",      "Browse by sub-skill, not by algorithm"),
]


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"

    if which in ("all", "graphics"):
        print(" ", play_icon())
        print(" ", feature_graphic())

    if which in ("all", "ios"):
        os.makedirs(os.path.join(OUT, "ios-listing"), exist_ok=True)
        for i, (name, cap) in enumerate(SHOTS, 1):
            src = os.path.join(OUT, "ios", name)
            if not os.path.exists(src):
                print(f"  SKIP {name} (missing)")
                continue
            dst = os.path.join(OUT, f"ios-listing/{i:02d}-{name.split('-', 1)[1]}")
            compose(src, cap, dst, 1320, 2868)
            print(" ", dst)

    if which in ("all", "android"):
        srcdir = os.path.join(OUT, "android")
        if os.path.isdir(srcdir) and os.listdir(srcdir):
            os.makedirs(os.path.join(OUT, "android-listing"), exist_ok=True)
            for i, (name, cap) in enumerate(SHOTS, 1):
                src = os.path.join(srcdir, name)
                if not os.path.exists(src):
                    print(f"  SKIP android/{name} (missing)")
                    continue
                dst = os.path.join(OUT, f"android-listing/{i:02d}-{name.split('-', 1)[1]}")
                compose(src, cap, dst, 1080, 1920)
                print(" ", dst)
        else:
            print("  android/ empty — capture emulator screenshots first")


if __name__ == "__main__":
    main()
