#!/usr/bin/env python3
"""
Outline the TimelyCapsule wordmark.
    python3 design/.build-wordmark.py

Writes design/.wordmark-outlines.json — real glyph outlines for "Timely" (600)
and "Capsule" (400), shaped with HarfBuzz so kerning matches exactly what the
browser renders from the live <text> version.

WHY THIS EXISTS
    brand/IDENTITY.md §4 requires the wordmark be converted to outlines before
    production use: a live <text> element renders in a fallback face anywhere
    IBM Plex Sans is absent, which is most email clients, many PDF viewers and
    every partner's slide deck.

WHY THE OUTPUT IS COMMITTED
    The font is read from apps/web/.next's next/font/google cache, which is a
    build artifact and can be wiped at any time. Caching the outlines as JSON
    makes .build-brand.mjs self-contained and reproducible forever — the same
    permanence argument that chose an OFL family in the first place (04 §4).
    Re-run this only if the wordmark's letterforms, weights or tracking change.

Requires: fonttools, brotli, uharfbuzz  (pip install --user fonttools brotli uharfbuzz)
"""
import glob
import json
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
import uharfbuzz as hb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design", ".wordmark-outlines.json")

# ── setting, from brand/IDENTITY.md §4 ────────────────────────────────────
#   IBM Plex Sans · "Timely" 600 · "Capsule" 400 at 62% opacity · tracking −0.2
#
# Tracking is −0.2 SVG user units at font-size 26 in the live version, i.e.
# −0.2/26 em. Expressed here in em so it is size-independent and the outlined
# wordmark can be scaled to anything without the tracking drifting.
RUNS = [("Timely", 600), ("Capsule", 400)]
TRACKING_EM = -0.2 / 26


def find_font():
    """Locate the IBM Plex Sans variable woff2 in the Next font cache."""
    pats = [
        os.path.join(ROOT, "apps/web/.next/static/media/*.woff2"),
        os.path.join(ROOT, "apps/web/.next/**/*.woff2"),
    ]
    seen = set()
    for pat in pats:
        for path in sorted(glob.glob(pat, recursive=True)):
            if path in seen:
                continue
            seen.add(path)
            try:
                t = TTFont(path, lazy=True)
                names = {r.nameID: str(r) for r in t["name"].names if r.platformID == 3}
                family = names.get(16) or names.get(1, "")
                if family != "IBM Plex Sans" or "fvar" not in t:
                    continue
                cmap = t.getBestCmap()
                if all(ord(c) in cmap for c in "TimelyCapsule"):
                    return path, t
            except Exception:
                continue
    return None, None


def outline_run(blob, upm, text, weight, pen_x, tracking):
    """Shape one run at one weight and return (svg path, advance, ink bbox).

    HarfBuzz does the shaping — including GPOS kerning, which this family has
    and which a naive advance-width walk would silently drop. The outlines come
    from the same HarfBuzz variable instance that was shaped, so the letterforms
    and their positions can never disagree.

    Coordinates come back in SVG space: y is flipped, origin on the baseline.
    """
    face = hb.Face(blob)
    font = hb.Font(face)
    font.scale = (upm, upm)
    font.set_variations({"wght": weight})

    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf)

    paths = []
    bounds = BoundsPen(None)
    x = pen_x

    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        rec = RecordingPen()
        font.draw_glyph_with_pen(info.codepoint, rec)
        # Flip y into SVG space and translate onto the pen position.
        flip = (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)
        svg = SVGPathPen(None, ntos=lambda v: f"{round(v, 2):g}")
        rec.replay(TransformPen(svg, flip))
        rec.replay(TransformPen(bounds, flip))
        d = svg.getCommands()
        if d:
            paths.append(d)
        x += pos.x_advance + tracking

    bb = bounds.bounds or (0, 0, 0, 0)
    return "".join(paths), x, bb


def main():
    path, tt = find_font()
    if not path:
        sys.exit(
            "IBM Plex Sans variable woff2 not found in apps/web/.next.\n"
            "Run `pnpm dev` (or `pnpm build`) in apps/web once to populate the\n"
            "next/font cache, then re-run this script."
        )

    upm = tt["head"].unitsPerEm
    os2 = tt["OS/2"]
    cap_height = getattr(os2, "sCapHeight", None) or 700
    ascender = tt["hhea"].ascender
    descender = tt["hhea"].descender

    # HarfBuzz cannot read WOFF2 (it is not built with the decompressor), and
    # fails *silently* — every codepoint maps to .notdef with a upm/2 advance,
    # which looks like plausible output. Decompress to a real TTF via fontTools
    # (which has brotli) and hand HarfBuzz that instead.
    tmp_ttf = os.path.join(ROOT, "design", ".plex-sans-tmp.ttf")
    decomp = TTFont(path)
    decomp.flavor = None  # else fontTools re-compresses straight back to WOFF2
    decomp.save(tmp_ttf)
    try:
        blob = hb.Blob.from_file_path(tmp_ttf)
        if hb.Face(blob).glyph_count < 2:
            sys.exit("HarfBuzz loaded no glyphs — decompression produced a bad TTF.")

        tracking = TRACKING_EM * upm
        runs = []
        pen = 0.0
        ink = [float("inf"), float("inf"), float("-inf"), float("-inf")]
        for text, weight in RUNS:
            d, pen, bb = outline_run(blob, upm, text, weight, pen, tracking)
            if not d:
                sys.exit(f"No outline produced for {text!r} — shaping failed.")
            runs.append({"text": text, "weight": weight, "d": d})
            ink = [
                min(ink[0], bb[0]),
                min(ink[1], bb[1]),
                max(ink[2], bb[2]),
                max(ink[3], bb[3]),
            ]
    finally:
        if os.path.exists(tmp_ttf):
            os.remove(tmp_ttf)

    # The trailing tracking after the final glyph is advance, not ink. Drop it.
    advance = pen - tracking

    data = {
        "_comment": (
            "Generated by design/.build-wordmark.py — do not hand-edit. "
            "Coordinates are in font units (y already flipped to SVG space, "
            "origin at the baseline). Consumed by design/.build-brand.mjs."
        ),
        "source": os.path.relpath(path, ROOT),
        "family": "IBM Plex Sans",
        "unitsPerEm": upm,
        "capHeight": cap_height,
        "ascender": ascender,
        "descender": descender,
        "trackingEm": TRACKING_EM,
        "advance": round(advance, 2),
        # Ink bounds are already in SVG space: y-down, origin on the baseline,
        # so `y` is negative (the ink sits above the baseline).
        "ink": {
            "x": round(ink[0], 2),
            "y": round(ink[1], 2),
            "w": round(ink[2] - ink[0], 2),
            "h": round(ink[3] - ink[1], 2),
        },
        "runs": runs,
    }

    with open(OUT, "w") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")

    print(f"font      {data['source']}")
    print(f"upm       {upm}  capHeight {cap_height}")
    print(f"advance   {data['advance']}")
    print(f"ink       x{data['ink']['x']} y{data['ink']['y']} "
          f"{data['ink']['w']}×{data['ink']['h']}")
    for r in runs:
        print(f"  {r['text']:<8} wght {r['weight']}  {len(r['d'])} chars of path")
    print(f"wrote     {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
