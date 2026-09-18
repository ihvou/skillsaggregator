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

    place_screen(canvas, src, W, H, top_band + int(H * 0.028), 0.80)
    canvas.save(out_path, "PNG", optimize=True)
    return out_path


def place_screen(canvas, src, W, H, sy, width_frac):
    """Paste a rounded, shadowed screen capture at y=sy, scaled to width_frac of W."""
    shot = Image.open(src).convert("RGB")
    target_w = int(W * width_frac)
    target_h = int(shot.height * target_w / shot.width)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)
    shot = rounded(shot, int(target_w * 0.058))

    sx = (W - target_w) // 2

    # Soft drop shadow so the screen separates from the ground.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh = Image.new("RGBA", shot.size, (0, 0, 0, 90))
    sh.putalpha(shot.getchannel("A").point(lambda a: int(a * 0.45)))
    shadow.paste(sh, (sx, sy + int(H * 0.008)), sh)
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(W * 0.018)))
    canvas.paste(Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB"), (0, 0))

    canvas.paste(shot, (sx, sy), shot)


DEEP_GREEN = (9, 42, 31)      # bottom of the hero gradient


def tracked_width(draw, text, fnt, tracking):
    return sum(draw.textlength(ch, font=fnt) for ch in text) + tracking * (len(text) - 1)


def draw_tracked(draw, x, y, text, fnt, fill, tracking=0):
    """Draw on a baseline with letter-spacing, which PIL has no option for."""
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill, anchor="ls")
        x += draw.textlength(ch, font=fnt) + tracking
    return x


def fit_size(draw, text, weight, target_w, tracking_em=0.0, lo=40, hi=900):
    """Largest font size at which `text` fits target_w."""
    while hi - lo > 1:
        mid = (lo + hi) // 2
        f = font(mid, weight)
        if tracked_width(draw, text, f, int(mid * tracking_em)) <= target_w:
            lo = mid
        else:
            hi = mid
    return lo


def compose_hero(src, stats, out_path, W, H, variant="phone", sports=None):
    """First screenshot: the catalogue's size, set like a sports poster.

    One dominant number ("15,000+ free tutorials") in compressed black numerals —
    the scoreboard register suits a sports app — and the remaining stats as a
    secondary row. The app itself either peeks up from the bottom edge
    (variant="phone") or is left out for a wall of every sport the app covers
    (variant="sports").

    The figures are baked into an image that cannot change until the next app
    version, so they must be rounded DOWN from the live count — a claim that is
    true today and stays true as the catalogue grows.
    """
    hero_n, hero_label = stats[0]
    rest = stats[1:]

    # Ground: brand green deepening towards the bottom, with a soft mint glow
    # behind the hero number so it lifts off the page.
    canvas = Image.new("RGB", (W, H), GREEN)
    grad = Image.linear_gradient("L").resize((W, H))
    canvas = Image.composite(Image.new("RGB", (W, H), DEEP_GREEN), canvas, grad)
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([int(-0.25 * W), int(0.12 * H), int(1.1 * W), int(0.42 * H)], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(int(W * 0.16)))
    canvas = Image.composite(Image.new("RGB", (W, H), (40, 110, 82)), canvas, glow)
    draw = ImageDraw.Draw(canvas)

    margin = int(W * 0.076)
    usable = W - 2 * margin

    # Brand lockup, small, top left.
    mark = draw_mark(int(H * 0.018))
    top = int(H * 0.058)
    canvas.paste(mark, (margin, top), mark)
    wordmark = font(int(H * 0.0205), "Bold")
    draw.text((margin + mark.width + int(W * 0.022), top + mark.height // 2), "Subskills",
              font=wordmark, fill=CREAM, anchor="lm")

    # Kicker.
    kicker = "THE SPORT TECHNIQUE LIBRARY"
    k_f = font(int(W * 0.028), "Expanded Semibold")
    y = int(H * 0.165)
    draw_tracked(draw, margin, y, kicker, k_f, MINT, tracking=int(W * 0.0045))

    # Hero number, fitted edge to edge; the "+" picks up the red of the logo.
    num_weight = "Compressed Black"
    size = fit_size(draw, hero_n, num_weight, usable, tracking_em=-0.01)
    n_f = font(size, num_weight)
    asc, _ = n_f.getmetrics()
    y = int(H * 0.182) + asc
    body, plus = (hero_n[:-1], "+") if hero_n.endswith("+") else (hero_n, "")
    x = draw_tracked(draw, margin, y, body, n_f, CREAM, tracking=int(-0.01 * size))
    if plus:
        draw_tracked(draw, x, y, plus, n_f, RED)

    # Hero label.
    label_f = font(fit_size(draw, hero_label.upper(), "Expanded Black", usable, tracking_em=0.02), "Expanded Black")
    y += int(H * 0.058)
    draw_tracked(draw, margin, y, hero_label.upper(), label_f, MINT, tracking=int(label_f.size * 0.02))

    # Hairline, then the secondary stats in columns.
    y += int(H * 0.036)
    draw.line([(margin, y), (W - margin, y)], fill=(70, 120, 100), width=max(2, W // 440))
    col_w = usable // max(1, len(rest))
    s_f = font(int(H * 0.082), num_weight)
    s_label_f = font(int(W * 0.03), "Expanded Bold")
    s_asc, _ = s_f.getmetrics()
    y_num = y + int(H * 0.018) + s_asc
    for i, (n, label) in enumerate(rest):
        cx = margin + i * col_w
        body, plus = (n[:-1], "+") if n.endswith("+") else (n, "")
        x = draw_tracked(draw, cx, y_num, body, s_f, CREAM, tracking=int(-0.01 * s_f.size))
        if plus:
            draw_tracked(draw, x, y_num, plus, s_f, RED)
        draw_tracked(draw, cx, y_num + int(H * 0.03), label.upper(), s_label_f, MINT,
                     tracking=int(W * 0.004))
    y_after_stats = y_num + int(H * 0.03)

    if variant == "phone":
        # The app, pushed well down: only its top third shows, bleeding off the edge.
        place_screen(canvas, src, W, H, int(H * 0.60), 0.86)
    else:
        # Every sport, as a wall of names — the breadth, stated rather than implied.
        names = [s.upper() for s in (sports or [])]
        wall_f = font(int(W * 0.047), "Condensed Black")
        line_gap = int(H * 0.033)
        sep = "  ·  "
        lines, cur = [], ""
        for name in names:
            trial = f"{cur}{sep}{name}" if cur else name
            if draw.textlength(trial, font=wall_f) <= usable:
                cur = trial
            else:
                lines.append(cur)
                cur = name
        if cur:
            lines.append(cur)
        block_h = line_gap * len(lines)
        y = y_after_stats + int(H * 0.09) + (int(H * 0.88) - y_after_stats - int(H * 0.09) - block_h) // 2
        for i, ln in enumerate(lines):
            draw.text((W // 2, y + i * line_gap), ln, font=wall_f,
                      fill=CREAM if i % 2 == 0 else MINT, anchor="ms")
        tag_f = font(int(W * 0.03), "Expanded Semibold")
        tag = "REVIEWED · RANKED BY LEVEL · FREE"
        tw = tracked_width(draw, tag, tag_f, int(W * 0.004))
        draw_tracked(draw, (W - tw) / 2, int(H * 0.95), tag, tag_f, (150, 190, 170), tracking=int(W * 0.004))

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


# iOS set, approved by the owner 2026-09-18. Order follows onboarding: scale →
# levels → skills → watched → saved from anywhere. Captured on an iPhone 17 Pro
# Max simulator (1320×2868) from the release build, status bar pinned to 9:41.
#
# The hero numbers are live counts rounded DOWN (2026-09-17: 22 categories, 554
# skills, 15,539 distinct published videos) — baked into an image that cannot
# change until the next app version, so they must stay true as the catalogue grows.
IOS_HERO = ("01-discover.png", [("15,000+", "free tutorials"), ("500+", "skills"), ("20+", "sports")])
IOS_SHOTS = [
    ("02-learning-path.png", "Go from beginner to advanced, step by step"),
    ("03-skill.png",         "What coaches agree on, and a reviewed shortlist"),
    ("04-watched.png",       "Tick off what you have trained, skill by skill"),
    ("05-watch-later.png",   "Bookmark tutorials from any app"),
]

# Android listing still uses the 2026-08-09 captures and captions; redo it when
# the Android set is re-shot.
ANDROID_SHOTS = [
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
        out = os.path.join(OUT, "ios-listing")
        os.makedirs(out, exist_ok=True)
        name, stats = IOS_HERO
        print(" ", compose_hero(os.path.join(OUT, "ios", name), stats, os.path.join(out, name),
                                1320, 2868, variant="phone"))
        for name, cap in IOS_SHOTS:
            src = os.path.join(OUT, "ios", name)
            if not os.path.exists(src):
                print(f"  SKIP {name} (missing)")
                continue
            print(" ", compose(src, cap, os.path.join(out, name), 1320, 2868))

    if which in ("all", "android"):
        srcdir = os.path.join(OUT, "android")
        if os.path.isdir(srcdir) and os.listdir(srcdir):
            os.makedirs(os.path.join(OUT, "android-listing"), exist_ok=True)
            for i, (name, cap) in enumerate(ANDROID_SHOTS, 1):
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
