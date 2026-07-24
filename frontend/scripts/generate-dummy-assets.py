"""
generate-dummy-assets.py
Produces placeholder PNG icons and a JPEG card-background texture for the
Match History page. Run from the repo root:
    python scripts/generate-dummy-assets.py
Replace any output file with your real asset and the CSS will pick it up.
"""

from PIL import Image, ImageDraw, ImageFilter
import math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS_DIR  = os.path.join(ROOT, "public", "icons")
IMAGES_DIR = os.path.join(ROOT, "public", "images")
os.makedirs(ICONS_DIR,  exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

def new_icon(size=64, bg=(0, 0, 0, 0)):
    """Transparent RGBA canvas."""
    img = Image.new("RGBA", (size, size), bg)
    return img, ImageDraw.Draw(img)


def save_png(img, path):
    img.save(path, "PNG")
    print(f"  wrote {os.path.relpath(path, ROOT)}")


def save_jpeg(img, path, quality=88):
    img = img.convert("RGB")
    img.save(path, "JPEG", quality=quality)
    print(f"  wrote {os.path.relpath(path, ROOT)}")


# ── Icon: crossed swords (League) ────────────────────────────────────────────

def make_icon_swords(size=64):
    img, d = new_icon(size)
    c   = (220, 200, 110, 255)    # gold-ish
    lw  = max(3, size // 18)
    pad = size * 0.12
    # blade 1: top-left → bottom-right
    d.line([(pad, pad), (size - pad, size - pad)], fill=c, width=lw)
    # blade 2: top-right → bottom-left
    d.line([(size - pad, pad), (pad, size - pad)], fill=c, width=lw)
    # hilt 1 (horizontal bar near top-right)
    cx1 = size * 0.72;  cy1 = size * 0.28
    d.line([(cx1 - size*0.12, cy1), (cx1 + size*0.12, cy1)], fill=c, width=lw)
    # hilt 2 (horizontal bar near bottom-left)
    cx2 = size * 0.28;  cy2 = size * 0.72
    d.line([(cx2 - size*0.12, cy2), (cx2 + size*0.12, cy2)], fill=c, width=lw)
    return img


# ── Icon: mountain peaks (Ranked) ────────────────────────────────────────────

def make_icon_mountain(size=64):
    img, d = new_icon(size)
    c   = (170, 200, 230, 255)    # icy blue
    pad = size * 0.06
    base_y = size - pad
    # left peak
    lx = [pad, size * 0.42, size * 0.28]
    ly = [base_y, base_y, size * 0.28]
    d.polygon(list(zip(lx, ly)), fill=c)
    # right (taller) peak
    rx = [size * 0.32, size - pad, size * 0.62]
    ry = [base_y, base_y, size * 0.14]
    d.polygon(list(zip(rx, ry)), fill=c)
    # snow cap on right peak
    snow = (235, 240, 248, 255)
    sx = [size * 0.55, size * 0.62, size * 0.70]
    sy = [size * 0.28, size * 0.14, size * 0.28]
    d.polygon(list(zip(sx, sy)), fill=snow)
    return img


# ── Icon: bullseye / target (Scrim) ──────────────────────────────────────────

def make_icon_target(size=64):
    img, d = new_icon(size)
    rings = [
        (size * 0.46, (200, 60, 60, 255)),
        (size * 0.33, (240, 240, 240, 255)),
        (size * 0.20, (200, 60, 60, 255)),
        (size * 0.09, (240, 240, 240, 255)),
    ]
    cx = cy = size / 2
    for r, col in rings:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    return img


# ── Icon: trophy cup (Victory) ───────────────────────────────────────────────

def make_icon_trophy(size=64):
    img, d = new_icon(size)
    gold = (210, 175, 55, 255)
    pad  = size * 0.18
    # cup body
    cup_pts = [
        (pad,        size * 0.12),
        (size - pad, size * 0.12),
        (size * 0.75, size * 0.52),
        (size * 0.62, size * 0.62),
        (size * 0.38, size * 0.62),
        (size * 0.25, size * 0.52),
    ]
    d.polygon(cup_pts, fill=gold)
    # stem
    sx = size * 0.42; ex = size * 0.58
    d.rectangle([sx, size * 0.62, ex, size * 0.78], fill=gold)
    # base
    bpad = size * 0.22
    d.rectangle([bpad, size * 0.78, size - bpad, size * 0.88], fill=gold)
    # handles (left, right arcs approximated with ellipse arcs)
    arc_r = size * 0.14
    lx = pad - arc_r * 0.6;  lcy = size * 0.30
    d.arc([lx, lcy - arc_r, lx + arc_r * 1.2, lcy + arc_r],
          start=90, end=270, fill=gold, width=max(2, size // 22))
    rx = size - pad - arc_r * 0.6;  rcy = size * 0.30
    d.arc([rx, rcy - arc_r, rx + arc_r * 1.2, rcy + arc_r],
          start=270, end=90, fill=gold, width=max(2, size // 22))
    return img


# ── Icon: X cross (Failure) ───────────────────────────────────────────────────

def make_icon_cross(size=64):
    img, d = new_icon(size)
    red = (210, 55, 55, 255)
    lw  = max(4, size // 12)
    pad = size * 0.18
    d.line([(pad, pad), (size - pad, size - pad)], fill=red, width=lw)
    d.line([(size - pad, pad), (pad, size - pad)], fill=red, width=lw)
    return img


# ── Icon: shield (Draw) ───────────────────────────────────────────────────────

def make_icon_shield(size=64):
    img, d = new_icon(size)
    col  = (160, 170, 190, 255)
    pad  = size * 0.12
    top  = size * 0.08
    mid  = size * 0.58
    bot  = size * 0.92
    cx   = size / 2
    pts  = [
        (pad,       top),
        (size - pad, top),
        (size - pad, mid),
        (cx,         bot),
        (pad,        mid),
    ]
    d.polygon(pts, fill=col)
    # simple emblem: vertical line
    lw = max(2, size // 20)
    inner = (220, 225, 235, 255)
    d.line([(cx, top + size*0.15), (cx, mid - size*0.1)], fill=inner, width=lw)
    d.line([(cx - size*0.14, mid - size*0.28), (cx + size*0.14, mid - size*0.28)], fill=inner, width=lw)
    return img


# ── Background: card texture JPEG ────────────────────────────────────────────

def make_card_texture(w=480, h=270):
    """
    Muted dark parchment / painterly background.
    Roughly matches the reddish-brown card feel from the screenshot.
    """
    # base fill: dark warm brown
    base = (52, 30, 18)
    img  = Image.new("RGB", (w, h), base)
    d    = ImageDraw.Draw(img)

    import random
    rng = random.Random(42)

    # paint rough horizontal smears
    for _ in range(320):
        x  = rng.randint(0, w)
        y  = rng.randint(0, h)
        bw = rng.randint(20, 100)
        bh = rng.randint(3, 18)
        br = rng.randint(-8, 8)          # luminance tweak
        base_r, base_g, base_b = base
        r = max(0, min(255, base_r + br + rng.randint(-6, 20)))
        g = max(0, min(255, base_g + br + rng.randint(-4, 10)))
        b = max(0, min(255, base_b + br + rng.randint(-4,  8)))
        d.rectangle([x, y, x + bw, y + bh], fill=(r, g, b))

    # subtle vignette: darken corners
    vign = Image.new("RGB", (w, h), (0, 0, 0))
    mask = Image.new("L", (w, h), 0)
    md   = ImageDraw.Draw(mask)
    for step, alpha in [(0.45, 200), (0.30, 120), (0.15, 40)]:
        sw = int(w * step);  sh = int(h * step)
        md.ellipse([(w//2 - sw, h//2 - sh), (w//2 + sw, h//2 + sh)], fill=255 - alpha)
    # invert: corners dark
    mask = Image.eval(mask, lambda p: 255 - p)
    vign.putalpha(mask)
    img.paste(vign, mask=mask)

    # soft blur for painterly look
    img = img.filter(ImageFilter.GaussianBlur(radius=1.2))
    return img


# ── Main ─────────────────────────────────────────────────────────────────────

print("Generating dummy match-history assets...")

save_png(make_icon_swords(),   os.path.join(ICONS_DIR,  "icon-swords.png"))
save_png(make_icon_mountain(), os.path.join(ICONS_DIR,  "icon-mountain.png"))
save_png(make_icon_target(),   os.path.join(ICONS_DIR,  "icon-target.png"))
save_png(make_icon_trophy(),   os.path.join(ICONS_DIR,  "icon-trophy.png"))
save_png(make_icon_cross(),    os.path.join(ICONS_DIR,  "icon-cross.png"))
save_png(make_icon_shield(),   os.path.join(ICONS_DIR,  "icon-shield.png"))
save_jpeg(make_card_texture(), os.path.join(IMAGES_DIR, "card-texture.jpg"))

print("Done.")
