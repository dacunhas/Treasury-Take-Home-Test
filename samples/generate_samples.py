#!/usr/bin/env python3
"""
Generate the TTB sample test labels (BUILD_BACKLOG T3.4).

Deterministic, dependency-light (Pillow only) generator so the sample images are
reproducible and reviewable rather than opaque binary blobs. Produces five PNGs in
this folder plus EXPECTED.csv (the expected COLA values + the verdict each label
should drive). Run from the repo root or this folder:

    python3 samples/generate_samples.py

The canonical Government Warning text is kept byte-identical to
src/lib/governmentWarning.ts (GOVERNMENT_WARNING_CANONICAL). If that constant ever
changes, update CANONICAL_WARNING below to match.
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = "/usr/share/fonts/truetype/dejavu"

CANONICAL_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not "
    "drink alcoholic beverages during pregnancy because of the risk of birth "
    "defects. (2) Consumption of alcoholic beverages impairs your ability to "
    "drive a car or operate machinery, and may cause health problems."
)
# Prefix is rendered bold + caps; remainder regular — mirrors the 27 CFR Part 16 rule.
WARNING_PREFIX = "GOVERNMENT WARNING:"
WARNING_BODY = CANONICAL_WARNING[len(WARNING_PREFIX):].lstrip()

# A deliberately NON-COMPLIANT warning: title-case prefix (not all caps) + reworded
# / shortened clauses. Should fail the strict warning check and produce a word diff.
BAD_PREFIX = "Government Warning:"
BAD_BODY = (
    "(1) Women should not drink alcohol during pregnancy due to possible birth "
    "defects. (2) Alcohol may impair your ability to drive and can cause health "
    "issues."
)

def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)

REG = "DejaVuSans.ttf"
BOLD = "DejaVuSans-Bold.ttf"
SERIF = "DejaVuSerif.ttf"
SERIF_BOLD = "DejaVuSerif-Bold.ttf"

W, H = 1000, 1400  # label canvas

def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def draw_wrapped(draw, xy, text, fnt, max_w, fill, line_gap=8, center=False):
    x, y = xy
    for ln in wrap(draw, text, fnt, max_w):
        if center:
            tw = draw.textlength(ln, font=fnt)
            draw.text((x + (max_w - tw) / 2, y), ln, font=fnt, fill=fill)
        else:
            draw.text((x, y), ln, font=fnt, fill=fill)
        asc, desc = fnt.getmetrics()
        y += asc + desc + line_gap
    return y

def warning_block(draw, x, y, max_w, prefix, body, prefix_font, body_font, fill):
    """Render '<bold prefix> <regular body...>' wrapped, prefix inline on line 1."""
    # First line begins with the bold prefix, then as much body as fits.
    px = x
    draw.text((px, y), prefix, font=prefix_font, fill=fill)
    px += draw.textlength(prefix, font=prefix_font) + draw.textlength(" ", font=body_font)
    words = body.split()
    cur = ""
    first_line_rest = []
    i = 0
    while i < len(words):
        trial = (cur + " " + words[i]).strip()
        if px + draw.textlength(trial, font=body_font) <= x + max_w:
            cur = trial
            i += 1
        else:
            break
    draw.text((px, y), cur, font=body_font, fill=fill)
    asc, desc = body_font.getmetrics()
    y += asc + desc + 6
    rest = " ".join(words[i:])
    if rest:
        y = draw_wrapped(draw, (x, y), rest, body_font, max_w, fill, line_gap=6)
    return y

def base_label(bg, ink, accent):
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    d.rectangle([12, 12, W - 12, H - 12], outline=accent, width=6)
    return img, d

def render_spirits(bad_warning=False):
    img, d = base_label((247, 243, 233), (33, 28, 22), (140, 96, 38))
    m = 70
    d.text((m, 70), "EST. 1921", font=font(REG, 30), fill=(140, 96, 38))
    y = draw_wrapped(d, (m, 150), "OLD TOM DISTILLERY", font(SERIF_BOLD, 74),
                     W - 2 * m, (33, 28, 22), center=True)
    y = draw_wrapped(d, (m, y + 10), "Kentucky Straight Bourbon Whiskey",
                     font(SERIF, 40), W - 2 * m, (90, 60, 30), center=True, line_gap=4)
    d.line([(m, y + 25), (W - m, y + 25)], fill=(140, 96, 38), width=3)
    y += 60
    y = draw_wrapped(d, (m, y), "45% Alc./Vol. (90 Proof)", font(BOLD, 44),
                     W - 2 * m, (33, 28, 22), center=True)
    y = draw_wrapped(d, (m, y + 6), "750 mL", font(REG, 38),
                     W - 2 * m, (33, 28, 22), center=True)
    y += 30
    d.text((m, y), "Distilled & Bottled by Old Tom Distillery, Bardstown, KY",
           font=font(REG, 24), fill=(90, 70, 50))
    # Warning block near the bottom
    wy = H - 360
    d.line([(m, wy - 20), (W - m, wy - 20)], fill=(180, 150, 110), width=2)
    if bad_warning:
        warning_block(d, m, wy, W - 2 * m, BAD_PREFIX, BAD_BODY,
                      font(BOLD, 26), font(REG, 26), (33, 28, 22))
    else:
        warning_block(d, m, wy, W - 2 * m, WARNING_PREFIX, WARNING_BODY,
                      font(BOLD, 26), font(REG, 26), (33, 28, 22))
    return img

def render_beer():
    img, d = base_label((230, 240, 246), (20, 35, 50), (40, 110, 150))
    m = 70
    d.text((m, 80), "MOUNTAIN-BREWED", font=font(BOLD, 28), fill=(40, 110, 150))
    y = draw_wrapped(d, (m, 150), "CASCADE SUMMIT", font(SERIF_BOLD, 78),
                     W - 2 * m, (20, 35, 50), center=True)
    y = draw_wrapped(d, (m, y + 10), "Pale Ale", font(SERIF, 46),
                     W - 2 * m, (40, 90, 120), center=True)
    d.line([(m, y + 30), (W - m, y + 30)], fill=(40, 110, 150), width=3)
    y += 70
    # NO ABV statement (legal for beer/malt beverages).
    y = draw_wrapped(d, (m, y), "12 FL OZ (355 mL)", font(BOLD, 44),
                     W - 2 * m, (20, 35, 50), center=True)
    y += 40
    d.text((m, y), "Brewed & Canned by Cascade Summit Brewing Co., Bend, OR",
           font=font(REG, 24), fill=(40, 70, 95))
    wy = H - 360
    d.line([(m, wy - 20), (W - m, wy - 20)], fill=(120, 160, 185), width=2)
    warning_block(d, m, wy, W - 2 * m, WARNING_PREFIX, WARNING_BODY,
                  font(BOLD, 26), font(REG, 26), (20, 35, 50))
    return img

def render_table_wine():
    img, d = base_label((245, 238, 240), (60, 25, 40), (130, 40, 70))
    m = 70
    d.text((m, 80), "SONOMA COUNTY", font=font(REG, 30), fill=(130, 40, 70))
    # Brand on the label is ALL CAPS "STONE'S THROW" (the Dave fuzzy-match case).
    y = draw_wrapped(d, (m, 150), "STONE'S THROW", font(SERIF_BOLD, 82),
                     W - 2 * m, (60, 25, 40), center=True)
    y = draw_wrapped(d, (m, y + 10), "Table Wine", font(SERIF, 46),
                     W - 2 * m, (110, 40, 70), center=True)
    d.line([(m, y + 30), (W - m, y + 30)], fill=(130, 40, 70), width=3)
    y += 70
    # No numeric ABV: "Table Wine" stated in lieu of a percentage (7-14% class).
    y = draw_wrapped(d, (m, y), "750 mL", font(BOLD, 44),
                     W - 2 * m, (60, 25, 40), center=True)
    y += 40
    d.text((m, y), "Vinted & Bottled by Stone's Throw Cellars, Healdsburg, CA",
           font=font(REG, 24), fill=(110, 60, 80))
    wy = H - 360
    d.line([(m, wy - 20), (W - m, wy - 20)], fill=(190, 140, 160), width=2)
    warning_block(d, m, wy, W - 2 * m, WARNING_PREFIX, WARNING_BODY,
                  font(BOLD, 26), font(REG, 26), (60, 25, 40))
    return img

def _solve(A, b):
    """Solve A x = b (8x8) by Gaussian elimination with partial pivoting.
    Pure Python so the generator depends on Pillow only."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            raise ValueError("singular matrix")
        M[col], M[piv] = M[piv], M[col]
        pivval = M[col][col]
        for r in range(n):
            if r == col:
                continue
            f = M[r][col] / pivval
            if f:
                M[r] = [a - f * bb for a, bb in zip(M[r], M[col])]
    return [M[i][n] / M[i][i] for i in range(n)]

def find_coeffs(src, dst):
    # solve the 8 perspective coefficients mapping dst -> src (PIL convention)
    A, B = [], []
    for (x, y), (X, Y) in zip(dst, src):
        A.append([X, Y, 1, 0, 0, 0, -x * X, -x * Y])
        A.append([0, 0, 0, X, Y, 1, -y * X, -y * Y])
        B.extend([x, y])
    return _solve(A, B)

def angled_glare(img):
    """Simulate Jenny's bad photo: perspective tilt + glare + slight blur on a
    dark 'desk' background."""
    pad = 240
    canvas = Image.new("RGB", (W + 2 * pad, H + 2 * pad), (28, 28, 30))
    canvas.paste(img, (pad, pad))
    w, h = canvas.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    # tilt: pull the top-right in and push bottom-left out
    dst = [(120, 90), (w - 40, 10), (w - 150, h - 70), (10, h - 30)]
    try:
        coeffs = find_coeffs(src, dst)
        canvas = canvas.transform((w, h), Image.PERSPECTIVE, coeffs,
                                  Image.BICUBIC, fillcolor=(28, 28, 30))
    except Exception:
        canvas = canvas.rotate(-7, expand=False, fillcolor=(28, 28, 30))
    # glare: a bright soft diagonal blob
    glare = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glare)
    gd.ellipse([int(w * 0.45), int(h * 0.05), int(w * 1.05), int(h * 0.55)], fill=170)
    glare = glare.filter(ImageFilter.GaussianBlur(120))
    white = Image.new("RGB", (w, h), (255, 255, 255))
    canvas = Image.composite(white, canvas, glare)
    canvas = canvas.filter(ImageFilter.GaussianBlur(1.1))
    return canvas

def save(img, name):
    p = os.path.join(HERE, name)
    img.save(p, "PNG", optimize=True)
    print("wrote", os.path.relpath(p, os.path.dirname(HERE)), img.size)

def main():
    spirits = render_spirits(bad_warning=False)
    save(spirits, "01-old-tom-bourbon-compliant.png")
    save(render_spirits(bad_warning=True), "02-old-tom-bourbon-bad-warning.png")
    save(render_beer(), "03-cascade-summit-pale-ale-beer-no-abv.png")
    save(render_table_wine(), "04-stones-throw-table-wine.png")
    save(angled_glare(spirits), "05-old-tom-bourbon-angled-glare.png")

    csv = os.path.join(HERE, "EXPECTED.csv")
    rows = [
        ("filename", "brand", "classType", "abv", "netContents", "beverageType",
         "expectedOverall", "notes"),
        ("01-old-tom-bourbon-compliant.png", "Old Tom Distillery",
         "Kentucky Straight Bourbon Whiskey", "45% Alc./Vol. (90 Proof)", "750 mL",
         "spirits", "pass", "Baseline compliant spirits label (CONTEXT 5 sample)."),
        ("02-old-tom-bourbon-bad-warning.png", "Old Tom Distillery",
         "Kentucky Straight Bourbon Whiskey", "45% Alc./Vol. (90 Proof)", "750 mL",
         "spirits", "fail",
         "Title-case 'Government Warning:' prefix + reworded clauses -> warning FAIL + diff."),
        ("03-cascade-summit-pale-ale-beer-no-abv.png", "Cascade Summit", "Pale Ale",
         "", "12 fl oz", "beer", "pass",
         "Beer with NO ABV statement (optional for malt beverages) -> NOT failed."),
        ("04-stones-throw-table-wine.png", "Stone's Throw", "Table Wine", "",
         "750 mL", "wine", "review",
         "Label brand ALL CAPS STONE'S THROW vs expected Stone's Throw -> brand review; "
         "'Table Wine' in lieu of numeric ABV (7-14% class) -> ABV not missing."),
        ("05-old-tom-bourbon-angled-glare.png", "Old Tom Distillery",
         "Kentucky Straight Bourbon Whiskey", "45% Alc./Vol. (90 Proof)", "750 mL",
         "spirits", "pass",
         "Same values as #1 but tilted + glare + blur (Jenny bad-photo case); "
         "vision model handles it, may escalate to the deep tier on low confidence."),
    ]
    with open(csv, "w") as f:
        for r in rows:
            f.write(",".join('"' + c.replace('"', '""') + '"' for c in r) + "\n")
    print("wrote samples/EXPECTED.csv")

if __name__ == "__main__":
    main()
