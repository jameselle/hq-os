#!/usr/bin/env python3
"""HQ Studio's themed card kit: HyperFrames cards (1080x1920, full frame) in any of several looks.

Every card helper builds a theme-free spec; write_cards(G, outdir, theme="paper", ...) renders the specs in a
theme. A theme is a set of CSS variables (colours, type, window style, motion feel) plus a backdrop (the
scene behind the cards) and an optional device frame, so every card works in every theme:

    import sys; sys.path.insert(0, "<HQ>/templates/studio/themes")
    from kit import *
    G = {
        "hk": headline("hk", "This tool makes {unlimited} reels", icons=("doc", "spark"), pills=["in any style"]),
        "st": with_chip(stat_window("st", "Analytics", [("views", 900000)]), 1, 3, "Proof"),
    }
    write_cards(G, outdir, theme="gallery", durs={"hk": 3.1}, times={"hk": [("This", 0.0), ...]}, handle="@yourbrand")

Render each card dir with HyperFrames (`npx --yes hyperframes@0.8.137 render . -o card.mp4`). In the Studio spec,
set `"theme": "<same name>"` (captions and hook to match, see THEMES in lib/studio/brand.ts) and
`"captions": false` on cutaways for cards whose spec has captions=False (they show the spoken words).

Themes: see THEMES below and README.md. Content sits between y 300 and y 1280; Studio's captions sit below
(y ~1300 to 1415), the watermark at y ~1540. Nothing here names a business. No em or en dashes on screen.
"""
import hashlib
import html
import json
import math
import random
import re
import shutil
from pathlib import Path

KIT = Path(__file__).resolve().parent
TEMPLATE = KIT / "_template"
FONTS_DIR = KIT / "fonts"
# HyperFrames' component registry (installed with the plugin's marketplace); HF_REGISTRY overrides it.
import os
REGISTRY = Path(os.environ.get("HF_REGISTRY", str(Path.home() / ".claude/plugins/marketplaces/hyperframes/registry")))
W, H = 1080, 1920

FONTS = {
    # key: (file, family, weight range, style)
    "sans": (Path("/System/Library/Fonts/SFNS.ttf"), "PSans", "100 1000", "normal"),
    "mono": (Path("/System/Library/Fonts/SFNSMono.ttf"), "PMono", "100 1000", "normal"),
    "serif-i": (FONTS_DIR / "InstrumentSerif-Italic.ttf", "PSerifI", "400", "italic"),
    "serif": (FONTS_DIR / "InstrumentSerif-Regular.ttf", "PSerif", "400", "normal"),
    "hand": (FONTS_DIR / "Caveat.ttf", "PHand", "400 700", "normal"),
    "comic": (FONTS_DIR / "ComicNeue-Bold.ttf", "PComic", "700", "normal"),
    "cond": (FONTS_DIR / "BebasNeue-Regular.ttf", "PCond", "400", "normal"),
    "georgia": (Path("/System/Library/Fonts/Supplemental/Georgia.ttf"), "PGeorgia", "400", "normal"),
    "georgia-b": (Path("/System/Library/Fonts/Supplemental/Georgia Bold.ttf"), "PGeorgia", "700", "normal"),
}

# ------------------------------------------------------------------------------------------------ themes
# Tokens become CSS variables (--ink, --accent ...). Keep each theme's colours in step with its entry in
# THEMES in lib/studio/brand.ts (captions and hook), which tests/paper-kit.test.ts checks.

_COMMON = {
    "good": "#2FA866", "bad": "#D9483B", "accent-ink": "#FFFFFF", "card": "#FFFFFF", "tile": "#FFFFFF",
    "card-shadow": "0 18px 40px rgba(120,80,40,0.14)", "mark-bg": "rgba(255,255,255,0.38)",
    "head-family": '"PSans"', "head-weight": "820", "head-style": "normal", "head-case": "none", "head-track": "-0.02em",
    "head-scale": "1", "head-lh": "1.06", "body-family": '"PSans"',
    "win-radius": "30px", "win-border": "0 0 0 1px rgba(0,0,0,0.25)", "dots": "flex",
    "enter-tilt": "9", "enter-blur": "18", "win-rise": "90", "hold-zoom": "1.018",
}

THEMES = {
    "paper": {
        "about": "Warm cream paper, a line-art street drawing itself in, dark sentence-case grotesk, a terracotta accent, dark app windows.",
        "backdrop": "skyline", "frame": None, "fonts": ["sans", "mono"], "strip": True, "master": "#F1E9DC",
        "tokens": {**_COMMON,
            "page": "#F1E9DC", "page-hi": "#F8F3EA", "page-lo": "#E8DDCB", "ink": "#1C1A17", "muted": "#ABA396",
            "soft": "#8A8276", "accent": "#D2613A", "glow": "rgba(210,97,58,0.42)", "line": "#C4AD8C", "icon": "#1C1A17",
            "card-text": "#1C1A17", "mark": "#8F8577",
            "win": "#232120", "win-bar": "#2C2A28", "win-tile": "#2F2C2A", "win-text": "#ECE7DF", "win-dim": "#9C958A",
            "win-line": "rgba(255,255,255,0.07)", "win-shadow": "0 46px 90px rgba(70,45,20,0.30)",
            "code-bg": "#232120", "code-bar": "#2C2A28", "code-text": "#ECE7DF", "code-str": "#EBCB9C", "code-dim": "#7E776D",
            "bar-dim": "#6B6660", "strip": "#FBF7EF"},
    },
    "gallery": {
        "about": "A pale grey studio with soft folds of light, floating white UI cards, big italic serif capitals, chapter chips (01 / 05).",
        "backdrop": "studio", "frame": None, "fonts": ["sans", "mono", "serif-i"], "strip": False, "master": "#F2F1ED",
        "tokens": {**_COMMON,
            "page": "#F2F1ED", "page-hi": "#F8F7F4", "page-lo": "#E6E5E1", "ink": "#121212", "muted": "#C4C2BD",
            "soft": "#8E8C88", "accent": "#2F5BEA", "glow": "rgba(47,91,234,0.30)", "line": "#D9D7D2", "icon": "#121212",
            "card-text": "#121212", "mark": "#9A9893", "mark-bg": "rgba(255,255,255,0.6)",
            "head-family": '"PSerifI"', "head-weight": "400", "head-style": "italic", "head-case": "uppercase",
            "head-track": "-0.005em", "head-scale": "1.22", "head-lh": "0.98",
            "card-shadow": "0 22px 50px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
            "win": "#FFFFFF", "win-bar": "#FFFFFF", "win-tile": "#F5F4F1", "win-text": "#161616", "win-dim": "#8E8C88",
            "win-line": "rgba(0,0,0,0.06)", "win-shadow": "0 30px 70px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)",
            "win-radius": "22px", "win-border": "0 0 0 1px rgba(0,0,0,0.06)", "dots": "none",
            "code-bg": "#0D0F14", "code-bar": "#0D0F14", "code-text": "#E8EAF0", "code-str": "#9CC6FF", "code-dim": "#6B7280",
            "bar-dim": "#D4D2CD", "enter-tilt": "0", "enter-blur": "22", "win-rise": "50"},
    },
    "desk": {
        "about": "A dark espresso room under a spotlight, a laptop whose screen walks through the steps, hand-drawn red arrows, white words.",
        "backdrop": "spotlight", "frame": "laptop", "fonts": ["sans", "mono"], "strip": False, "master": "#150E0A",
        "tokens": {**_COMMON,
            "page": "#150E0A", "page-hi": "#3B2A20", "page-lo": "#0E0A08", "ink": "#FFFFFF", "muted": "#6E655E",
            "soft": "#B8AEA5", "accent": "#E5483B", "glow": "rgba(229,72,59,0.40)", "line": "#3A2C23", "icon": "#1C1A17",
            "card-text": "#1C1A17", "mark": "rgba(255,255,255,0.55)", "mark-bg": "rgba(255,255,255,0.06)",
            "head-weight": "800", "head-track": "-0.015em",
            "card-shadow": "0 24px 60px rgba(0,0,0,0.55)",
            "win": "#FAF9F5", "win-bar": "#EFEDE8", "win-tile": "#F1EFEA", "win-text": "#1C1A17", "win-dim": "#8A857D",
            "win-line": "rgba(0,0,0,0.07)", "win-shadow": "0 50px 120px rgba(0,0,0,0.6)", "win-radius": "10px",
            "win-border": "none", "code-bg": "#FAF9F5", "code-bar": "#EFEDE8", "code-text": "#1C1A17", "code-str": "#A0522D",
            "code-dim": "#9A948B", "bar-dim": "#C9C5BD", "enter-tilt": "0", "enter-blur": "10", "win-rise": "420",
            "hold-zoom": "1.05"},
    },
    "terminal": {
        "about": "A green-tinted near-black, white sentence case with the keyword huge in heavy green capitals, mono header and a progress bar, line icons.",
        "backdrop": "terminal", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#121713", "mark": False,
        "tokens": {**_COMMON,
            "page": "#121713", "page-hi": "#16201A", "page-lo": "#0D110E", "ink": "#F2F2F2", "muted": "#3B453E",
            "soft": "#9AA59D", "accent": "#5EEC84", "accent-ink": "#0D110E", "glow": "rgba(94,236,132,0.25)", "line": "#2A3A2E",
            "icon": "#5EEC84", "card": "#1B231D", "card-text": "#F2F2F2", "tile": "#1B231D", "mark": "#6B776E",
            "card-shadow": "0 0 0 1px rgba(94,236,132,0.18)", "head-weight": "560", "head-track": "-0.01em",
            "win": "#000000", "win-bar": "#0A0D0B", "win-tile": "#111712", "win-text": "#F2F2F2", "win-dim": "#6B776E",
            "win-line": "rgba(94,236,132,0.10)", "win-shadow": "0 0 0 1px rgba(94,236,132,0.25)", "win-radius": "14px",
            "win-border": "0 0 0 0 transparent", "code-bg": "#000000", "code-bar": "#0A0D0B", "code-text": "#F2F2F2",
            "code-str": "#A5E3B7", "code-dim": "#4B574E", "bar-dim": "#2E3A31", "enter-tilt": "0", "enter-blur": "8", "win-rise": "40"},
        "css": """
.big .ac { display: block; font-family: "PSans"; font-weight: 950; text-transform: uppercase; font-size: 1.9em; letter-spacing: -0.03em; line-height: 1.02; margin: 6px 0; }
.dots b { background: #3B453E !important; }
#hdr { position: absolute; left: 70px; right: 70px; top: 200px; display: flex; justify-content: space-between; align-items: center;
  font-family: "PMono"; font-size: 26px; letter-spacing: 0.2em; color: var(--mark); text-transform: uppercase; }
#hdr b { color: var(--accent); font-weight: 600; }
#prog { position: absolute; left: 70px; right: 70px; top: 1460px; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
#prog i { display: block; height: 100%; background: var(--accent); transform-origin: 0 50%; }
""",
    },
    "chart": {
        "about": "An editorial grey page with fine grain, a short red flag bar over every title, red against ink-blue data, no app chrome.",
        "backdrop": "grain", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#E4E4E4",
        "tokens": {**_COMMON,
            "page": "#E4E4E4", "page-hi": "#EAEAEA", "page-lo": "#DCDCDC", "ink": "#121212", "muted": "#B5B5B5",
            "soft": "#6E6E6E", "accent": "#C13442", "glow": "rgba(193,52,66,0.0)", "line": "#C8C8DC", "icon": "#2A2CA7",
            "card": "#F2F2F2", "card-text": "#121212", "mark": "#6E6E6E", "mark-bg": "rgba(255,255,255,0.4)",
            "card-shadow": "0 0 0 1px rgba(0,0,0,0.08)", "head-weight": "800", "head-track": "-0.02em",
            "win": "transparent", "win-bar": "transparent", "win-tile": "rgba(255,255,255,0.45)", "win-text": "#121212", "win-dim": "#6E6E6E",
            "win-line": "rgba(0,0,0,0.12)", "win-shadow": "0 0 0 0 transparent", "win-radius": "0px", "win-border": "0 0 0 0 transparent",
            "dots": "none", "code-bg": "#F2F2F2", "code-bar": "#F2F2F2", "code-text": "#121212", "code-str": "#2A2CA7",
            "code-dim": "#8A8A8A", "bar-dim": "#2A2CA7", "good": "#2A2CA7", "caption-ink": "#FFFFFF", "enter-tilt": "0", "enter-blur": "6", "win-rise": "30", "hold-zoom": "1.0"},
        "css": """
.bar { background: none; border: 0; height: auto; justify-content: flex-start; padding: 26px 0 18px; }
.bar::before { content: ""; position: absolute; left: 52px; top: 0; width: 64px; height: 10px; background: var(--accent); }
.ttl { flex: none; text-align: left; padding-left: 52px; font-size: 40px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; }
.ttl em { display: none; }
.win.code { background: var(--code-bg); border-radius: 6px; }
.stat, .chart { border-radius: 4px; }
""",
    },
    "glass": {
        "about": "A soft lavender gradient with drifting colour, frosted glass cards with a white rim, light grotesk words sharpening out of a blur.",
        "backdrop": "aurora", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#EEE9F8",
        "tokens": {**_COMMON,
            "page": "#EEE9F8", "page-hi": "#F7F3FF", "page-lo": "#E2DBEF", "ink": "#111111", "muted": "#BFBADE",
            "soft": "#7D7896", "accent": "#6E3AF0", "glow": "rgba(110,58,240,0.30)", "line": "#D3CBEA", "icon": "#111111",
            "card": "rgba(255,255,255,0.55)", "card-text": "#111111", "tile": "rgba(255,255,255,0.6)", "mark": "#6F6987", "mark-bg": "rgba(255,255,255,0.45)",
            "card-shadow": "0 20px 50px rgba(90,60,160,0.14), inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1.5px rgba(255,255,255,0.75)",
            "head-weight": "430", "head-track": "-0.035em", "head-lh": "1.04",
            "win": "rgba(255,255,255,0.42)", "win-bar": "rgba(255,255,255,0.35)", "win-tile": "rgba(255,255,255,0.5)", "win-text": "#111111",
            "win-dim": "#7D7896", "win-line": "rgba(110,90,170,0.12)",
            "win-shadow": "0 30px 80px rgba(90,60,160,0.18), inset 0 1px 0 rgba(255,255,255,0.95)", "win-radius": "34px",
            "win-border": "0 0 0 1.5px rgba(255,255,255,0.8)", "code-bg": "rgba(20,14,40,0.82)", "code-bar": "rgba(20,14,40,0.82)",
            "code-text": "#F1EEFF", "code-str": "#C9B8FF", "code-dim": "#8A84A8", "bar-dim": "#CFC6EA", "enter-tilt": "0", "enter-blur": "26", "win-rise": "60"},
        "css": """
.win, .tile, .pill, #chip div { backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); }
""",
    },
    "neon": {
        "about": "Violet-black, white hairline geometry (a square tunnel, light rays, a glowing dot), gradient light in violet, magenta and sky, white words that glow.",
        "backdrop": "neon", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#05000B",
        "tokens": {**_COMMON,
            "page": "#05000B", "page-hi": "#140726", "page-lo": "#030007", "ink": "#FFFFFF", "muted": "#4A3A63",
            "soft": "#B9A9D6", "accent": "#A78BFA", "accent-ink": "#05000B", "glow": "rgba(167,139,250,0.55)", "line": "rgba(255,255,255,0.22)",
            "icon": "#FFFFFF", "card": "rgba(255,255,255,0.06)", "card-text": "#FFFFFF", "tile": "rgba(255,255,255,0.08)",
            "mark": "rgba(255,255,255,0.5)", "mark-bg": "rgba(255,255,255,0.05)",
            "card-shadow": "0 0 0 1px rgba(255,255,255,0.18), 0 0 40px rgba(110,10,201,0.35)", "head-weight": "640", "head-track": "-0.02em",
            "win": "rgba(14,7,24,0.85)", "win-bar": "rgba(255,255,255,0.04)", "win-tile": "rgba(255,255,255,0.05)", "win-text": "#FFFFFF",
            "win-dim": "#8E7FB0", "win-line": "rgba(255,255,255,0.08)",
            "win-shadow": "0 0 0 1px rgba(255,255,255,0.16), 0 0 80px rgba(110,10,201,0.40)", "win-radius": "22px",
            "win-border": "0 0 0 0 transparent", "code-bg": "rgba(14,7,24,0.9)", "code-bar": "rgba(255,255,255,0.04)", "code-text": "#FFFFFF",
            "code-str": "#F0A3C8", "code-dim": "#6B5C8A", "bar-dim": "#3B2A5C", "enter-tilt": "0", "enter-blur": "20", "win-rise": "50", "hold-zoom": "1.03"},
        "css": """
.big, .lead, #nb { text-shadow: 0 0 18px rgba(167,139,250,0.55), 0 0 2px rgba(255,255,255,0.6); }
.big .ac { background: linear-gradient(90deg, #6E0AC9, #E42F7D 55%, #3C8DF4); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; text-shadow: none; filter: drop-shadow(0 0 14px rgba(228,47,125,0.45)); }
""",
    },
    "doodle": {
        "about": "Hand-drawn diagrams on near-white: wobbly ink outlines, handwritten words, flat blue, red and tan fills that pop in one at a time.",
        "backdrop": "doodle", "frame": None, "fonts": ["sans", "mono", "hand"], "strip": False, "master": "#F9F9F9",
        "tokens": {**_COMMON,
            "page": "#F9F9F9", "page-hi": "#F9F9F9", "page-lo": "#F9F9F9", "ink": "#1A1917", "muted": "#C9C5BE",
            "soft": "#6E6A63", "accent": "#2F6FD6", "glow": "rgba(47,111,214,0)", "line": "#A0A0A0", "icon": "#1A1917",
            "card": "#FFFFFF", "card-text": "#1A1917", "tile": "#FFFFFF", "mark": "#8A867E", "mark-bg": "rgba(0,0,0,0.04)",
            "card-shadow": "0 0 0 4px #1A1917", "head-family": '"PHand"', "head-weight": "700", "head-track": "0",
            "head-scale": "1.3", "head-lh": "1.0",
            "win": "#FFFFFF", "win-bar": "#FFFFFF", "win-tile": "#F3F1EC", "win-text": "#1A1917", "win-dim": "#6E6A63",
            "win-line": "rgba(26,25,23,0.15)", "win-shadow": "0 0 0 0 transparent", "win-radius": "18px", "win-border": "0 0 0 0 transparent",
            "dots": "none", "code-bg": "#FFFFFF", "code-bar": "#FFFFFF", "code-text": "#1A1917", "code-str": "#C42C40", "code-dim": "#8A867E",
            "bar-dim": "#B9AB8E", "good": "#3CB44B", "bad": "#C42C40", "enter-tilt": "0", "enter-blur": "0", "win-rise": "20", "hold-zoom": "1.0"},
        "css": """
.win, .tile, #vl, #vr, #box { position: relative; }
.win::after, .tile::after { content: ""; position: absolute; inset: 0; border: 5px solid var(--ink); border-radius: inherit; filter: url(#wob); pointer-events: none; }
.ttl { font-family: "PHand"; font-size: 44px; font-weight: 700; color: var(--ink); }
.lead, .ttl, .blab, #lb { font-family: "PHand"; font-weight: 700; }
.lead { font-size: 58px; }
""",
    },
    "vivid": {
        "about": "A new saturated gradient behind every card, a soft glowing portal, flat white panels, and accent words slapped on as tilted yellow sticker tags.",
        "backdrop": "vivid", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#340050",
        "tokens": {**_COMMON,
            "page": "#340050", "page-hi": "#4A1080", "page-lo": "#1464AC", "ink": "#FFFFFF", "muted": "rgba(255,255,255,0.35)",
            "soft": "rgba(255,255,255,0.8)", "accent": "#F6F20A", "accent-ink": "#2A1240", "glow": "rgba(246,242,10,0.35)", "line": "rgba(255,255,255,0.3)",
            "icon": "#2A1240", "card": "#FFFFFF", "card-text": "#2A1240", "tile": "#FFFFFF", "mark": "rgba(255,255,255,0.75)", "mark-bg": "rgba(0,0,0,0.15)",
            "card-shadow": "0 18px 40px rgba(20,0,40,0.35)", "head-weight": "900", "head-case": "uppercase", "head-track": "-0.01em",
            "win": "#FFFFFF", "win-bar": "#F4F0FA", "win-tile": "#F1EDF8", "win-text": "#2A1240", "win-dim": "#7A6A90",
            "win-line": "rgba(42,18,64,0.08)", "win-shadow": "0 30px 70px rgba(20,0,40,0.4)", "win-radius": "28px",
            "win-border": "0 0 0 0 transparent", "dots": "none", "code-bg": "#1A0A30", "code-bar": "#1A0A30", "code-text": "#FFFFFF",
            "code-str": "#13F9EF", "code-dim": "#8A7AA8", "bar-dim": "#C9BEDA", "enter-tilt": "0", "enter-blur": "10", "hold-zoom": "1.04"},
        "css": """
.big .ac { background: var(--accent); color: var(--accent-ink) !important; padding: 0 16px 4px; border-radius: 6px; rotate: -4deg; box-shadow: 0 10px 24px rgba(0,0,0,0.25); }
.ic-a { fill: #E43F7D; } .ic-as { stroke: #E43F7D; }
""",
    },
    "letterbox": {
        "about": "A plain white page, a casual hand-lettered title that stays on screen, and everything happening inside one 16:9 band in the middle, with red pen marks.",
        "backdrop": "letterbox", "frame": "band", "fonts": ["sans", "mono", "comic"], "strip": False, "master": "#FFFFFF", "mark": False,
        "tokens": {**_COMMON,
            "page": "#FFFFFF", "page-hi": "#FFFFFF", "page-lo": "#FFFFFF", "ink": "#111111", "muted": "#C8C8C8",
            "soft": "#666666", "accent": "#CC000C", "glow": "rgba(204,0,12,0)", "line": "#DDDDDD", "icon": "#111111",
            "card": "#FFFFFF", "card-text": "#111111", "tile": "#FFFFFF", "mark": "#999999",
            "card-shadow": "0 0 0 3px #111111", "head-family": '"PComic"', "head-weight": "700", "head-track": "0", "head-scale": "1.05",
            "win": "#FFFFFF", "win-bar": "#F2F2F2", "win-tile": "#F5F5F5", "win-text": "#111111", "win-dim": "#777777",
            "win-line": "rgba(0,0,0,0.1)", "win-shadow": "0 0 0 3px #111111", "win-radius": "8px", "win-border": "0 0 0 0 transparent",
            "code-bg": "#FFFFFF", "code-bar": "#F2F2F2", "code-text": "#111111", "code-str": "#CC000C", "code-dim": "#888888",
            "bar-dim": "#BBBBBB", "enter-tilt": "0", "enter-blur": "0", "win-rise": "30", "hold-zoom": "1.0"},
    },
    "lab": {
        "about": "Pure black and a slow field of points, hairline-framed plots whose lines trace in a violet to yellow ramp, elegant serif titles, a power-of-ten scale bar.",
        "backdrop": "lab", "frame": None, "fonts": ["sans", "mono", "serif"], "strip": False, "master": "#000000",
        "tokens": {**_COMMON,
            "page": "#000000", "page-hi": "#06080A", "page-lo": "#000000", "ink": "#FFFFFF", "muted": "#3A3A3A",
            "soft": "#A8A8A8", "accent": "#F8F878", "accent-ink": "#000000", "glow": "rgba(248,248,120,0.25)", "line": "#848483",
            "icon": "#FFFFFF", "card": "rgba(255,255,255,0.04)", "card-text": "#FFFFFF", "tile": "rgba(255,255,255,0.05)", "mark": "#777777", "mark-bg": "rgba(255,255,255,0.04)",
            "card-shadow": "0 0 0 1px #848483", "head-family": '"PSerif"', "head-weight": "400", "head-track": "-0.01em", "head-scale": "1.2",
            "win": "rgba(0,0,0,0.6)", "win-bar": "transparent", "win-tile": "rgba(255,255,255,0.03)", "win-text": "#FFFFFF", "win-dim": "#A8A8A8",
            "win-line": "rgba(255,255,255,0.1)", "win-shadow": "0 0 0 1px #848483", "win-radius": "4px", "win-border": "0 0 0 0 transparent",
            "dots": "none", "code-bg": "#000000", "code-bar": "transparent", "code-text": "#E8E8E8", "code-str": "#5DC863", "code-dim": "#666666",
            "bar-dim": "#3B528B", "good": "#5DC863", "enter-tilt": "0", "enter-blur": "6", "win-rise": "20", "hold-zoom": "1.0"},
        "css": """
#cl { stroke: url(#vir) !important; }
.ttl { font-family: "PSerif"; font-size: 34px; font-weight: 400; color: var(--win-dim); }
.bcol:last-child .bfill { background: linear-gradient(0deg, #21918C, #FDE725) !important; box-shadow: 0 0 40px rgba(93,200,99,0.35) !important; }
""",
    },
    "brief": {
        "about": "A black read-post: a rounded image card up top, short bold paragraphs underneath, the figures picked out in cyan. Made to be paused and read.",
        "backdrop": "none", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#000000",
        "tokens": {**_COMMON,
            "page": "#000000", "page-hi": "#000000", "page-lo": "#000000", "ink": "#FCFCFC", "muted": "#3C3C3C",
            "soft": "#A8A8A8", "accent": "#84F8F8", "accent-ink": "#000000", "glow": "rgba(132,248,248,0.2)", "line": "#222222",
            "icon": "#FCFCFC", "card": "#141414", "card-text": "#FCFCFC", "tile": "#141414", "mark": "#666666", "mark-bg": "rgba(255,255,255,0.04)",
            "card-shadow": "0 0 0 1px #262626", "head-weight": "700", "head-track": "-0.015em",
            "win": "#0E0E0E", "win-bar": "#141414", "win-tile": "#161616", "win-text": "#FCFCFC", "win-dim": "#8A8A8A",
            "win-line": "rgba(255,255,255,0.07)", "win-shadow": "0 0 0 1px #262626", "win-radius": "17px", "win-border": "0 0 0 0 transparent",
            "code-bg": "#0E0E0E", "code-bar": "#141414", "code-text": "#FCFCFC", "code-str": "#84F8F8", "code-dim": "#666666",
            "bar-dim": "#3C3C3C", "enter-tilt": "0", "enter-blur": "6", "win-rise": "20", "hold-zoom": "1.0"},
    },
    "pills": {
        "about": "Near-black graph paper, every headline and list item a rounded pill: yellow with black words, white for the accent. Quick pops, no running chrome.",
        "backdrop": "pills", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#060606",
        "tokens": {**_COMMON,
            "page": "#060606", "page-hi": "#060606", "page-lo": "#060606", "ink": "#FCFCFC", "muted": "#3A3A3A",
            "soft": "#BDBDBD", "accent": "#F0D43C", "accent-ink": "#000000", "glow": "rgba(240,212,60,0.25)", "line": "#181818",
            "icon": "#000000", "card": "#FCFCFC", "card-text": "#000000", "tile": "#F0D43C", "mark": "#777777", "mark-bg": "rgba(255,255,255,0.05)",
            "card-shadow": "0 10px 30px rgba(0,0,0,0.5)", "head-weight": "900", "head-track": "-0.01em",
            "win": "transparent", "win-bar": "transparent", "win-tile": "#111111", "win-text": "#FCFCFC", "win-dim": "#BDBDBD",
            "win-line": "transparent", "win-shadow": "0 0 0 0 transparent", "win-radius": "0", "win-border": "0 0 0 0 transparent",
            "dots": "none", "code-bg": "#111111", "code-bar": "#111111", "code-text": "#FCFCFC", "code-str": "#F0D43C", "code-dim": "#777777", "caption-ink": "#000000",
            "bar-dim": "#FCFCFC", "enter-tilt": "0", "enter-blur": "0", "win-rise": "30", "hold-zoom": "1.0"},
        "css": """
#hl.big, #bg2.big, #tt.big { background: var(--accent); color: #000; border-radius: 80px; padding: 18px 48px 24px; display: inline-block; box-shadow: 0 14px 40px rgba(0,0,0,0.5); }
.big .ac { background: #FCFCFC; color: #000 !important; border-radius: 40px; padding: 0 18px; }
.ttl { flex: none; margin: 0 auto; background: var(--accent); color: #000; font-size: 40px; font-weight: 900; padding: 10px 34px; border-radius: 60px; }
.ttl em { display: none; }
.bar { background: none; border: 0; height: auto; padding: 0 0 18px; }
.row { background: #FCFCFC; color: #000; border-radius: 60px; padding: 18px 30px; margin: 14px 0; border: 0; font-weight: 850; }
.tile .ic-a { fill: #000; } .tile .ic-as { stroke: #000; }
""",
    },
    "chat": {
        "about": "A messenger thread as the whole frame: an avatar header, grey and blue bubbles, typing dots, the keyboard typing your replies.",
        "backdrop": "none", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#FFFFFF", "mark": False,
        "tokens": {**_COMMON,
            "page": "#FFFFFF", "page-hi": "#FFFFFF", "page-lo": "#FFFFFF", "ink": "#000000", "muted": "#C7C7CC",
            "soft": "#8E8E93", "accent": "#1F7FEA", "glow": "rgba(31,127,234,0.2)", "line": "#E5E5EA", "icon": "#000000",
            "card": "#F2F2F7", "card-text": "#000000", "tile": "#F2F2F7", "mark": "#8E8E93",
            "card-shadow": "0 0 0 1px rgba(0,0,0,0.06)", "head-weight": "760",
            "win": "#FFFFFF", "win-bar": "#F7F7F7", "win-tile": "#F2F2F7", "win-text": "#000000", "win-dim": "#8E8E93",
            "win-line": "rgba(0,0,0,0.08)", "win-shadow": "0 20px 50px rgba(0,0,0,0.10)", "win-radius": "24px",
            "win-border": "0 0 0 1px rgba(0,0,0,0.06)", "code-bg": "#1C1C1E", "code-bar": "#2C2C2E", "code-text": "#FFFFFF",
            "code-str": "#64D2FF", "code-dim": "#8E8E93", "bar-dim": "#D1D1D6", "good": "#34C759", "bad": "#FF3B30",
            "enter-tilt": "0", "enter-blur": "6", "win-rise": "30", "hold-zoom": "1.0"},
    },
    "post": {
        "about": "A quiet repost frame on black: an avatar, name and badge, a serif hook above a picture, the serif payoff below. One read, then the loop.",
        "backdrop": "none", "frame": None, "fonts": ["sans", "mono", "georgia", "georgia-b"], "strip": False, "master": "#000000", "mark": False,
        "tokens": {**_COMMON,
            "page": "#000000", "page-hi": "#000000", "page-lo": "#000000", "ink": "#FFFFFF", "muted": "#3A3A3A",
            "soft": "#8B8B8B", "accent": "#3B82F6", "glow": "rgba(59,130,246,0.25)", "line": "#222222", "icon": "#FFFFFF",
            "card": "#111111", "card-text": "#FFFFFF", "tile": "#111111", "mark": "#666666",
            "card-shadow": "0 0 0 1px #222222", "head-family": '"PGeorgia"', "head-weight": "400", "head-track": "0", "head-scale": "0.85", "head-lh": "1.25",
            "win": "#0B0B0B", "win-bar": "#111111", "win-tile": "#141414", "win-text": "#FFFFFF", "win-dim": "#8B8B8B",
            "win-line": "rgba(255,255,255,0.07)", "win-shadow": "0 0 0 1px #222222", "win-radius": "14px", "win-border": "0 0 0 0 transparent",
            "code-bg": "#0B0B0B", "code-bar": "#111111", "code-text": "#FFFFFF", "code-str": "#93C5FD", "code-dim": "#666666",
            "bar-dim": "#333333", "enter-tilt": "0", "enter-blur": "4", "win-rise": "20", "hold-zoom": "1.0"},
    },
    "poster": {
        "about": "A dark textured cheat sheet made to be saved: condensed capitals in white and yellow, icon rows split by yellow rules, the key word in yellow.",
        "backdrop": "poster", "frame": None, "fonts": ["sans", "mono", "cond"], "strip": False, "master": "#0D1014",
        "tokens": {**_COMMON,
            "page": "#0D1014", "page-hi": "#1C1D22", "page-lo": "#060709", "ink": "#FFFFFF", "muted": "#3A3B40",
            "soft": "#C9C9C9", "accent": "#FDFD54", "accent-ink": "#000000", "glow": "rgba(253,253,84,0.25)", "line": "rgba(251,251,35,0.7)",
            "icon": "#FFFFFF", "card": "#16171B", "card-text": "#FFFFFF", "tile": "#16171B", "mark": "#8A8A8A", "mark-bg": "rgba(255,255,255,0.05)",
            "card-shadow": "0 0 0 1px rgba(251,251,35,0.35)", "head-family": '"PCond"', "head-weight": "400", "head-case": "uppercase",
            "head-track": "0.01em", "head-scale": "1.3", "head-lh": "0.95",
            "win": "#121317", "win-bar": "#16171B", "win-tile": "#1A1B20", "win-text": "#FFFFFF", "win-dim": "#9A9A9A",
            "win-line": "rgba(251,251,35,0.35)", "win-shadow": "0 0 0 1px rgba(251,251,35,0.3)", "win-radius": "10px",
            "win-border": "0 0 0 0 transparent", "dots": "none", "code-bg": "#121317", "code-bar": "#16171B", "code-text": "#FFFFFF",
            "code-str": "#FDFD54", "code-dim": "#777777", "bar-dim": "#3A3B40", "enter-tilt": "0", "enter-blur": "4", "win-rise": "20", "hold-zoom": "1.0"},
        "css": """
.ttl { font-family: "PCond"; font-size: 46px; font-weight: 400; color: var(--accent); letter-spacing: 0.04em; }
.ttl em { display: none; }
""",
    },
    "page": {
        "about": "A printed page under a lamp that switches on: off-white paper with grain, black serif, bold labels with one-line answers, a plain caption bar on top.",
        "backdrop": "lamp", "frame": None, "fonts": ["sans", "mono", "georgia", "georgia-b"], "strip": False, "master": "#EDECE8",
        "tokens": {**_COMMON,
            "page": "#EDECE8", "page-hi": "#F2F1ED", "page-lo": "#DCDAD3", "ink": "#111111", "muted": "#B5B0A5",
            "soft": "#5E5A52", "accent": "#8B1E1E", "glow": "rgba(139,30,30,0)", "line": "#CFCBC2", "icon": "#111111",
            "card": "#F6F5F1", "card-text": "#111111", "tile": "#F6F5F1", "mark": "#8A867E", "mark-bg": "rgba(0,0,0,0.04)",
            "card-shadow": "0 0 0 1px rgba(0,0,0,0.12)", "head-family": '"PGeorgia"', "head-weight": "700", "head-track": "-0.01em", "head-scale": "0.9",
            "win": "#F6F5F1", "win-bar": "#EDECE8", "win-tile": "#EFEDE7", "win-text": "#111111", "win-dim": "#6E6A62",
            "win-line": "rgba(0,0,0,0.1)", "win-shadow": "0 0 0 1px rgba(0,0,0,0.15)", "win-radius": "2px", "win-border": "0 0 0 0 transparent",
            "dots": "none", "code-bg": "#F6F5F1", "code-bar": "#EDECE8", "code-text": "#111111", "code-str": "#8B1E1E", "code-dim": "#8A867E",
            "bar-dim": "#B5B0A5", "enter-tilt": "0", "enter-blur": "0", "win-rise": "10", "hold-zoom": "1.0"},
        "css": """
.ttl { font-family: "PGeorgia"; font-weight: 700; font-size: 36px; color: var(--ink); }
.lead { font-family: "PGeorgia"; font-weight: 400; }
""",
    },
    "canvas": {
        "about": "A design editor as the stage: a white artboard on grey, every card selected with blue handles by a cursor, a toolbar and a keyframe timeline whose playhead runs.",
        "backdrop": "editor", "frame": None, "fonts": ["sans", "mono"], "strip": False, "master": "#EDEDED",
        "tokens": {**_COMMON,
            "page": "#EDEDED", "page-hi": "#F2F2F2", "page-lo": "#E6E6E6", "ink": "#111111", "muted": "#C2C2C2",
            "soft": "#7A7A7A", "accent": "#0B84E0", "glow": "rgba(11,132,224,0.25)", "line": "#D6D6D6", "icon": "#111111",
            "card": "#FFFFFF", "card-text": "#111111", "mark": "#9A9A9A", "mark-bg": "rgba(255,255,255,0.7)",
            "card-shadow": "0 10px 30px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)", "head-weight": "760",
            "win": "#FFFFFF", "win-bar": "#FAFAFA", "win-tile": "#F5F5F5", "win-text": "#111111", "win-dim": "#8A8A8A",
            "win-line": "rgba(0,0,0,0.07)", "win-shadow": "0 18px 40px rgba(0,0,0,0.10)", "win-radius": "16px",
            "win-border": "0 0 0 1px rgba(0,0,0,0.08)", "code-bg": "#1E1E1E", "code-bar": "#252525", "code-text": "#EDEDED",
            "code-str": "#F2C94C", "code-dim": "#777777", "bar-dim": "#DFDEEB", "good": "#14AE5C", "enter-tilt": "0", "enter-blur": "10",
            "win-rise": "40", "hold-zoom": "1.0"},
        "css": """
#mark { top: 1395px; }
""",
    },
}

DASH = re.compile("[–—]")


def _no_dash(*texts):
    for t in texts:
        if t and DASH.search(str(t)):
            raise ValueError(f"no em or en dashes on screen: {t!r}")


def _seed(gid):
    return int(hashlib.sha1(gid.encode()).hexdigest()[:8], 16)


def esc(t):
    return html.escape(str(t), quote=True)


# ------------------------------------------------------------------------------------------------ page

BASE_CSS = """
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--page); }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--page);
  font-family: var(--body-family), "Helvetica Neue", sans-serif; font-weight: 760; color: var(--ink); letter-spacing: -0.012em; }
#scene { position: absolute; inset: 0; perspective: 1600px; }
#bg { position: absolute; inset: 0; background: radial-gradient(85% 55% at 50% 36%, var(--page-hi) 0%, var(--page) 62%, var(--page-lo) 100%); }
#grain { position: absolute; inset: 0; opacity: 0.22; mix-blend-mode: multiply; }
#birds, #city { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; overflow: visible; }
#birds path { fill: none; stroke: var(--line); stroke-width: 2.4; stroke-linecap: round; }
#city .dr { fill: none; stroke: var(--line); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
#mark { position: absolute; left: 0; right: 0; top: 1520px; display: flex; justify-content: center; }
#mark span { font-family: "PSans"; font-size: 25px; font-weight: 700; letter-spacing: 0.06em; color: var(--mark); padding: 8px 20px;
  border-radius: 40px; background: var(--mark-bg); }
#stage { position: absolute; inset: 0; transform-origin: 50% 42%; }
/* registry pieces speak the HyperFrames design contract: map our theme onto it */
html:root { --bg: transparent; --fg: var(--ink); --brand: var(--accent); --accent-2: var(--soft); --muted: var(--soft);
  --font-display: var(--head-family), "PSans", sans-serif; --font-body: "PSans", sans-serif; --font-mono: "PMono", monospace; }
#strip { position: absolute; left: 70px; right: 70px; top: 1296px; height: 118px; border-radius: 24px; background: var(--strip);
  box-shadow: 0 10px 26px rgba(120,80,40,0.10), 0 0 0 1px rgba(150,120,80,0.08); }
#chip { position: absolute; left: 0; right: 0; top: 236px; display: flex; justify-content: center; }
#chip div { display: inline-flex; align-items: center; gap: 12px; padding: 12px 22px; border-radius: 40px; background: var(--card);
  box-shadow: var(--card-shadow); font-family: "PSans"; font-size: 28px; font-weight: 700; color: var(--card-text); letter-spacing: 0; }
#chip b { width: 22px; height: 22px; border-radius: 6px; display: block; }
#chip .n { font-family: "PMono"; font-weight: 500; color: var(--card-text); opacity: 0.55; font-size: 25px; }
.col { position: absolute; left: 70px; right: 70px; top: 300px; height: 980px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.w { display: inline-block; white-space: pre; }
.ac { color: var(--accent); }
.lead { font-size: 46px; font-weight: 640; color: var(--soft); line-height: 1.25; max-width: 900px; }
.big { font-family: var(--head-family), "PSans", serif; font-weight: var(--head-weight); font-style: var(--head-style);
  text-transform: var(--head-case); letter-spacing: var(--head-track); line-height: var(--head-lh); max-width: 940px; }
.tile { width: 150px; height: 150px; border-radius: 34px; background: var(--tile); display: flex; align-items: center; justify-content: center;
  box-shadow: var(--card-shadow), 0 2px 0 rgba(255,255,255,0.8) inset; }
.tile svg { width: 84px; height: 84px; overflow: visible; }
.glow { box-shadow: var(--card-shadow), 0 10px 46px var(--glow); }
.pill { display: inline-flex; align-items: center; gap: 12px; font-size: 30px; font-weight: 680; color: var(--card-text); padding: 12px 24px 12px 16px;
  border-radius: 40px; background: var(--card); box-shadow: var(--card-shadow); }
.pill i { width: 28px; height: 28px; border-radius: 50%; background: var(--good); display: inline-flex; align-items: center; justify-content: center; }
.pill i svg { width: 18px; height: 18px; }
.thumb { position: absolute; width: 118px; height: 204px; border-radius: 16px; overflow: hidden;
  box-shadow: 0 12px 26px rgba(40,25,10,0.25); border: 2px solid rgba(255,255,255,0.7); }
.ic-s { stroke: var(--icon); fill: none; } .ic-f { fill: var(--icon); } .ic-a { fill: var(--accent); } .ic-as { stroke: var(--accent); fill: none; }
.ic-t { fill: var(--accent); font-family: "PSans"; font-weight: 800; }
/* app windows */
.winwrap { position: absolute; left: 80px; right: 80px; }
.win { border-radius: var(--win-radius); background: var(--win); overflow: hidden; color: var(--win-text);
  box-shadow: var(--win-shadow), var(--win-border); }
.win.code { background: var(--code-bg); color: var(--code-text); }
.bar { height: 70px; background: var(--win-bar); display: flex; align-items: center; position: relative; border-bottom: 1px solid var(--win-line); }
.win.code .bar { background: var(--code-bar); border-bottom-color: rgba(255,255,255,0.06); }
.dots { position: absolute; left: 28px; top: 27px; display: var(--dots); gap: 12px; }
.dots b { width: 17px; height: 17px; border-radius: 50%; display: block; }
.ttl { flex: 1; text-align: center; font-size: 27px; font-weight: 600; color: var(--win-dim); letter-spacing: 0; }
.ttl em { font-style: normal; color: var(--accent); margin-right: 8px; }
.body { position: relative; padding: 46px 52px; }
.code-t { font-family: "PMono", "Menlo", monospace; font-size: 38px; font-weight: 500; line-height: 1.62; color: var(--code-text); text-align: left; letter-spacing: 0; white-space: pre; }
.code-t .k { color: var(--accent); } .code-t .s { color: var(--code-str); } .code-t .m { color: var(--code-dim); }
.ch { opacity: 0; }
.stat b, .bval, #nb, #cv, .cv, .num { font-variant-numeric: tabular-nums; }
.stat { background: var(--win-tile); border-radius: 18px; padding: 22px 26px; text-align: left; flex: 1; }
.stat small { display: block; font-size: 25px; font-weight: 560; color: var(--win-dim); margin-bottom: 4px; letter-spacing: 0; }
.stat b { font-size: 66px; font-weight: 800; color: var(--win-text); letter-spacing: -0.01em; }
.chart { position: relative; margin-top: 26px; background: var(--win-tile); border-radius: 18px; padding: 22px 26px 18px; }
.chart small { font-size: 24px; font-weight: 560; color: var(--win-dim); letter-spacing: 0; }
.chart .tag { position: absolute; right: 26px; top: 22px; font-size: 24px; font-weight: 700; color: var(--good); }
.bars { position: relative; height: 560px; display: flex; align-items: flex-end; justify-content: center; gap: 70px; padding-bottom: 92px; }
.bcol { position: relative; width: 210px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.bfill { width: 100%; border-radius: 16px; transform-origin: 50% 100%; }
.blab { position: absolute; bottom: -84px; left: -50px; right: -50px; font-size: 34px; font-weight: 700; color: var(--win-text); line-height: 1.15; letter-spacing: 0; }
.bval { font-size: 44px; font-weight: 800; color: var(--win-text); margin-bottom: 14px; letter-spacing: 0; }
.row { display: flex; align-items: center; gap: 22px; font-size: 48px; font-weight: 700; color: var(--win-text); text-align: left; padding: 20px 0;
  border-bottom: 1px solid var(--win-line); letter-spacing: -0.005em; }
.row:last-child { border-bottom: 0; }
.row i { flex: none; width: 52px; height: 52px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
.row i svg { width: 30px; height: 30px; }
.deck, .keys { display: none; }
"""

LAPTOP_CSS = """
.winwrap { left: 70px; right: 70px; }
.win { border: 16px solid #0C0C0E; border-bottom-width: 26px; border-radius: 28px; }
.deck { display: block; position: relative; height: 30px; margin: 0 -60px; border-radius: 4px 4px 26px 26px;
  background: linear-gradient(180deg, #D9DADE 0%, #A9AAAF 60%, #7E7F84 100%); box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
.deck::after { content: ""; position: absolute; left: 50%; top: 0; width: 180px; margin-left: -90px; height: 12px; border-radius: 0 0 12px 12px; background: #8D8E93; }
.keys { display: grid; grid-template-columns: repeat(14, 1fr); grid-auto-rows: 1fr; gap: 9px; height: 250px; margin: 0 -40px;
  padding: 18px 46px 22px; background: linear-gradient(180deg, #1E1E21, #121214); clip-path: polygon(3% 0, 97% 0, 100% 100%, 0 100%); }
.keys i { display: block; border-radius: 7px; background: linear-gradient(180deg, #2D2D31, #242427); box-shadow: 0 2px 0 #0B0B0C; }
"""

BASE_JS = """
const CSSV = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
["SplitText", "MorphSVGPlugin", "DrawSVGPlugin"].forEach(n => { if (window[n]) gsap.registerPlugin(window[n]); });
const ACC = CSSV("--accent"), INK = CSSV("--ink"), MUTED = CSSV("--muted"), SOFT = CSSV("--soft");
const TILT = parseFloat(CSSV("--enter-tilt")), EBLUR = parseFloat(CSSV("--enter-blur")), RISE = parseFloat(CSSV("--win-rise")), ZOOM = parseFloat(CSSV("--hold-zoom"));
function fitW(el, maxW, minPx) {
  let fs = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > maxW && fs > (minPx || 20)) { fs -= 1; el.style.fontSize = fs + "px"; }
}
function fitH(el, maxH, minPx) {
  let fs = parseFloat(getComputedStyle(el).fontSize);
  while (el.offsetHeight > maxH && fs > (minPx || 20)) { fs -= 2; el.style.fontSize = fs + "px"; }
}
function prepDraw(scope) {
  (scope || document).querySelectorAll(".dr").forEach(p => { const L = Math.ceil(p.getTotalLength()) + 2;
    p.style.strokeDasharray = L + " " + (L + 4); p.style.strokeDashoffset = L; });
}
function draw(tl, sel, at, d, o) {
  o = o || {};
  return tl.to(sel, { strokeDashoffset: 0, duration: d, ease: o.ease || "power2.inOut", stagger: o.stagger || 0 }, at);
}
function enter(tl) {
  tl.fromTo("#stage", { opacity: 0, filter: "blur(" + EBLUR + "px)", scale: 0.965, rotationX: TILT, y: 26 },
    { opacity: 1, filter: "blur(0px)", scale: 1, rotationX: 0, y: 0, duration: 0.42, ease: "power3.out" }, 0);
}
function leave(tl, at) {
  if (at < 1.2) return;
  tl.to("#stage", { opacity: 0, filter: "blur(" + (EBLUR * 0.9) + "px)", scale: 0.97, rotationX: -TILT * 0.9, y: -22, duration: 0.3, ease: "power2.in" }, at);
}
function hold(tl, sel, from, to) {
  if (to - from < 0.2) return;
  tl.fromTo(sel, { scale: 1 }, { scale: ZOOM, duration: to - from, ease: "none", immediateRender: false }, from);
}
function ink(tl, sel, times, step, at) {
  const els = gsap.utils.toArray(sel);
  els.forEach((el, i) => {
    const t = times && times[i] != null ? Math.max(0, times[i] - 0.04) : (at || 0) + i * (step || 0.16);
    const fin = el.classList.contains("ac") ? ACC : (el.dataset.c || INK);
    tl.fromTo(el, { opacity: 0, filter: "blur(7px)", y: 12, color: MUTED },
      { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.24, ease: "power2.out" }, t);
    tl.to(el, { color: fin, duration: 0.3, ease: "power1.out" }, t + 0.16);
  });
  return els.length ? (times && times[els.length - 1] != null ? times[els.length - 1] : (at || 0) + (els.length - 1) * (step || 0.16)) + 0.3 : at || 0;
}
function popIn(tl, sel, at, o) {
  o = o || {};
  return tl.fromTo(sel, { opacity: 0, scale: o.from == null ? 0.6 : o.from, y: o.y || 0, filter: "blur(6px)" },
    { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", duration: o.d || 0.38, ease: o.ease || "back.out(2)", stagger: o.stagger || 0 }, at);
}
function rise(tl, sel, at, o) {
  o = o || {};
  return tl.fromTo(sel, { opacity: 0, y: o.y == null ? 60 : o.y, scale: o.from || 0.94, filter: "blur(10px)" },
    { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: o.d || 0.5, ease: o.ease || "power3.out", stagger: o.stagger || 0 }, at);
}
function count(tl, el, at, d, to, o) {
  o = o || {};
  const obj = { v: o.from || 0 };
  // decimals follow the target (4.2 counts as 4.2, not 4); tabular figures keep the digits from jittering
  const dec = o.dec != null ? o.dec : ((String(to).split(".")[1] || "").length);
  const fmt = v => (o.prefix || "") + Number(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (o.suffix || "");
  el.textContent = fmt(obj.v);
  tl.to(obj, { v: to, duration: d, ease: o.ease || "power2.out", onUpdate: () => { el.textContent = fmt(obj.v); } }, at);
}
function typeOn(tl, sel, at, cps) {
  const chs = gsap.utils.toArray(sel);
  chs.forEach((c, i) => tl.set(c, { opacity: 1 }, at + i / (cps || 40)));
  return at + chs.length / (cps || 40);
}
function winIn(tl, at) {
  rise(tl, "#win", at || 0.05, { y: RISE, from: RISE > 200 ? 1 : 0.92, d: RISE > 200 ? 0.8 : 0.55, ease: "power3.out" });
}
"""


def _grain(strength=0.55):
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' "
           f"baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.35 0 0 0 0 0.25 0 0 0 {strength} 0'/>"
           "</filter><rect width='300' height='300' filter='url(#n)'/></svg>")
    return '<div id="grain" style="background-image:url(&quot;data:image/svg+xml;utf8,' + svg.replace('"', "'").replace("#", "%23") + '&quot;)"></div>'


def skyline(seed, base=1752):
    """A line-art street along the bottom: blocks, towers, a house, domes, trees, a lamp. Seeded per card."""
    r = random.Random(seed)
    paths = [f"M 46 {base} H 1034"]
    x = 66 + r.randint(0, 30)
    while x < 990:
        kind = r.choices(["block", "tower", "house", "dome", "tree", "palm", "lamp", "gap"], [5, 2, 2, 1.4, 1.6, 1, 1, 1.2])[0]
        if kind == "gap":
            x += r.randint(18, 50)
            continue
        if kind in ("block", "tower"):
            w = r.randint(56, 110) if kind == "block" else r.randint(36, 54)
            h = r.randint(90, 210) if kind == "block" else r.randint(200, 300)
            w = min(w, 1020 - x)
            if w < 30:
                break
            paths.append(f"M {x} {base} V {base - h} H {x + w} V {base}")
            if kind == "tower":
                paths.append(f"M {x + w // 2} {base - h} V {base - h - r.randint(26, 50)}")
            if r.random() < 0.55 and w > 50:
                paths.append(f"M {x + 14} {base - h + 24} H {x + w - 14}")
            if r.random() < 0.4:
                dx = x + w // 2 - 8
                paths.append(f"M {dx} {base} V {base - 30} H {dx + 16} V {base}")
            if kind == "block" and r.random() < 0.45 and x + w + 40 < 1010:
                w2 = r.randint(34, 60)
                h2 = max(60, h + r.choice([-50, -30, 30, 50]))
                paths.append(f"M {x + w} {base - h2} H {x + w + w2} V {base}")
                w += w2
            x += w + r.randint(10, 36)
        elif kind == "house":
            w, h = r.randint(64, 92), r.randint(48, 70)
            if x + w > 1020:
                break
            paths.append(f"M {x} {base} V {base - h} L {x + w // 2} {base - h - 40} L {x + w} {base - h} V {base}")
            paths.append(f"M {x + w // 2 - 9} {base} V {base - 26} H {x + w // 2 + 9} V {base}")
            x += w + r.randint(14, 34)
        elif kind == "dome":
            w, h = r.randint(90, 130), r.randint(80, 120)
            if x + w > 1020:
                break
            rr = w // 2
            paths.append(f"M {x} {base} V {base - h} A {rr} {rr - 10} 0 0 1 {x + w} {base - h} V {base}")
            paths.append(f"M {x + rr - 16} {base} V {base - 44} A 16 16 0 0 1 {x + rr + 16} {base - 44} V {base}")
            paths.append(f"M {x + rr} {base - h - rr + 8} V {base - h - rr - 18}")
            x += w + r.randint(14, 34)
        elif kind == "tree":
            h, rr = r.randint(50, 80), r.randint(18, 26)
            paths.append(f"M {x + rr} {base} V {base - h + rr}")
            paths.append(f"M {x + rr} {base - h + rr} m -{rr} 0 a {rr} {rr} 0 1 0 {2 * rr} 0 a {rr} {rr} 0 1 0 -{2 * rr} 0")
            x += 2 * rr + r.randint(10, 26)
        elif kind == "palm":
            h, tx = r.randint(110, 160), x + 30
            paths.append(f"M {tx} {base} Q {tx + 8} {base - h // 2} {tx + 2} {base - h}")
            for dx, dy in ((-34, 16), (34, 18), (-26, -8), (28, -6)):
                paths.append(f"M {tx + 2} {base - h} q {dx // 2} {-14 + dy // 3} {dx} {dy}")
            x += 66 + r.randint(6, 20)
        elif kind == "lamp":
            paths.append(f"M {x + 6} {base} V {base - 86} M {x - 4} {base - 86} H {x + 16} V {base - 70} H {x - 4} Z")
            x += 30 + r.randint(6, 20)
    return paths


def _birds(seed):
    r = random.Random(seed * 7 + 3)
    out = []
    for _ in range(r.randint(3, 5)):
        x, y, s = r.randint(120, 940), r.randint(250, 470), r.uniform(0.8, 1.25)
        out.append(f'<path d="M {x} {y} q {8 * s:.1f} {-7 * s:.1f} {16 * s:.1f} 0 q {8 * s:.1f} {-7 * s:.1f} {16 * s:.1f} 0" />')
    return "".join(out)


VIVID = [("#340050", "#1464AC"), ("#0530C5", "#13C9EF"), ("#9853E0", "#F133F7"), ("#E45411", "#F8BF1B"), ("#0B6E4F", "#36D399"), ("#1F1B6B", "#E42F7D")]


def backdrop(kind, seed, index=1):
    """(html, js) for the scene behind the cards."""
    if kind == "skyline":
        city = '<svg id="city" viewBox="0 0 1080 1920">' + "".join(f'<path class="dr sk" d="{d}" />' for d in skyline(seed)) + "</svg>"
        return (_grain() + f'<svg id="birds" viewBox="0 0 1080 1920">{_birds(seed)}</svg>' + city,
                """  draw(tl, "#city .sk", 0.05, 0.75, { stagger: 0.025 });
  tl.fromTo("#birds", { x: -30, opacity: 0 }, { x: 30, opacity: 1, duration: DUR, ease: "none" }, 0);""")
    if kind == "studio":
        r = random.Random(seed)
        a = r.randint(100, 130)
        folds = (f'<div id="folds" style="position:absolute;inset:-200px;background:'
                 f'linear-gradient({a}deg, rgba(255,255,255,0) 18%, rgba(255,255,255,0.75) 30%, rgba(0,0,0,0.035) 42%, rgba(255,255,255,0) 52%, '
                 f'rgba(255,255,255,0.6) 66%, rgba(0,0,0,0.04) 78%, rgba(255,255,255,0) 90%);filter:blur(30px)"></div>')
        return (folds + _grain(0.25), """  tl.fromTo("#folds", { x: -40, y: 10 }, { x: 40, y: -10, duration: DUR, ease: "none" }, 0);""")
    if kind == "spotlight":
        spot = ('<div id="spot" style="position:absolute;inset:0;background:radial-gradient(60% 42% at 50% 16%, var(--page-hi) 0%, '
                'rgba(28,20,15,0.6) 55%, rgba(0,0,0,0) 100%)"></div>'
                '<div style="position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)"></div>')
        return (spot + _grain(0.7), """  tl.fromTo("#spot", { opacity: 0.85 }, { opacity: 1, duration: DUR, ease: "none" }, 0);""")
    if kind == "grain":
        return (_grain(0.35), "")
    if kind == "doodle":
        return ('<svg width="0" height="0" style="position:absolute"><filter id="wob"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/>'
                '<feDisplacementMap in="SourceGraphic" scale="5"/></filter></svg>', "")
    if kind == "vivid":
        a, b = VIVID[(index - 1) % len(VIVID)]
        r = random.Random(seed)
        dots = "".join(f'<i style="position:absolute;left:{r.randint(40, 1040)}px;top:{r.randint(150, 1700)}px;width:{r.choice([4, 6, 8])}px;height:{r.choice([4, 6, 8])}px;border-radius:50%;background:rgba(255,255,255,{r.uniform(0.25, 0.6):.2f});display:block"></i>' for _ in range(26))
        return (f'<div style="position:absolute;inset:0;background:linear-gradient(180deg,{a} 0%,{b} 100%)"></div>'
                f'<div id="portal" style="position:absolute;left:90px;top:380px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 60%, rgba(255,255,255,0) 72%)"></div>'
                f'<div id="dots" style="position:absolute;inset:0">{dots}</div>',
                """  tl.fromTo("#portal", { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "power3.out" }, 0);
  tl.fromTo("#dots", { y: 20 }, { y: -40, duration: DUR, ease: "none" }, 0);""")
    if kind == "letterbox":
        return ('<div id="ltitle" style="position:absolute;left:60px;right:60px;top:600px;text-align:center;font-family:PComic;font-size:62px;font-weight:700;color:#111">TITLE</div>'
                '<svg style="position:absolute;left:340px;top:690px;width:400px;height:30px;overflow:visible"><path class="dr lu" d="M 6 16 C 90 6 200 26 394 10" stroke="#CC000C" stroke-width="7" fill="none" stroke-linecap="round"/></svg>',
                """  tl.fromTo("#ltitle", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 }, 0);
  draw(tl, ".lu", 0.25, 0.4);""")
    if kind == "lab":
        r = random.Random(seed)
        pts = "".join(f'<circle cx="{r.randint(0, 1080)}" cy="{r.randint(0, 1920)}" r="{r.choice([1.2, 1.6, 2.2])}" fill="#fff" opacity="{r.uniform(0.15, 0.7):.2f}"/>' for _ in range(90))
        return (f'<svg id="field" viewBox="0 0 1080 1920" style="position:absolute;inset:0;width:1080px;height:1920px">{pts}</svg>'
                '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="vir" x1="0" y1="0" x2="1" y2="0">'
                '<stop offset="0" stop-color="#440154"/><stop offset=".25" stop-color="#3B528B"/><stop offset=".5" stop-color="#21918C"/><stop offset=".75" stop-color="#5DC863"/><stop offset="1" stop-color="#FDE725"/></linearGradient></defs></svg>'
                '<div id="scale" style="position:absolute;left:70px;top:1590px;font-family:PSerif;font-size:40px;color:#ddd"><div style="width:240px;height:14px;border:2px solid #aaa;border-top:0"></div><span id="sv">10</span><sup id="se" style="font-size:26px">0</sup> km</div>',
                """  tl.fromTo("#field", { scale: 1.25, transformOrigin: "50% 40%" }, { scale: 0.95, duration: DUR, ease: "sine.inOut" }, 0);
  (function () { const o = { e: 0 }; tl.to(o, { e: 6, duration: DUR, ease: "none", onUpdate: () => { document.getElementById("se").textContent = Math.round(o.e); } }, 0); })();""")
    if kind == "lamp":
        return (_grain(0.3) + '<div id="lamp" style="position:absolute;inset:0;background:#000;z-index:5;pointer-events:none"></div>',
                """  tl.fromTo("#lamp", { opacity: 0.8 }, { opacity: 0, duration: 1.1, ease: "power2.out" }, 0);""")
    if kind == "poster":
        return ('<div style="position:absolute;inset:0;background:radial-gradient(90% 70% at 50% 40%, #1C1D22 0%, #0D1014 70%, #060709 100%)"></div>' + _grain(0.6), "")
    if kind == "pills":
        return ('<div style="position:absolute;inset:0;background-image:linear-gradient(#181818 1px, transparent 1px),linear-gradient(90deg,#181818 1px, transparent 1px);background-size:68px 68px;background-position:-2px -2px"></div>', "")
    if kind == "terminal":
        return ('<div id="hdr"><span><b>&#9614;</b> HANDLE</span><span>NUM</span></div><div id="prog"><i></i></div>',
                """  tl.fromTo("#hdr", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.05);
  tl.fromTo("#prog i", { scaleX: PROG0 }, { scaleX: PROG1, duration: 0.8, ease: "power2.out" }, 0.2);""")
    if kind == "aurora":
        r = random.Random(seed)
        blobs = "".join(
            f'<div class="blob" style="position:absolute;left:{r.randint(-200, 700)}px;top:{r.randint(100, 1300)}px;width:{r.randint(520, 760)}px;height:{r.randint(520, 760)}px;'
            f'border-radius:50%;background:{c};filter:blur(110px);opacity:0.55"></div>'
            for c in ("#F2DAFE", "#D9E4FF", "#FBD9EC", "#E4D6FF"))
        return (blobs + _grain(0.18), """  gsap.utils.toArray(".blob").forEach((b, i) => tl.fromTo(b, { x: -40 + i * 20, y: 0 }, { x: 60 - i * 30, y: -50 + i * 25, duration: DUR, ease: "none" }, 0));""")
    if kind == "neon":
        sq = "".join(f'<rect class="dr nq" x="{540 - k}" y="{760 - k}" width="{2 * k}" height="{2 * k}" rx="6" fill="none" stroke="rgba(255,255,255,{0.07 + 0.03 * i:.2f})" stroke-width="1.5"/>'
                     for i, k in enumerate((110, 190, 290, 410, 560)))
        rays = "".join(f'<path class="dr nr" d="M {540 + 130 * math.cos(a):.0f} {760 + 130 * math.sin(a):.0f} L {540 + 900 * math.cos(a):.0f} {760 + 900 * math.sin(a):.0f}" stroke="url(#ng)" stroke-width="2" fill="none" opacity="0.35"/>'
                       for a in [k * math.pi / 8 + 0.2 for k in range(16)])
        svg = (f'<svg id="neon" viewBox="0 0 1080 1920" style="position:absolute;inset:0;width:1080px;height:1920px">'
               f'<defs><linearGradient id="ng" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6E0AC9"/><stop offset=".5" stop-color="#E42F7D"/><stop offset="1" stop-color="#3C8DF4"/></linearGradient>'
               f'<radialGradient id="nf"><stop offset="0" stop-color="#6E0AC9" stop-opacity=".55"/><stop offset="1" stop-color="#05000B" stop-opacity="0"/></radialGradient></defs>'
               f'<circle cx="540" cy="760" r="520" fill="url(#nf)"/>{rays}{sq}<circle id="ndot" cx="540" cy="760" r="9" fill="#fff" style="filter:drop-shadow(0 0 12px #fff) drop-shadow(0 0 30px #A78BFA)"/></svg>')
        return (svg + _grain(0.2), """  draw(tl, "#neon .nq", 0.0, 0.7, { stagger: 0.06, ease: "power2.out" });
  draw(tl, "#neon .nr", 0.2, 0.6, { stagger: 0.02, ease: "power3.out" });
  tl.fromTo("#neon", { scale: 1, transformOrigin: "50% 39.6%" }, { scale: 1.12, rotation: 3, duration: DUR, ease: "none" }, 0);
  tl.fromTo("#ndot", { attr: { cx: -20, cy: 200 } }, { attr: { cx: 1100, cy: 200 }, duration: DUR, ease: "none" }, 0);""")
    if kind == "editor":
        keys = "".join(f'<i class="kf" style="left:{x}px;top:{y}px"></i>' for x, y in ((150, 52), (420, 52), (260, 104), (610, 104), (330, 156), (720, 156)))
        html_ = f"""<div id="board" style="position:absolute;left:56px;right:56px;top:196px;height:1084px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.05)"></div>
<div style="position:absolute;left:58px;top:160px;font-family:PSans;font-size:22px;font-weight:600;color:#8A8A8A">&#9634; Frame 1</div>
<div id="tools" style="position:absolute;left:0;right:0;top:1470px;display:flex;justify-content:center"><div style="display:flex;gap:26px;align-items:center;background:#fff;border-radius:40px;padding:16px 30px;box-shadow:0 8px 24px rgba(0,0,0,.12)">
  <b style="width:46px;height:46px;border-radius:12px;background:var(--accent);display:block"></b><i style="width:30px;height:30px;border:3px solid #333;border-radius:4px;display:block"></i><i style="width:30px;height:30px;border:3px solid #333;border-radius:50%;display:block"></i><i style="width:34px;height:4px;background:#333;display:block"></i><span style="font-family:PSans;font-size:30px;font-weight:700;color:#333">T</span></div></div>
<div id="tline" style="position:absolute;left:56px;right:56px;top:1580px;height:220px;background:#fff;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,.10);overflow:hidden">
  <div style="height:36px;border-bottom:1px solid #eee;font-family:PMono;font-size:18px;color:#999;display:flex;gap:118px;padding:8px 24px">{"".join(f"<span>{v}</span>" for v in (0, 400, 800, 1200, 1600, 2000))}</div>
  <div style="position:absolute;left:24px;right:24px;top:48px;height:36px;border-radius:8px;background:#DFDEEB"></div><div style="position:absolute;left:24px;right:24px;top:100px;height:36px;border-radius:8px;background:#DFDEEB"></div><div style="position:absolute;left:24px;right:24px;top:152px;height:36px;border-radius:8px;background:#DFDEEB"></div>
  <div id="tbar" style="position:absolute;left:150px;width:270px;top:52px;height:28px;border-radius:6px;background:#6D2EDE"></div>{keys}
  <div id="phead" style="position:absolute;left:24px;top:0;width:3px;height:220px;background:var(--accent)"></div></div>
<svg id="cur" viewBox="0 0 40 40" style="position:absolute;left:0;top:0;width:52px;height:52px;overflow:visible"><path d="M4 2 L4 32 L12 24 L18 37 L24 34 L18 22 L30 22 Z" fill="#111" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>
<div id="selb" style="position:absolute;left:0;top:0;width:10px;height:10px;border:3px solid var(--accent);pointer-events:none"><i></i><i></i><i></i><i></i></div>"""
        css_ = ".kf { position:absolute; width:22px; height:22px; background:#fff; border:3px solid #6D2EDE; transform: rotate(45deg); display:block; } #selb i { position:absolute; width:16px; height:16px; background:#fff; border:3px solid var(--accent); display:block; } #selb i:nth-child(1){left:-10px;top:-10px} #selb i:nth-child(2){right:-10px;top:-10px} #selb i:nth-child(3){left:-10px;bottom:-10px} #selb i:nth-child(4){right:-10px;bottom:-10px}"
        return (f"<style>{css_}</style>" + html_, """  tl.fromTo("#phead", { x: 0 }, { x: 900, duration: DUR, ease: "none" }, 0);
  tl.fromTo("#tbar", { scaleX: 0.2, transformOrigin: "0 50%" }, { scaleX: 1, duration: 0.8, ease: "power2.out" }, 0.2);
  (function () {
    const tgt = ["#hl", "#win", "#nb", "#tt", "#bg2", "#wr", "#txt", ".col > *:not(:empty)"].map((q) => document.querySelector(q)).find(Boolean);
    if (!tgt) { gsap.set(["#selb", "#cur"], { opacity: 0 }); return; }
    let ox = 0, oy = 0, e = tgt;
    while (e && e.id !== "stage") { ox += e.offsetLeft; oy += e.offsetTop; e = e.offsetParent; }
    const pad = 18, x = ox - pad, y = oy - pad, w = tgt.offsetWidth + 2 * pad, h = tgt.offsetHeight + 2 * pad;
    gsap.set("#selb", { x: x, y: y, width: w, height: h, opacity: 0 });
    tl.fromTo("#cur", { x: 820, y: 1500, opacity: 0 }, { x: x + w - 10, y: y + h - 10, opacity: 1, duration: 0.6, ease: "power3.inOut" }, 0.15);
    tl.to("#cur", { keyframes: [ { scale: 0.85, duration: 0.08 }, { scale: 1, duration: 0.12 } ] }, 0.75);
    tl.fromTo("#selb", { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.15 }, 0.8);
    tl.to("#cur", { x: x + w + 60, y: y + h + 90, duration: 0.8, ease: "power2.inOut" }, 1.3);
  })();""")
    return ("", "")


def _font_faces(keys):
    out = []
    for k in keys:
        f, fam, wt, st = FONTS[k]
        out.append(f'@font-face {{ font-family: "{fam}"; src: url("assets/{f.name.replace(" ", "%20")}") format("truetype"); font-weight: {wt}; font-style: {st}; }}')
    return "\n".join(out)


def _font_loads(keys):
    loads = {"sans": "document.fonts.load('760 100px \"PSans\"')", "mono": "document.fonts.load('500 38px \"PMono\"')",
             "serif-i": "document.fonts.load('italic 400 100px \"PSerifI\"')", "serif": "document.fonts.load('400 100px \"PSerif\"')",
             "hand": "document.fonts.load('700 100px \"PHand\"')", "comic": "document.fonts.load('700 100px \"PComic\"')",
             "cond": "document.fonts.load('400 100px \"PCond\"')", "georgia": "document.fonts.load('400 100px \"PGeorgia\"')",
             "georgia-b": "document.fonts.load('700 100px \"PGeorgia\"')"}
    return ", ".join(loads[k] for k in keys)


def page(gid, dur, spec, theme="paper", handle=None, exit_at=None, index=1, total=1, title=None):
    th = THEMES[theme]
    seed = _seed(gid)
    toks = th["tokens"]
    # html:root outranks a registry block's own :root, so a mounted piece can't recolour the theme
    root_vars = "html:root { " + " ".join(f"--{k}: {v} !important;" for k, v in toks.items()) + " }"
    bd_html, bd_js = backdrop(th["backdrop"], seed, index)
    bd_html = bd_html.replace("HANDLE", esc((handle or "").upper())).replace("NUM", f"{index:02d} / {total:02d}")
    bd_js = bd_js.replace("PROG0", f"{(index - 1) / max(1, total):.4f}").replace("PROG1", f"{index / max(1, total):.4f}")
    mark = f'<div id="mark"><span>{esc(handle.upper())}</span></div>' if handle and th.get("mark", True) else ""
    strip = '<div id="strip"></div>' if th.get("strip") and spec.get("captions", True) and spec.get("strip", True) else ""
    chip = ""
    if spec.get("chip"):
        n, total, label, color = spec["chip"]
        chip = (f'<div id="chip"><div><b style="background:{esc(color)}"></b><span class="n">{n:02d} / {total:02d}</span>'
                f'<span>{esc(label)}</span></div></div>')
    leave = f"leave(tl, {exit_at});" if exit_at else ""
    # GSAP's bonus plugins (free since 3.13: SplitText, MorphSVGPlugin, DrawSVGPlugin), only for cards that ask
    plugins = "".join(f'<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/{n}.min.js"></script>' for n in spec.get("plugins", ()))
    plugins += spec.get("head", "")
    band_open = band_close = ""
    if th.get("frame") == "band":
        # the card's content band (y 300 to 1280) shrinks into a 16:9 strip; #bandin is never animated, #stage is
        band_open = ('<div id="band" style="position:absolute;left:0;top:800px;width:1080px;height:608px;overflow:hidden;background:var(--page)">'
                     '<div id="bandin" style="position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:0 0;transform:translate(205px,-186px) scale(0.62)">')
        band_close = "</div></div>"
    bd_html = bd_html.replace("TITLE", esc(title or ""))
    # inside a mounted registry piece, pin the theme's real colours (the runtime gives each mount its own defaults)
    reg_css = (f"#reg * {{ --accent: {toks['accent']} !important; --brand: {toks['accent']} !important; "
               f"--fg: {toks['ink']} !important; --accent-2: {toks['soft']} !important; }}\n")
    if spec.get("registry_files"):
        # a mounted block can reset --accent on the page itself: pin the backdrop's accent details to literal colours
        reg_css += f"#prog i {{ background: {toks['accent']} !important; }} #hdr b {{ color: {toks['accent']} !important; }}\n"
    spec = {**spec, "body": spec["body"].replace("__ACCENT__", toks["accent"]).replace("__INK__", toks["ink"])}
    css = (_font_faces(th["fonts"]) + "\n" + root_vars + "\n" + reg_css + BASE_CSS + (LAPTOP_CSS if th.get("frame") == "laptop" else "")
           + th.get("css", "") + "\n" + spec.get("css", ""))
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <title>{esc(gid)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    {plugins}
    <style>{css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="{W}" data-height="{H}">
      <section id="scene">
        <div id="bg"></div>
        {bd_html}
        {mark}
        {band_open}<div id="stage">
{spec["body"]}
        {strip}{chip}
        </div>{band_close}
      </section>
    </div>
    <script>{BASE_JS}
Promise.all([{_font_loads(th["fonts"])}, document.fonts.ready]).then(function () {{
  const tl = gsap.timeline({{ paused: true }});
  const DUR = {dur};
  prepDraw();
{bd_js if th["backdrop"] != "editor" else ""}
  if (document.getElementById("mark")) tl.fromTo("#mark span", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, 0.2);
  enter(tl);
  if (document.getElementById("strip")) tl.fromTo("#strip", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }}, 0.12);
  if (document.getElementById("chip")) tl.fromTo("#chip div", {{ opacity: 0, y: -20, scale: 0.9 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(2)" }}, 0.1);
{spec["js"]}
{bd_js if th["backdrop"] == "editor" else ""}
  {leave}
  window.__timelines["main"] = tl;
  tl.seek(0);
  if (window.__hfForceTimelineRebind) window.__hfForceTimelineRebind();
}});
    </script>
  </body>
</html>
"""


# ------------------------------------------------------------------------------------------------ pieces

ICONS = {
    "doc": '<svg viewBox="0 0 64 64"><path class="ic-s" d="M14 4 H40 L52 16 V60 H14 Z" stroke-width="4" stroke-linejoin="round"/><path class="ic-s" d="M40 4 V16 H52" stroke-width="4" stroke-linejoin="round"/>LABEL</svg>',
    "spark": '<svg viewBox="0 0 64 64"><path class="ic-a" d="M32 4 C34 22 42 30 60 32 C42 34 34 42 32 60 C30 42 22 34 4 32 C22 30 30 22 32 4 Z"/></svg>',
    "chart": '<svg viewBox="0 0 64 64"><path class="ic-s" d="M8 56 H58" stroke-width="4" stroke-linecap="round"/><rect class="ic-f" x="12" y="34" width="10" height="18" rx="2"/><rect class="ic-f" x="28" y="22" width="10" height="30" rx="2"/><rect class="ic-a" x="44" y="8" width="10" height="44" rx="2"/></svg>',
    "chat": '<svg viewBox="0 0 64 64"><path class="ic-s" d="M8 12 H56 V44 H28 L16 56 V44 H8 Z" stroke-width="4" stroke-linejoin="round"/><circle class="ic-a" cx="22" cy="28" r="3.5"/><circle class="ic-a" cx="32" cy="28" r="3.5"/><circle class="ic-a" cx="42" cy="28" r="3.5"/></svg>',
    "cart": '<svg viewBox="0 0 64 64"><path class="ic-s" d="M4 8 H14 L22 42 H52 L58 18 H18" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle class="ic-a" cx="26" cy="54" r="5"/><circle class="ic-a" cx="48" cy="54" r="5"/></svg>',
    "coin": '<svg viewBox="0 0 64 64"><circle class="ic-s" cx="32" cy="32" r="26" stroke-width="4"/><path class="ic-as" d="M40 22 C36 18 24 18 24 26 C24 34 40 30 40 38 C40 46 28 46 23 42 M32 14 V50" stroke-width="4" stroke-linecap="round"/></svg>',
    "bulb": '<svg viewBox="0 0 64 64"><path class="ic-s" d="M22 40 C14 34 12 26 14 20 C18 8 46 8 50 20 C52 26 50 34 42 40 V48 H22 Z" stroke-width="4" stroke-linejoin="round"/><path class="ic-as" d="M24 56 H40" stroke-width="5" stroke-linecap="round"/></svg>',
    "user": '<svg viewBox="0 0 64 64"><circle class="ic-s" cx="32" cy="22" r="12" stroke-width="4"/><path class="ic-s" d="M10 58 C12 42 52 42 54 58" stroke-width="4" stroke-linecap="round"/><circle class="ic-a" cx="50" cy="14" r="6"/></svg>',
    "mail": '<svg viewBox="0 0 64 64"><rect class="ic-s" x="6" y="14" width="52" height="38" rx="6" stroke-width="4"/><path class="ic-as" d="M8 18 L32 36 L56 18" stroke-width="4" stroke-linejoin="round"/></svg>',
    "play": '<svg viewBox="0 0 64 64"><rect class="ic-s" x="6" y="10" width="52" height="44" rx="10" stroke-width="4"/><path class="ic-a" d="M26 22 L42 32 L26 42 Z"/></svg>',
    "store": '<svg viewBox="0 0 64 64"><path class="ic-s" d="M8 24 L12 8 H52 L56 24 Z" stroke-width="4" stroke-linejoin="round"/><path class="ic-s" d="M12 24 V56 H52 V24" stroke-width="4"/><rect class="ic-a" x="26" y="38" width="12" height="18"/></svg>',
    "clock": '<svg viewBox="0 0 64 64"><circle class="ic-s" cx="32" cy="32" r="26" stroke-width="4"/><path class="ic-as" d="M32 16 V32 L42 40" stroke-width="4" stroke-linecap="round"/></svg>',
    "camera": '<svg viewBox="0 0 64 64"><rect class="ic-s" x="6" y="16" width="52" height="38" rx="10" stroke-width="4"/><circle class="ic-s" cx="32" cy="35" r="10" stroke-width="4"/><circle class="ic-a" cx="48" cy="25" r="3.5"/></svg>',
    "flame": '<svg viewBox="0 0 64 64"><path class="ic-a" d="M32 4 C36 18 50 24 50 40 C50 52 42 60 32 60 C22 60 14 52 14 40 C14 30 20 24 24 18 C26 26 30 28 32 28 C30 18 30 10 32 4 Z"/></svg>',
    "folder": '<svg viewBox="0 0 64 64"><path class="ic-s" d="M6 16 H26 L32 22 H58 V52 H6 Z" stroke-width="4" stroke-linejoin="round"/></svg>',
}
KEYS = "<i></i>" * 70  # a laptop keyboard (shown only by a laptop-framed theme)
CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5 L10 17 L19 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
CROSS = '<svg viewBox="0 0 24 24"><path d="M7 7 L17 17 M17 7 L7 17" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>'
# a hand-drawn arrow, pointing down-left at its tip (0, 0 of the path's end)
HAND_ARROW = '<svg class="harrow" viewBox="0 0 220 160" style="overflow:visible"><path class="dr ha" d="M 210 10 C 150 0 90 20 60 70 C 45 95 40 115 38 140" style="stroke:var(--accent);fill:none" stroke-width="9" stroke-linecap="round"/><path class="dr hb" d="M 14 112 L 38 146 L 66 116" style="stroke:var(--accent);fill:none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>'


_LUCIDE = None


def lucide(name):
    """A Lucide icon (ISC, 1,866 icons bundled in icons/lucide.json.gz) as an inline SVG in the theme's icon
    colour, or None if there's no such icon. Names as on lucide.dev/icons, e.g. "rocket", "shopping-cart"."""
    global _LUCIDE
    if _LUCIDE is None:
        import gzip
        _LUCIDE = json.loads(gzip.decompress((KIT / "icons" / "lucide.json.gz").read_bytes()))
    nodes = _LUCIDE.get(name)
    if nodes is None:
        return None
    inner = "".join(f'<{tag} ' + " ".join(f'{k}="{esc(v)}"' for k, v in attrs.items()) + "/>" for tag, attrs in nodes)
    return (f'<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
            f'style="stroke:var(--icon)">{inner}</svg>')


def icon(name, label=None):
    """Our own two-tone icons (ICONS) by name, else any Lucide icon by its name."""
    if name not in ICONS:
        svg = lucide(name.removeprefix("lucide:") if hasattr(name, "removeprefix") else name.replace("lucide:", "", 1))
        if svg:
            return svg
        raise ValueError(f"icon: one of {', '.join(ICONS)} or a Lucide icon name (lucide.dev/icons)")
    lab = f'<text class="ic-t" x="33" y="50" text-anchor="middle" font-size="12">{esc(label)}</text>' if label else ""
    return ICONS[name].replace("LABEL", lab)


THUMBS = [
    ("background:#F6F1E7", '<div style="position:absolute;left:16px;right:16px;top:54px;height:9px;border-radius:5px;background:#1C1A17"></div><div style="position:absolute;left:26px;right:26px;top:72px;height:7px;border-radius:4px;background:#BDB4A6"></div><div style="position:absolute;left:18px;top:118px;display:flex;gap:6px"><i style="width:18px;height:18px;border-radius:6px;background:#D2613A;display:block"></i><i style="width:18px;height:18px;border-radius:6px;background:#E9B44C;display:block"></i><i style="width:18px;height:18px;border-radius:6px;background:#3E8E7E;display:block"></i><i style="width:18px;height:18px;border-radius:6px;background:#5B7BD5;display:block"></i></div>'),
    ("background:linear-gradient(180deg,#121826,#24324F)", '<div style="position:absolute;left:20px;right:20px;top:46px;height:7px;border-radius:4px;background:rgba(255,255,255,.75)"></div>' + "".join(f'<i style="position:absolute;left:{18 + (k * 37) % 80}px;top:{90 + (k * 23) % 80}px;width:12px;height:12px;border-radius:3px;background:rgba(255,255,255,{0.5 + (k % 3) * 0.15});display:block"></i>' for k in range(7))),
    ("background:linear-gradient(180deg,#E07A52,#C9562F)", '<svg style="position:absolute;left:37px;top:58px;width:44px;height:44px" viewBox="0 0 64 64"><path d="M32 4 C34 22 42 30 60 32 C42 34 34 42 32 60 C30 42 22 34 4 32 C22 30 30 22 32 4 Z" fill="#fff"/></svg><div style="position:absolute;left:26px;right:26px;top:124px;height:10px;border-radius:5px;background:#fff"></div><div style="position:absolute;left:38px;right:38px;top:144px;height:14px;border-radius:7px;background:rgba(255,255,255,.35)"></div>'),
    ("background:linear-gradient(180deg,#6F93C9,#A9C3E3)", '<div style="position:absolute;left:24px;right:24px;top:52px;height:7px;border-radius:4px;background:rgba(255,255,255,.8)"></div><div style="position:absolute;left:-10px;right:-10px;bottom:-20px;height:80px;border-radius:50%;background:#fff;opacity:.95"></div>'),
    ("background:linear-gradient(180deg,#2B2927,#1B1A19)", '<div style="position:absolute;left:16px;top:40px;width:56px;height:8px;border-radius:4px;background:#D2613A"></div><div style="position:absolute;left:16px;top:58px;width:84px;height:6px;border-radius:3px;background:#8A8276"></div><div style="position:absolute;left:16px;top:72px;width:70px;height:6px;border-radius:3px;background:#8A8276"></div><div style="position:absolute;left:16px;bottom:24px;right:16px;height:60px;border-radius:8px;background:linear-gradient(0deg,rgba(210,97,58,.5),rgba(210,97,58,0))"></div>'),
    ("background:linear-gradient(180deg,#E9F2EC,#CFE5D8)", '<div style="position:absolute;left:22px;right:22px;top:56px;height:9px;border-radius:5px;background:#24433A"></div><div style="position:absolute;left:36px;top:96px;width:46px;height:46px;border-radius:50%;background:#2FA866"></div>'),
]


def thumb(k, style=""):
    bg, inner = THUMBS[k % len(THUMBS)]
    return f'<div class="thumb" style="{bg};{style}">{inner}</div>'


def _words(text):
    """'This {tool} makes reels' -> [(word, accent)]. Braces mark accent words (several words allowed)."""
    _no_dash(text)
    out = []
    for part in re.split(r"(\{[^}]*\})", text):
        if not part:
            continue
        acc = part.startswith("{")
        ws = part.strip("{}").split()
        # punctuation straight after a braced phrase ("{$24 an hour}.") stays on that word, no space
        if not acc and out and ws and not part[0].isspace():
            out[-1] = (out[-1][0] + ws.pop(0), out[-1][1])
        for w in ws:
            out.append((w, acc))
    return out


def _spans(words, cls="w"):
    return " ".join(f'<span class="{cls}{" ac" if a else ""}">{esc(w)}</span>' for w, a in words)


def _plain(words):
    return [w for w, _ in words]


def with_chip(spec, n, total, label, color=None):
    """Any card with a chapter chip at the top ("02 / 05  Carousels"), for list-style videos."""
    _no_dash(label)
    palette = ["#E5487A", "#8B5CF6", "#F59E0B", "#3B82F6", "#22A06B"]
    return {**spec, "chip": (n, total, label, color or palette[(n - 1) % len(palette)])}


# ------------------------------------------------------------------------------------------------ cards
# Every helper returns a spec: dict(dur, css, body, js, words, captions, exit). `words` are the card's own
# on-screen words in order (write_cards maps the voice's word times onto them); captions=False means the
# card shows the spoken words itself, so Studio's captions step aside while it is up.


def headline(gid, text, icons=None, label=None, pills=(), kicker=None, burst=True, size=88, dur=4, exit=True):
    """The hook card: optional two app tiles joined by a line (a dot runs along it; mini reels burst from
    the right tile), then the line of text inking in word by word, accent words in braces, then check pills."""
    ws = _words(text)
    _no_dash(kicker, *pills)
    top = ""
    if icons:
        a, b = icons
        thumbs = "".join(f'<div class="bt" style="position:absolute;left:0;top:0">{thumb(k)}</div>' for k in range(4)) if burst else ""
        top = f"""<div id="link" style="position:relative;width:640px;height:170px;margin-bottom:70px">
  <div id="ta" class="tile" style="position:absolute;left:0;top:10px">{icon(a, label)}</div>
  <svg style="position:absolute;left:0;top:0;width:640px;height:170px;overflow:visible"><path id="ln" class="dr" d="M 160 85 H 480" style="stroke:var(--accent)" stroke-width="5" fill="none" stroke-linecap="round"/><circle id="dot" cx="160" cy="85" r="9" style="fill:var(--accent)"/></svg>
  <div id="tb" class="tile glow" style="position:absolute;left:490px;top:10px">{icon(b)}</div>
  <div id="burst" style="position:absolute;left:504px;top:-10px;width:120px;height:120px">{thumbs}</div>
</div>"""
    kick = f'<div id="kick" style="font-size:28px;font-weight:700;letter-spacing:0.24em;color:var(--soft);margin-bottom:22px">{esc(kicker.upper())}</div>' if kicker else ""
    pl = "".join(f'<div class="pill pp"><i>{CHECK}</i>{esc(p)}</div>' for p in pills)
    body = f"""<div class="col">
  {top}{kick}
  <div id="hl" class="big" style="font-size:calc({size}px * var(--head-scale))">{_spans(ws)}</div>
  <div id="pills" style="display:flex;flex-direction:column;align-items:center;gap:16px;margin-top:56px">{pl}</div>
</div>"""
    js = """
  fitH(document.getElementById("hl"), 420, 52);
  let t = 0.15;
  if (document.getElementById("link")) {
    popIn(tl, "#ta", 0.08, { from: 0.7 });
    popIn(tl, "#tb", 0.22, { from: 0.7 });
    draw(tl, "#ln", 0.32, 0.4);
    tl.fromTo("#dot", { attr: { cx: 160 }, opacity: 0 }, { attr: { cx: 480 }, opacity: 1, duration: 0.7, ease: "power1.inOut" }, 0.4);
    tl.to("#dot", { attr: { cx: 480 }, duration: 0.01 }, 1.1);
    gsap.utils.toArray(".bt").forEach((el, i) => {
      const ang = -100 + i * 22, d = 150 + (i % 2) * 40;
      const dx = Math.cos(ang * Math.PI / 180) * d * 0.55, dy = Math.sin(ang * Math.PI / 180) * d;
      tl.fromTo(el, { x: 0, y: 30, opacity: 0, scale: 0.3, rotation: 0 },
        { x: dx, y: dy, opacity: 1, scale: 0.55, rotation: -18 + i * 12, duration: 0.6, ease: "power3.out" }, 0.75 + i * 0.12);
      tl.to(el, { y: dy - 14, rotation: -12 + i * 10, duration: 1.2, ease: "sine.inOut", yoyo: true, repeat: 1 }, 1.4 + i * 0.12);
    });
    t = 0.3;
  }
  if (document.getElementById("kick")) { rise(tl, "#kick", 0.1, { y: 20 }); }
  let e = ink(tl, "#hl .w", WT, 0.08, t);
  if (document.querySelector(".pp")) { popIn(tl, ".pp", e + 0.05, { from: 0.8, y: 14, stagger: 0.3 }); e += 0.3 * document.querySelectorAll(".pp").length; }
  hold(tl, ".col", e + 0.3, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(ws), captions=False, exit=exit)


def kicker_title(gid, kicker, title, size=120, dur=3, exit=True):
    """A small spaced kicker over a big title, an accent underline drawing under it ("LET ME SHOW YOU / HOW IT WORKS")."""
    kw, tw = _words(kicker), _words(title)
    body = f"""<div class="col">
  <div id="kk" style="font-size:30px;font-weight:700;letter-spacing:0.26em;color:var(--soft);margin-bottom:20px;text-transform:uppercase">{_spans(kw, "w kw")}</div>
  <div id="tt" class="big" style="font-size:calc({size}px * var(--head-scale));text-transform:uppercase;line-height:1.02">{_spans(tw, "w tw")}</div>
  <svg style="width:260px;height:30px;margin-top:26px;overflow:visible"><path id="ul" class="dr" d="M 10 15 H 250" style="stroke:var(--accent)" stroke-width="8" stroke-linecap="round" fill="none"/></svg>
</div>"""
    js = """
  fitH(document.getElementById("tt"), 380, 56);
  const nk = document.querySelectorAll(".kw").length;
  const kt = WT ? WT.slice(0, nk) : null, tt = WT ? WT.slice(nk) : null;
  let e = ink(tl, ".kw", kt, 0.12, 0.12);
  e = ink(tl, ".tw", tt, 0.16, e);
  draw(tl, "#ul", e - 0.1, 0.45, { ease: "power3.out" });
  hold(tl, ".col", e + 0.4, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(kw) + _plain(tw), captions=False, exit=exit)


def question(gid, lead, big=None, dur=3.5, exit=True):
    """An accent "?" disc pops, a soft lead line inks in, then (optionally) the big answer in the accent."""
    lw = _words(lead)
    bw = _words(big) if big else []
    body = f"""<div class="col">
  <div id="q" style="width:120px;height:120px;border-radius:50%;background:var(--accent);color:var(--accent-ink);font-size:76px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:46px;box-shadow:0 14px 36px var(--glow)">?</div>
  <div id="ld" class="lead">{_spans(lw, "w lw")}</div>
  <div id="bg2" class="big" style="margin-top:18px;font-size:calc(96px * var(--head-scale))">{_spans(bw, "w bw")}</div>
</div>"""
    js = """
  document.querySelectorAll(".lw").forEach(e => e.dataset.c = SOFT);
  fitH(document.getElementById("bg2"), 330, 50);
  popIn(tl, "#q", 0.06, { from: 0.2, ease: "back.out(2.6)", d: 0.45 });
  tl.to("#q", { keyframes: [ { rotation: -10, duration: 0.12 }, { rotation: 8, duration: 0.12 }, { rotation: 0, duration: 0.16 } ] }, 0.5);
  const nl = document.querySelectorAll(".lw").length;
  let e = ink(tl, ".lw", WT ? WT.slice(0, nl) : null, 0.13, 0.3);
  e = ink(tl, ".bw", WT ? WT.slice(nl) : null, 0.17, e + 0.05);
  hold(tl, ".col", e + 0.3, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(lw) + _plain(bw), captions=False, exit=exit)


def strike(gid, lead, wrong, right, dur=4, exit=True):
    """A soft lead, the wrong idea big, a line strikes through it and it greys, then the correction pops
    in an accent pill."""
    lw, ww, rw = _words(lead), _words(wrong), _words(right)
    body = f"""<div class="col">
  <div id="ld" class="lead">{_spans(lw, "w lw")}</div>
  <div id="wr" class="big" style="position:relative;margin-top:16px;font-size:calc(96px * var(--head-scale))">{_spans(ww, "w ww")}
    <div id="st" style="position:absolute;left:-14px;right:-14px;top:50%;height:8px;margin-top:-2px;border-radius:4px;background:var(--ink)"></div>
  </div>
  <div id="rt" style="margin-top:40px;background:var(--accent);color:var(--accent-ink);font-size:72px;font-weight:820;padding:14px 38px 18px;border-radius:20px;box-shadow:0 16px 36px var(--glow)">{esc(" ".join(_plain(rw)))}</div>
</div>"""
    js = """
  document.querySelectorAll(".lw").forEach(e => e.dataset.c = SOFT);
  fitW(document.getElementById("wr"), 940, 50);
  const nl = document.querySelectorAll(".lw").length, nw = document.querySelectorAll(".ww").length;
  let e = ink(tl, ".lw", WT ? WT.slice(0, nl) : null, 0.13, 0.15);
  e = ink(tl, ".ww", WT ? WT.slice(nl, nl + nw) : null, 0.16, e);
  const rt = WT && WT[nl + nw] != null ? WT[nl + nw] - 0.1 : e + 0.25;
  const sAt = Math.max(e - 0.05, rt - 0.45);
  tl.fromTo("#st", { scaleX: 0, rotation: -1.2, transformOrigin: "0% 50%" }, { scaleX: 1, rotation: -1.2, duration: 0.3, ease: "power2.out" }, sAt);
  tl.to(".ww", { color: MUTED, duration: 0.25 }, sAt + 0.15);
  tl.fromTo("#rt", { opacity: 0, scale: 0.4, rotation: -8, filter: "blur(6px)" }, { opacity: 1, scale: 1, rotation: -2, filter: "blur(0px)", duration: 0.42, ease: "back.out(2.4)" }, rt);
  hold(tl, ".col", rt + 0.5, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(lw) + _plain(ww) + _plain(rw), captions=False, exit=exit)


def _window(title, inner, top=330, height=None, code=False):
    _no_dash(title)
    h = f"height:{height}px;" if height else ""
    return f"""<div id="win" class="winwrap" style="top:{top}px">
  <div class="win{' code' if code else ''}" style="{h}">
    <div class="bar"><div class="dots"><b style="background:#FF5F57"></b><b style="background:#FEBC2E"></b><b style="background:#28C840"></b></div>
      <div class="ttl"><em>&#10022;</em>{esc(title)}</div></div>
    <div class="body">{inner}</div>
  </div>
  <div class="deck"></div><div class="keys">{KEYS}</div>
</div>"""


def _code_html(lines):
    out = []
    for ln in lines:
        _no_dash(ln)
        toks = re.split(r'(</?[A-Za-z][\w.]*|/?>|"[^"]*"|//.*$)', ln)
        cells = []
        for tok in toks:
            if not tok:
                continue
            cls = "k" if re.match(r"</?[A-Za-z]|/?>", tok) else "s" if tok.startswith('"') else "m" if tok.startswith("//") else ""
            chars = "".join(f'<span class="ch">{esc(c)}</span>' for c in tok)
            cells.append(f'<span class="{cls}">{chars}</span>' if cls else chars)
        out.append(f'<div class="cl">{"".join(cells) or "&#8203;"}</div>')
    return "".join(out)


def code_window(gid, title, lines, note=None, thumbs=4, dur=4.5, exit=True):
    """An editor window; the code types itself in (tags in the accent), then an optional green note and a row
    of mini reels sliding up, as if rendered from the code."""
    _no_dash(note)
    th = "".join(f'<div class="tw2" style="position:relative;width:150px;height:260px">{thumb(k, "width:150px;height:260px;left:0;top:0")}</div>' for k in range(thumbs))
    nt = f'<div id="nt" style="font-size:26px;font-weight:650;color:var(--good);margin:34px 0 18px;text-align:left;letter-spacing:0">&#9679; {esc(note)}</div>' if note else ('<div style="height:40px"></div>' if thumbs else "")
    big = "" if thumbs else ' style="font-size:44px"'
    inner = f'<div class="code-t" id="cd"{big}>{_code_html(lines)}</div>{nt}' + (f'<div id="ths" style="display:flex;gap:22px">{th}</div>' if thumbs else "")
    body = _window(title, inner, top=300 if thumbs else 420, height=920 if thumbs else None, code=True)
    js = """
  winIn(tl);
  fitW(document.getElementById("cd"), 816, 22);
  let e = typeOn(tl, "#cd .ch", 0.5, 46);
  if (document.getElementById("nt")) rise(tl, "#nt", e + 0.05, { y: 16, d: 0.3 });
  rise(tl, ".tw2", e + 0.15, { y: 80, stagger: 0.12, d: 0.45 });
  hold(tl, "#win", e + 0.9, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def _curve(seed, n=9, w=820, h=300):
    r = random.Random(seed)
    pts = []
    for i in range(n):
        x = i * w / (n - 1)
        base = h * (0.82 - 0.7 * (i / (n - 1)) ** 1.6)
        pts.append((x, max(10, min(h - 6, base + r.uniform(-18, 18)))))
    d = f"M {pts[0][0]:.1f} {pts[0][1]:.1f} " + " ".join(
        f"C {pts[i - 1][0] + w / (n - 1) / 2:.1f} {pts[i - 1][1]:.1f} {pts[i][0] - w / (n - 1) / 2:.1f} {pts[i][1]:.1f} {pts[i][0]:.1f} {pts[i][1]:.1f}"
        for i in range(1, n))
    return d, pts[-1]


def stat_window(gid, title, stats, chart="traffic", tag="climbing", dur=5, exit=True):
    """A dashboard window: one or two stat tiles counting up (label, number[, prefix, suffix]), then a chart
    whose line draws left to right with a glowing head and the area filling in under it."""
    _no_dash(chart, tag, *[s[0] for s in stats])
    tiles = "".join(
        f'<div class="stat st{i}"><small>{esc(s[0])}</small><b class="num" data-to="{s[1]}" data-pre="{esc(s[2] if len(s) > 2 else "")}" data-suf="{esc(s[3] if len(s) > 3 else "")}">0</b></div>'
        for i, s in enumerate(stats[:2]))
    ch = ""
    if chart:
        d, (ex, ey) = _curve(_seed(gid))
        ch = f"""<div class="chart" id="chart"><small>{esc(chart)}</small>{f'<span class="tag">&#9650; {esc(tag)}</span>' if tag else ''}
  <svg viewBox="0 0 820 300" style="width:100%;height:300px;margin-top:16px;overflow:visible">
    <defs><linearGradient id="fa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent)" stop-opacity="0.55"/><stop offset="1" style="stop-color:var(--accent)" stop-opacity="0.02"/></linearGradient>
    <clipPath id="cp"><rect id="cpr" x="0" y="-20" width="0" height="340"/></clipPath>
    <filter id="gl" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <path d="{d} L 820 300 L 0 300 Z" fill="url(#fa)" clip-path="url(#cp)"/>
    <path id="cl" class="dr" d="{d}" style="stroke:var(--accent)" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle id="hg" cx="{ex:.1f}" cy="{ey:.1f}" r="16" style="fill:var(--accent)" filter="url(#gl)"/>
    <circle id="hd" cx="{ex:.1f}" cy="{ey:.1f}" r="9" fill="#fff" style="stroke:var(--accent)" stroke-width="4"/>
  </svg></div>"""
    inner = f'<div style="display:flex;gap:20px">{tiles}</div>{ch}'
    body = _window(title, inner, top=320)
    js = """
  winIn(tl);
  rise(tl, ".stat", 0.35, { y: 24, stagger: 0.12, d: 0.4 });
  // one number rolls at a time
  gsap.utils.toArray(".num").forEach((el, i) => count(tl, el, 0.45 + i * 0.9, 1.1, parseFloat(el.dataset.to), { prefix: el.dataset.pre, suffix: el.dataset.suf, ease: "power3.out" }));
  if (document.getElementById("chart")) {
    rise(tl, "#chart", 0.55, { y: 30, d: 0.4 });
    draw(tl, "#cl", 0.8, 1.4, { ease: "power2.inOut" });
    tl.fromTo("#cpr", { attr: { width: 0 } }, { attr: { width: 820 }, duration: 1.4, ease: "power2.inOut" }, 0.8);
    tl.fromTo(["#hg", "#hd"], { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, 2.1);
    tl.fromTo("#hg", { opacity: 1 }, { opacity: 0.35, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: 5 }, 2.4);
    if (document.querySelector(".tag")) popIn(tl, ".tag", 2.15, { from: 0.7 });
  }
  hold(tl, "#win", 2.4, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def bars_window(gid, title, bars, values=False, dur=4.5, exit=True):
    """Compare a few things as bars: [(label, value, accent?)]. Dim bars grow first, the accent one last."""
    _no_dash(title, *[b[0] for b in bars])
    mx = max(b[1] for b in bars) or 1
    cols = []
    for i, b in enumerate(bars):
        acc = b[2] if len(b) > 2 else i == len(bars) - 1
        h = max(0.06, b[1] / mx) * 420
        val = f'<div class="bval" data-to="{b[1]}">0</div>' if values else ""
        col = "var(--accent)" if acc else "var(--bar-dim)"
        glow = "box-shadow:0 0 40px var(--glow);" if acc else ""
        cols.append(f'<div class="bcol">{val}<div class="bfill bf{i}" style="height:{h:.0f}px;background:{col};{glow}"></div><div class="blab">{esc(b[0])}</div></div>')
    body = _window(title, f'<div class="bars">{"".join(cols)}</div>', top=330)
    js = """
  winIn(tl);
  const fills = gsap.utils.toArray(".bfill");
  fills.forEach((el, i) => tl.fromTo(el, { scaleY: 0 }, { scaleY: 1, duration: i === fills.length - 1 ? 0.9 : 0.5, ease: i === fills.length - 1 ? "power3.out" : "power2.out" }, 0.45 + i * 0.5));
  rise(tl, ".blab", 0.35, { y: 16, stagger: 0.1, d: 0.3 });
  gsap.utils.toArray(".bval").forEach((el, i) => count(tl, el, 0.45 + i * 0.5, i === fills.length - 1 ? 0.9 : 0.5, parseFloat(el.dataset.to)));
  hold(tl, "#win", 0.45 + fills.length * 0.5 + 0.5, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def list_window(gid, title, rows, dur=4.5, exit=True):
    """Rows tick in one after another: [(text, good?)] (good rows get a green tick, bad ones a red cross)."""
    _no_dash(title, *[r[0] for r in rows])
    rs = "".join(
        f'<div class="row rr"><i style="background:{"var(--good)" if (r[1] if len(r) > 1 else True) else "var(--bad)"}">{CHECK if (r[1] if len(r) > 1 else True) else CROSS}</i><span>{esc(r[0])}</span></div>'
        for r in rows)
    body = _window(title, f'<div id="rows">{rs}</div>', top=360)
    js = """
  winIn(tl);
  const rows = gsap.utils.toArray(".rr");
  rows.forEach((el, i) => {
    const at = 0.5 + i * Math.min(0.42, 2.2 / rows.length);
    tl.fromTo(el, { opacity: 0, x: -40, filter: "blur(6px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.34, ease: "power3.out" }, at);
    tl.fromTo(el.querySelector("i"), { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, at + 0.12);
  });
  hold(tl, "#win", 0.5 + rows.length * 0.42 + 0.3, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def ui_steps(gid, app, steps, sidebar=("Home", "Chats", "Projects", "Settings"), dur=5, exit=True):
    """An app walkthrough: a sidebar and a dialog that changes per step, a hand-drawn arrow drawing itself to
    the thing to click. steps: [(title, kind, value, cue)] with kind "button" | "field" | "toggle"; `value`
    is the button label, the typed text or the toggle's label; `cue` (optional) is the spoken word the step
    lands on. Studio's captions carry the words."""
    _no_dash(app, *sidebar, *[x for s in steps for x in s[:3]])
    side = "".join(f'<div style="font-size:30px;font-weight:600;color:var(--win-dim);padding:10px 14px;border-radius:10px" class="si">{esc(s)}</div>' for s in sidebar)
    panes = []
    for i, st in enumerate(steps):
        title, kind, value = st[0], st[1], st[2]
        if kind == "button":
            el = f'<div class="tgt" style="display:inline-block;background:var(--accent);color:var(--accent-ink);font-size:38px;font-weight:760;padding:20px 38px;border-radius:16px">{esc(value)}</div>'
        elif kind == "field":
            chars = "".join(f'<span class="ch">{esc(c)}</span>' for c in value)
            el = f'<div class="tgt" style="text-align:left;border:2px solid var(--win-line);border-radius:12px;padding:20px 22px;font-size:38px;font-weight:560;color:var(--win-text);background:var(--win)"><span class="typ">{chars}</span><span class="car" style="display:inline-block;width:3px;height:30px;background:var(--accent);vertical-align:middle;margin-left:2px"></span></div>'
        else:
            el = (f'<div class="tgt" style="display:flex;align-items:center;justify-content:space-between;font-size:38px;font-weight:650;color:var(--win-text)">{esc(value)}'
                  f'<span class="sw" style="position:relative;width:86px;height:48px;border-radius:30px;background:var(--bar-dim)"><i class="kn" style="position:absolute;left:5px;top:5px;width:38px;height:38px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2)"></i></span></div>')
        panes.append(f'<div class="pane" id="pn{i}" style="position:absolute;left:40px;right:40px;top:120px;background:var(--win);border-radius:18px;padding:34px;box-shadow:0 20px 50px rgba(0,0,0,.14),0 0 0 1px var(--win-line);text-align:left">'
                     f'<div style="font-size:42px;font-weight:780;color:var(--win-text);margin-bottom:30px">{esc(title)}</div>{el}</div>')
    inner = f"""<div style="display:flex;height:720px;margin:-46px -52px">
  <div style="width:250px;background:var(--win-tile);padding:26px 14px;text-align:left">
    <div style="font-size:34px;font-weight:800;color:var(--win-text);margin:0 14px 28px"><span style="color:var(--accent)">&#10022;</span> {esc(app)}</div>{side}</div>
  <div style="flex:1;position:relative">{"".join(panes)}
    <div id="ar" style="position:absolute;width:220px;height:160px;left:0;top:0">{HAND_ARROW}</div></div>
</div>"""
    body = _window(app, inner, top=360)
    js = """
  winIn(tl);
  const panes = gsap.utils.toArray(".pane"), n = panes.length;
  const cues = WT || [];
  const span = Math.max(1.0, (DUR - 1.6) / n);
  gsap.set(panes, { opacity: 0 });
  const box = document.querySelector("#win .body > div > div:last-child").getBoundingClientRect();
  panes.forEach((p, i) => {
    const at = cues[i] != null ? Math.max(0.5, cues[i] - 0.3) : 0.6 + i * span;
    if (i > 0) tl.to(panes[i - 1], { opacity: 0, y: -20, filter: "blur(8px)", duration: 0.25 }, at - 0.05);
    tl.fromTo(p, { opacity: 0, y: 30, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.35, ease: "power3.out" }, at);
    const t = p.querySelector(".tgt").getBoundingClientRect();
    const ax = t.right - box.left - 40, ay = t.top - box.top - 150;
    tl.set("#ar", { x: ax, y: ay }, at + 0.2);
    tl.fromTo("#ar .ha", { strokeDashoffset: parseFloat(getComputedStyle(document.querySelector("#ar .ha")).strokeDasharray) }, { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" }, at + 0.25);
    tl.fromTo("#ar .hb", { strokeDashoffset: parseFloat(getComputedStyle(document.querySelector("#ar .hb")).strokeDasharray) }, { strokeDashoffset: 0, duration: 0.15, ease: "power2.out" }, at + 0.58);
    const typ = p.querySelectorAll(".typ .ch");
    if (typ.length) typeOn(tl, typ, at + 0.6, 18);
    const kn = p.querySelector(".kn");
    if (kn) { tl.to(kn, { x: 38, duration: 0.25, ease: "power2.out" }, at + 0.8); tl.to(p.querySelector(".sw"), { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--good"), duration: 0.25 }, at + 0.8); }
    if (!typ.length && !kn) tl.to(p.querySelector(".tgt"), { keyframes: [ { scale: 0.92, duration: 0.1 }, { scale: 1, duration: 0.2, ease: "back.out(3)" } ] }, at + 0.85);
  });
  hold(tl, "#win", 0.6, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[s[3] for s in steps if len(s) > 3 and s[3]], captions=True, exit=exit)


def equation(gid, a, b, result, dur=3, exit=True):
    """The equation hook: tile + tile = result (each an icon name), popping in one after another."""
    def part(x, cls):
        return f'<div class="tile eq {cls}" style="width:170px;height:170px">{icon(x)}</div>'
    body = f"""<div class="col" style="flex-direction:row;gap:30px">
  {part(a, "e1")}<div class="op o1" style="font-size:90px;font-weight:800;color:var(--ink)">+</div>{part(b, "e2")}
  <div class="op o2" style="font-size:90px;font-weight:800;color:var(--ink)">=</div><div class="tile eq e3 glow" style="width:170px;height:170px">{icon(result)}</div>
</div>"""
    js = """
  popIn(tl, ".e1", 0.1, { from: 0.4, ease: "back.out(2.6)" });
  popIn(tl, ".o1", 0.35, { from: 0.3 });
  popIn(tl, ".e2", 0.5, { from: 0.4, ease: "back.out(2.6)" });
  popIn(tl, ".o2", 0.75, { from: 0.3 });
  popIn(tl, ".e3", 0.95, { from: 0.2, ease: "back.out(3)", d: 0.5 });
  tl.to(".e3", { keyframes: [ { rotation: -8, duration: 0.1 }, { rotation: 6, duration: 0.1 }, { rotation: 0, duration: 0.14 } ] }, 1.4);
  hold(tl, ".col", 1.6, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def fan(gid, n=7, badge=None, dur=3.5, exit=True):
    """A stack of phone screens fanning out in an arc (a week of posts), an optional accent badge popping under it."""
    _no_dash(badge)
    phones = "".join(f'<div class="ph" style="position:absolute;left:{540 - 95}px;top:560px;width:190px;height:340px;border-radius:26px;overflow:hidden;border:6px solid #111;box-shadow:0 20px 40px rgba(0,0,0,.35)">{thumb(i, "position:absolute;left:0;top:0;width:100%;height:100%;border:0;border-radius:0")}</div>' for i in range(n))
    bd = f'<div id="badge" style="position:absolute;left:0;right:0;top:1000px;display:flex;justify-content:center"><div style="background:var(--accent);color:var(--accent-ink);font-size:44px;font-weight:800;padding:14px 32px;border-radius:40px;box-shadow:0 14px 34px var(--glow)">{esc(badge)} &#10003;</div></div>' if badge else ""
    body = phones + bd
    js = """
  const ph = gsap.utils.toArray(".ph"), n = ph.length;
  ph.forEach((el, i) => {
    const k = i - (n - 1) / 2, rot = k * 9, dx = k * 120, dy = Math.abs(k) * 26;
    tl.fromTo(el, { opacity: 0, y: 200, rotation: 0, x: 0, scale: 0.8 }, { opacity: 1, y: 0, scale: 0.85, duration: 0.35, ease: "power3.out" }, 0.1 + i * 0.04);
    tl.to(el, { x: dx, y: dy, rotation: rot, scale: 1, duration: 0.6, ease: "back.out(1.4)" }, 0.55);
  });
  if (document.getElementById("badge")) popIn(tl, "#badge div", 1.2, { from: 0.4, ease: "back.out(2.6)" });
  hold(tl, "#stage", 1.6, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def counter_card(gid, title, value, tags=(), items=(), dur=4, exit=True):
    """A repo-style card: a title line, a big number counting up beside an accent square, tag chips, then a
    two-column list of items typing in."""
    _no_dash(title, *tags, *items)
    tg = "".join(f'<span class="tg" style="font-family:PMono;font-size:22px;font-weight:600;padding:4px 14px;border-radius:20px;border:2px solid {c};color:{c};letter-spacing:0.06em">{esc(t.upper())}</span>'
                 for t, c in zip(tags, ["var(--code-text)", "#3FB950", "#F0883E", "#58A6FF"]))
    half = (len(items) + 1) // 2
    colh = lambda xs: "".join(f'<div class="it" style="font-family:PMono;font-size:26px;color:var(--code-str);margin-top:10px">&#8226; {esc(x)}</div>' for x in xs)
    body = f"""<div id="win" class="winwrap" style="top:420px"><div class="win code" style="padding:34px 40px 40px;text-align:left">
  <div style="display:flex;align-items:center;gap:14px;font-family:PMono;font-size:28px;color:var(--code-text)"><span style="width:34px;height:34px;display:inline-block">{icon("folder")}</span>{esc(title)}</div>
  <div style="display:flex;align-items:center;gap:26px;margin-top:26px"><div style="width:110px;height:110px;border-radius:26px;background:var(--accent);display:flex;align-items:center;justify-content:center"><span style="width:62px;height:62px;display:block;filter:brightness(10)">{icon("spark")}</span></div>
    <b id="cv" style="font-size:150px;font-weight:840;color:var(--code-text);line-height:1;letter-spacing:-0.03em">0</b></div>
  <div style="display:flex;gap:12px;margin-top:22px">{tg}</div>
  <div style="display:flex;gap:40px;margin-top:20px"><div>{colh(items[:half])}</div><div>{colh(items[half:])}</div></div>
</div><div class="deck"></div><div class="keys">{KEYS}</div></div>"""
    css = "#win .ic-s { stroke: var(--code-text); }"
    js = f"""
  winIn(tl);
  count(tl, document.getElementById("cv"), 0.4, 1.1, {int(value)}, {{ ease: "power3.out" }});
  rise(tl, ".tg", 0.9, {{ y: 14, stagger: 0.1, d: 0.3 }});
  rise(tl, ".it", 1.2, {{ y: 10, stagger: 0.07, d: 0.25 }});
  hold(tl, "#win", 1.8, DUR);
"""
    return dict(dur=dur, css=css, body=body, js=js, words=[], captions=True, exit=exit)


def hub(gid, text, center="spark", n=6, dur=4, exit=True):
    """A centre tile with accent rays drawing out to floating mini reels, the line inking in under it."""
    ws = _words(text)
    r = random.Random(_seed(gid))
    rays, cards = [], []
    for i in range(n):
        ang = -160 + i * (140 / max(1, n - 1)) + r.uniform(-6, 6)
        L = r.uniform(230, 330)
        x, y = 540 + math.cos(math.radians(ang)) * L, 470 + math.sin(math.radians(ang)) * L * 0.8
        rays.append(f'<path class="dr ray" d="M 540 470 L {x:.0f} {y:.0f}" style="stroke:var(--accent)" stroke-width="3.2" stroke-linecap="round" fill="none"/>')
        cards.append(f'<div class="hc" style="position:absolute;left:{x - 44:.0f}px;top:{y - 76:.0f}px;width:88px;height:152px">{thumb(i, "width:88px;height:152px;left:0;top:0;border-radius:12px")}</div>')
    body = f"""<div style="position:absolute;left:0;top:0;width:1080px;height:1000px">
  <svg style="position:absolute;left:0;top:0;width:1080px;height:1000px;overflow:visible">{"".join(rays)}</svg>
  {"".join(cards)}
  <div id="ct" class="tile glow" style="position:absolute;left:455px;top:385px;width:170px;height:170px">{icon(center)}</div>
</div>
<div class="col" style="top:880px;height:300px"><div id="hl" class="big" style="font-size:calc(80px * var(--head-scale))">{_spans(ws)}</div></div>"""
    js = """
  fitH(document.getElementById("hl"), 260, 46);
  popIn(tl, "#ct", 0.08, { from: 0.4, ease: "back.out(2.4)", d: 0.5 });
  draw(tl, ".ray", 0.3, 0.45, { stagger: 0.06, ease: "power3.out" });
  gsap.utils.toArray(".hc").forEach((el, i) => {
    tl.fromTo(el, { opacity: 0, scale: 0.3, x: 0, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(1.8)" }, 0.55 + i * 0.07);
    tl.to(el, { y: -12 + (i % 2) * 6, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: 1 }, 1.1 + i * 0.07);
  });
  const e = ink(tl, "#hl .w", WT, 0.08, 0.5);
  hold(tl, "#ct", e, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(ws), captions=False, exit=exit)


def comment_cta(gid, lead, keyword, reply="DM sent: all the details", after=None, dur=5, exit=False):
    """The ask: a soft lead, "Comment KEYWORD" with an accent star, a comment box that types the keyword and
    posts it, then an auto-reply pill sliding in (and an optional small line after it)."""
    _no_dash(lead, keyword, reply, after)
    lw = _words(lead)
    kw = keyword.upper()
    chars = "".join(f'<span class="ch">{esc(c)}</span>' for c in kw)
    af = f'<div id="af" style="font-size:30px;font-weight:600;color:var(--soft);margin-top:34px">{esc(after)}</div>' if after else ""
    body = f"""<div class="col">
  <div id="ld" class="lead" style="font-size:42px">{_spans(lw, "w lw")}</div>
  <div id="cm" style="display:flex;align-items:center;gap:16px;margin:14px 0 54px">
    <svg id="cs" viewBox="0 0 64 64" style="width:62px;height:62px"><path class="ic-a" d="M32 4 C34 22 42 30 60 32 C42 34 34 42 32 60 C30 42 22 34 4 32 C22 30 30 22 32 4 Z"/></svg>
    <span class="big" style="font-size:calc(96px * var(--head-scale))"><span class="w cw">Comment</span> <span class="w cw ac">{esc(kw)}</span></span></div>
  <div id="box" style="width:920px;height:104px;border-radius:52px;background:var(--card);display:flex;align-items:center;padding:0 34px;gap:22px;box-shadow:var(--card-shadow)">
    <i style="width:50px;height:50px;border-radius:50%;background:#E6DED1;display:block;flex:none"></i>
    <div style="flex:1;text-align:left;font-size:38px;font-weight:600;position:relative;height:50px;line-height:50px">
      <span id="ph" style="position:absolute;left:0;top:0;color:#B9B1A4">Add a comment...</span><span id="ty" style="position:absolute;left:0;top:0;color:var(--card-text)">{chars}</span></div>
    <div style="position:relative;width:150px;height:50px;line-height:50px;text-align:right;font-size:32px;font-weight:750">
      <span id="post" style="position:absolute;right:0;top:0;color:var(--accent)">Post</span><span id="posted" style="position:absolute;right:0;top:0;color:var(--good);white-space:nowrap">Posted &#10003;</span></div>
  </div>
  <div id="rp" style="margin-top:34px;width:920px;text-align:left">
    <div style="font-size:22px;font-weight:800;letter-spacing:0.2em;color:var(--accent);margin:0 0 10px 12px">AUTO-REPLY</div>
    <div style="background:var(--accent);color:var(--accent-ink);font-size:36px;font-weight:720;padding:22px 30px;border-radius:22px;box-shadow:0 14px 34px var(--glow)">&#9679;&nbsp; {esc(reply)}</div>
  </div>
  {af}
</div>"""
    js = """
  document.querySelectorAll(".lw").forEach(e => e.dataset.c = SOFT);
  const nl = document.querySelectorAll(".lw").length;
  let e = ink(tl, ".lw", WT ? WT.slice(0, nl) : null, 0.12, 0.12);
  popIn(tl, "#cs", e - 0.05, { from: 0.2, ease: "back.out(3)" });
  tl.to("#cs", { rotation: 90, duration: 1.2, ease: "power2.out" }, e);
  e = ink(tl, ".cw", WT ? WT.slice(nl) : null, 0.2, e);
  rise(tl, "#box", e - 0.2, { y: 30, d: 0.4 });
  tl.set("#ty .ch", { opacity: 0 }, 0);
  tl.to("#ph", { opacity: 0, duration: 0.1 }, e + 0.25);
  e = typeOn(tl, "#ty .ch", e + 0.3, 12);
  tl.fromTo("#posted", { opacity: 0 }, { opacity: 1, duration: 0.2 }, e + 0.25);
  tl.to("#post", { opacity: 0, duration: 0.15 }, e + 0.2);
  tl.fromTo("#posted", { scale: 0.7 }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, e + 0.25);
  rise(tl, "#rp", e + 0.6, { y: 50, d: 0.45, ease: "back.out(1.4)" });
  if (document.getElementById("af")) rise(tl, "#af", e + 1.1, { y: 16, d: 0.35 });
  hold(tl, ".col", e + 1.3, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(lw) + ["Comment", kw], captions=False, exit=exit)


def lens(gid, word, rows=5, dur=4, exit=True):
    """Rows of one word scrolling as marquees, soft and grey, while a glass lens glides across and shows them
    sharp, dark and magnified inside it. Best in "glass"; works anywhere. Studio's captions carry the words."""
    _no_dash(word)
    row = esc((word + "  ") * 6)
    rws = "".join(f'<div class="lr" style="position:absolute;left:-600px;top:{430 + i * 170}px;white-space:pre;font-size:150px;font-weight:420;letter-spacing:-0.04em;line-height:1">{row}</div>' for i in range(rows))
    body = f"""<div id="soft" style="position:absolute;inset:0;color:var(--muted);filter:blur(3px)">{rws}</div>
<div id="lensw" style="position:absolute;left:300px;top:640px;width:480px;height:480px;border-radius:120px;overflow:hidden;
  box-shadow:0 30px 70px rgba(60,30,120,.22), inset 0 2px 0 rgba(255,255,255,.95), inset 0 -10px 30px rgba(110,58,240,.10), 0 0 0 2px rgba(255,255,255,.85);
  background:rgba(255,255,255,.18)">
  <div id="sharp" style="position:absolute;left:-300px;top:-640px;width:1080px;height:1920px;color:var(--ink);transform-origin:540px 880px">{rws}</div>
</div>"""
    js = """
  const rows = gsap.utils.toArray("#soft .lr"), srows = gsap.utils.toArray("#sharp .lr");
  rows.forEach((r, i) => { const a = i % 2 ? -300 : 0, b = i % 2 ? 0 : -300;
    tl.fromTo([r, srows[i]], { x: a }, { x: b, duration: DUR, ease: "none" }, 0); });
  tl.fromTo("#lensw", { x: -260, opacity: 0, scale: 0.9 }, { x: -260, opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, 0.1);
  tl.to("#lensw", { x: 260, duration: DUR - 0.8, ease: "sine.inOut" }, 0.5);
  tl.fromTo("#sharp", { x: 260, scale: 1.14 }, { x: 260, scale: 1.14, duration: 0.01 }, 0);
  tl.to("#sharp", { x: -260, duration: DUR - 0.8, ease: "sine.inOut" }, 0.5);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def read_card(gid, paragraphs, art=("store", "cart"), dur=6, exit=True):
    """A read-post: a rounded image card (two icon panels side by side), then short paragraphs fading in,
    figures and key phrases in braces picked out in the accent. Best in "brief". The card shows the words
    itself (Studio's captions step aside)."""
    paras = [_words(t) for t in paragraphs]
    a, b = art
    pics = (f'<div id="art" style="position:absolute;left:60px;right:60px;top:250px;height:500px;border-radius:17px;overflow:hidden;display:flex;box-shadow:var(--card-shadow)">'
            f'<div style="flex:1;background:linear-gradient(160deg,#3A2A20,#8C4A2A);display:flex;align-items:center;justify-content:center"><div class="tile" style="width:200px;height:200px">{icon(a)}</div></div>'
            f'<div style="flex:1;background:linear-gradient(200deg,#1E2A44,#2E5A8C);display:flex;align-items:center;justify-content:center"><div class="tile" style="width:200px;height:200px">{icon(b)}</div></div></div>')
    body = pics + '<div id="txt" style="position:absolute;left:60px;right:60px;top:810px;text-align:left">' + "".join(
        f'<p class="para" style="font-size:40px;font-weight:650;line-height:1.18;color:var(--ink);margin-bottom:34px;letter-spacing:-0.005em">{_spans(pw)}</p>' for pw in paras) + "</div>"
    js = """
  fitH(document.getElementById("txt"), 640, 26);
  rise(tl, "#art", 0.05, { y: 30, d: 0.5 });
  const ps = gsap.utils.toArray(".para");
  let k = 0;
  ps.forEach((p, i) => {
    const n = p.querySelectorAll(".w").length;
    const at = WT && WT[k] != null ? Math.max(0.3, WT[k] - 0.1) : 0.4 + i * 0.45;
    tl.fromTo(p, { opacity: 0, y: 18, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.4, ease: "power3.out" }, at);
    k += n;
  });
  hold(tl, "#txt", 1.6, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[w for pw in paras for w in _plain(pw)], captions=False, exit=exit)


def chat_thread(gid, contact, messages, dur=8, exit=True):
    """A messenger thread filling the frame: header with the contact, bubbles arriving one by one (theirs after
    typing dots, yours typed into the input first), the thread scrolling up. messages: [("me" | "them", text)].
    Best in "chat". Shows the words itself."""
    _no_dash(contact, *[m[1] for m in messages])
    initial = esc(contact.strip()[:1].upper())
    bub = []
    for i, (who, text) in enumerate(messages):
        me = who == "me"
        st = ("align-self:flex-end;background:linear-gradient(180deg,#2D93FB,#1F7FEA);color:#fff;border-bottom-right-radius:10px" if me
              else "align-self:flex-start;background:#E9E9EB;color:#000;border-bottom-left-radius:10px")
        bub.append(f'<div class="bw" data-me="{1 if me else 0}" style="display:flex;flex-direction:column;overflow:hidden;height:0">'
                   f'<div class="bb" style="{st};max-width:760px;font-size:40px;font-weight:450;line-height:1.25;padding:20px 30px;border-radius:40px;letter-spacing:-0.005em;margin-top:16px">{esc(text)}</div></div>')
    typing = ('<div id="dots3" style="position:absolute;left:40px;bottom:0;background:#E9E9EB;border-radius:36px;padding:24px 30px;display:flex;gap:10px;opacity:0">'
              + "".join('<i style="width:16px;height:16px;border-radius:50%;background:#8E8E93;display:block"></i>' for _ in range(3)) + "</div>")
    key = '<b style="width:{w}px;height:92px;border-radius:12px;background:#FFFFFF;box-shadow:0 2px 0 #898A8D;display:block"></b>'
    keys = "".join('<div style="display:flex;justify-content:center;gap:12px;margin-top:16px">' + key.format(w=w) * n + "</div>"
                   for n, w in ((10, 90), (9, 90), (7, 90), (3, 150)))
    body = f"""<div style="position:absolute;left:0;right:0;top:110px;height:230px;background:rgba(248,248,248,0.94);border-bottom:1px solid #E5E5EA;display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div style="width:110px;height:110px;border-radius:50%;background:linear-gradient(180deg,#D9577F,#B83A63);color:#fff;font-size:54px;font-weight:600;display:flex;align-items:center;justify-content:center">{initial}</div>
  <div style="margin-top:10px;font-size:30px;font-weight:500;color:#000">{esc(contact)} &#8250;</div></div>
<div style="position:absolute;left:0;right:0;top:350px;text-align:center;font-size:24px;color:#8E8E93;font-weight:500">iMessage<br/>Today</div>
<div style="position:absolute;left:40px;right:40px;top:420px;height:780px;overflow:hidden">
  <div id="thr" style="position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column">{"".join(bub)}</div>{typing}</div>
<div style="position:absolute;left:0;right:0;top:1220px;height:700px;background:#D5D9E1">
  <div style="margin:24px 30px 0;height:84px;border-radius:42px;background:#fff;border:2px solid #C7C7CC;display:flex;align-items:center;padding:0 30px;font-size:36px;color:#000;position:relative">
    <span id="inp"></span><span style="position:absolute;right:10px;top:10px;width:64px;height:64px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:36px">&#8593;</span></div>
  {keys}</div>"""
    js = """
  const ws = gsap.utils.toArray(".bw"), inp = document.getElementById("inp");
  const msgs = __MSGS__;
  let k = 0, prev = 0.2;
  ws.forEach((w, i) => {
    const h = w.querySelector(".bb").offsetHeight + 16;
    let at = WT && WT[k] != null ? Math.max(prev + 0.5, WT[k]) : prev + 1.6;
    k += msgs[i][1].split(/\s+/).length;
    if (w.dataset.me === "1") {
      const txt = msgs[i][1], d = Math.min(1.1, txt.length / 16), t0 = Math.max(prev + 0.1, at - d - 0.15);
      const o = { n: 0 };
      tl.to(o, { n: txt.length, duration: Math.max(0.2, at - 0.15 - t0), ease: "none", onUpdate: () => { inp.textContent = txt.slice(0, Math.round(o.n)); } }, t0);
      tl.set(inp, { textContent: "" }, at);
    } else {
      tl.fromTo("#dots3", { opacity: 0 }, { opacity: 1, duration: 0.12 }, Math.max(prev + 0.1, at - 0.75));
      tl.to("#dots3 i", { keyframes: [ { y: -6, duration: 0.15 }, { y: 0, duration: 0.15 } ], stagger: 0.1, repeat: 1 }, Math.max(prev + 0.1, at - 0.7));
      tl.set("#dots3", { opacity: 0 }, at);
    }
    tl.to(w, { height: h, duration: 0.22, ease: "power2.out" }, at);
    tl.fromTo(w.querySelector(".bb"), { scale: 0.85, opacity: 0, transformOrigin: w.dataset.me === "1" ? "100% 100%" : "0% 100%" }, { scale: 1, opacity: 1, duration: 0.2, ease: "back.out(2)" }, at);
    prev = at;
  });
"""
    js = js.replace("__MSGS__", json.dumps(messages))
    words = [w for _, t in messages for w in t.split()]
    return dict(dur=dur, css="", body=body, js=js, words=words, captions=False, exit=exit)


def post_card(gid, name, handle, hook, payoff, media=None, art="spark", dur=6, exit=True):
    """A repost frame: avatar, name, badge and handle, a serif hook, a picture (media = an image file, shown with a
    slow push-in; else a drawn scene with the `art` icon), the serif payoff underneath. Best in "post"."""
    _no_dash(name, handle, hook, payoff)
    hw, pw = _words(hook), _words(payoff)
    files = {}
    if media:
        ext = Path(media).suffix.lower()
        files["media" + ext] = media
        pic = f'<img id="pic" src="assets/media{ext}" style="width:100%;height:100%;object-fit:cover;display:block"/>'
    else:
        pic = (f'<div id="pic" style="width:100%;height:100%;background:radial-gradient(70% 70% at 50% 40%, #2B3A55 0%, #0E1420 80%);display:flex;align-items:center;justify-content:center">'
               f'<div class="tile" style="width:260px;height:260px;border-radius:60px">{icon(art)}</div></div>')
    body = f"""<div style="position:absolute;left:60px;top:300px;display:flex;align-items:center;gap:24px">
  <div style="width:120px;height:120px;border-radius:50%;background:linear-gradient(160deg,#3A3A3A,#111);border:2px solid #333;color:#EDEDED;font-family:PGeorgia;font-size:60px;display:flex;align-items:center;justify-content:center">{esc(name.strip()[:1].upper())}</div>
  <div style="text-align:left"><div style="font-size:36px;font-weight:750;color:var(--ink);display:flex;align-items:center;gap:10px">{esc(name)}<span style="width:34px;height:34px;border-radius:50%;background:var(--accent);display:inline-flex;align-items:center;justify-content:center"><span style="width:22px;height:22px;display:block">{CHECK}</span></span></div>
  <div style="font-size:28px;color:var(--soft);font-weight:500">{esc(handle)}</div></div></div>
<div id="hk" class="big" style="position:absolute;left:60px;right:60px;top:470px;text-align:center;font-size:46px">{_spans(hw, "w hw")}</div>
<div id="mw" style="position:absolute;left:28px;right:28px;top:620px;height:640px;overflow:hidden">{pic}</div>
<div id="po" class="big" style="position:absolute;left:60px;right:60px;top:1290px;text-align:center;font-size:44px">{_spans(pw, "w pw")}</div>"""
    js = """
  fitH(document.getElementById("hk"), 140, 30); fitH(document.getElementById("po"), 140, 30);
  const nh = document.querySelectorAll(".hw").length;
  rise(tl, "#mw", 0.05, { y: 20, d: 0.4 });
  tl.fromTo("#pic", { scale: 1 }, { scale: 1.09, duration: DUR, ease: "none" }, 0);
  ink(tl, ".hw", WT ? WT.slice(0, nh) : null, 0.1, 0.15);
  ink(tl, ".pw", WT ? WT.slice(nh) : null, 0.12, Math.max(1.6, DUR - 2.4));
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(hw) + _plain(pw), captions=False, exit=exit, files=files)


def cheat_sheet(gid, line1, line2, rows, footer=None, dur=8, exit=True):
    """A saveable cheat sheet: two lines of condensed capitals (the second in the accent), then rows ticking in,
    each an icon, a short accent rule and a line of text with the key word in braces. rows: [(icon, text)].
    Best in "poster". Shows the words itself."""
    _no_dash(line1, line2, footer, *[r[1] for r in rows])
    rws = []
    for i, (ic, text) in enumerate(rows):
        ws = _words(text)
        rws.append(f'<div class="cr" style="display:flex;align-items:center;gap:26px;padding:16px 0;border-bottom:1.5px solid var(--line);text-align:left">'
                   f'<div style="flex:none;width:84px;height:84px">{icon(ic)}</div><div style="flex:none;width:4px;height:70px;background:var(--accent)"></div>'
                   f'<div class="ct" style="font-size:36px;font-weight:620;line-height:1.2;color:var(--ink)">{_spans(ws, "w cw")}</div></div>')
    ft = f'<div id="ft" style="display:flex;align-items:center;gap:20px;margin-top:30px;font-size:30px;color:var(--ink);font-weight:600"><i style="width:120px;height:2px;background:var(--ink);display:block"></i>{esc(footer)}<i style="width:120px;height:2px;background:var(--ink);display:block"></i></div>' if footer else ""
    body = f"""<div class="col" style="top:250px;height:1050px;justify-content:flex-start">
  <div id="l1" class="big" style="font-size:calc(66px * var(--head-scale))">{esc(line1)}</div>
  <div id="l2" class="big" style="font-size:calc(80px * var(--head-scale));color:var(--accent);margin-bottom:22px">{esc(line2)}</div>
  <div id="rows" style="width:100%">{"".join(rws)}</div>{ft}</div>"""
    css = ".cr .ac { color: var(--accent); text-transform: uppercase; } .cr svg { width: 84px; height: 84px; }"
    js = """
  fitW(document.getElementById("l1"), 940, 40); fitW(document.getElementById("l2"), 940, 40);
  fitH(document.getElementById("rows"), 820, 22);
  rise(tl, "#l1", 0.05, { y: 20, d: 0.35 }); rise(tl, "#l2", 0.2, { y: 24, d: 0.4 });
  let k = 0;
  gsap.utils.toArray(".cr").forEach((r, i) => {
    const n = r.querySelectorAll(".w").length;
    const at = WT && WT[k] != null ? Math.max(0.5, WT[k] - 0.1) : 0.6 + i * Math.min(0.55, (DUR - 2) / 9);
    tl.fromTo(r, { opacity: 0, x: -30, filter: "blur(6px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.32, ease: "power3.out" }, at);
    tl.set(r.querySelectorAll(".w"), { opacity: 1 }, at);
    k += n;
  });
  if (document.getElementById("ft")) rise(tl, "#ft", Math.max(1.5, DUR - 2), { y: 14, d: 0.3 });
"""
    return dict(dur=dur, css=css, body=body, js=js, words=[w for _, t in rows for w in _plain(_words(t))], captions=False, exit=exit)


def page_card(gid, caption, pairs, dur=7, exit=True):
    """A page from a book: a plain white caption bar on top, then bold serif labels each with a one-line answer,
    fading in as the lamp comes up. pairs: [(label, answer)]. Best in "page". Shows the words itself."""
    _no_dash(caption, *[x for pr in pairs for x in pr])
    items = "".join(f'<div class="pp2" style="margin-bottom:34px"><div style="font-family:PGeorgia;font-weight:700;font-size:44px;color:var(--ink)">{esc(a)}</div>'
                    f'<div style="font-family:PGeorgia;font-weight:400;font-size:40px;color:var(--ink);margin-top:6px;line-height:1.3">{esc(b)}</div></div>' for a, b in pairs)
    body = f"""<div style="position:absolute;left:0;right:0;top:230px;height:150px;background:#fff;display:flex;align-items:center;justify-content:center;padding:0 50px;box-shadow:0 2px 0 rgba(0,0,0,0.08)">
  <div id="cap" style="font-size:44px;font-weight:800;color:#000;text-align:center;line-height:1.15">{esc(caption)}</div></div>
<div id="pg" style="position:absolute;left:90px;right:90px;top:450px;text-align:left">{items}</div>"""
    js = """
  fitH(document.getElementById("pg"), 830, 24);
  let k = 0;
  const lens = __LENS__;
  gsap.utils.toArray(".pp2").forEach((p, i) => {
    const at = WT && WT[k] != null ? Math.max(0.3, WT[k] - 0.1) : 0.4 + i * 0.5;
    tl.fromTo(p, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at);
    k += lens[i];
  });
""".replace("__LENS__", json.dumps([len((a + " " + b).split()) for a, b in pairs]))
    return dict(dur=dur, css="", body=body, js=js, words=[w for a, b in pairs for w in (a + " " + b).split()], captions=False, exit=exit)


def registry(gid, name, values=None, dur=4, box=(300, 980), words=(), captions=True, exit=True):
    """Mount any HyperFrames registry piece (component or block) inside a themed card: its files are copied in,
    `values` fill its variables, and it plays across the content band (box = top, height). Components take the
    theme's colours and fonts through the design-contract tokens; blocks keep their own look and are scaled to
    fit the band's width. List them with `hf.sh catalog`; each one's README/registry-item.json lists variables."""
    item = None
    for kind in ("components", "blocks"):
        f = REGISTRY / kind / name / "registry-item.json"
        if f.exists():
            item, base = json.loads(f.read_text()), f.parent
            break
    if item is None:
        raise ValueError(f"registry: no item {name!r} under {REGISTRY}")
    for v in (values or {}).values():
        _no_dash(v if isinstance(v, str) else "")
    # many registry pieces are HyperFrames' own promos: never let their brand defaults reach our video
    brandy = re.compile(r"hyperframes|heygen", re.I)
    leaks = [v["id"] for v in item.get("variables", []) if v["id"] not in (values or {}) and brandy.search(json.dumps(v.get("default", "")))]
    if leaks:
        raise ValueError(f"registry {name}: set these (their defaults name HyperFrames): {', '.join(leaks)}")
    files = {str(base / x["path"]): x["target"] for x in item["files"] if (base / x["path"]).exists() and not x["path"].endswith(".md")}
    comp = next(x["target"] for x in item["files"] if x["target"].endswith(".html"))
    top, height = box
    dims = item.get("dimensions")
    if dims and dims.get("width") and dims["width"] != 1080:
        s_ = 1080 / dims["width"]
        bw, bh = dims["width"], dims["height"]
        top = top + max(0, (height - bh * s_) / 2)
        inner = f'transform-origin:0 0;transform:scale({s_:.5f});width:{bw}px;height:{bh}px'
    elif dims and dims.get("height") == 1920:
        top, height, inner = 0, 1920, "width:1080px;height:1920px"
    else:
        inner = f"width:1080px;height:{height}px"
    vals = esc(json.dumps(values or {}))
    body = (f'<div id="reg" style="position:absolute;left:0;top:{top:.0f}px;width:1080px;height:{height}px">'
            f'<div class="clip" data-composition-id="{esc(name)}" data-composition-src="{esc(comp)}" data-variable-values="{vals}" '
            f'data-start="0" data-duration="__DUR__" data-track-index="1" style="position:absolute;left:0;top:0;{inner}"></div></div>')
    js = "  hold(tl, '#reg', 0.8, DUR);\n"
    return dict(dur=dur, css="", body=body, js=js, words=list(words), captions=captions, exit=exit, registry_files=files)


def _logo_file(handle):
    """A plain generated mark (a disc with the handle's first letter) for pieces that want a brand logo file."""
    import tempfile
    letter = esc((handle or "?").lstrip("@")[:1].upper() or "?")
    f = Path(tempfile.mkdtemp()) / "brand-logo.svg"
    f.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#ffffff"/>'
                 f'<text x="50" y="66" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="48" fill="#111111">{letter}</text></svg>')
    return f


def ai_chat(gid, question, answer, bullets=(), bullets_title="In short:", bot="Assistant", handle="@yourbrand", end=("", "", "", ""), dur=10, exit=False):
    """An AI chat on a phone: the question is typed on a rising keyboard and sent, a thinking dot, then the answer
    streams in word by word with bullets (the registry's ai-chat-reveal). end = (headline, sub, cta, footer) for
    its closing card, all ours. answer: one or two short paragraphs (a list or one string); bullets_title heads
    the bullet list (the block falls back to its own demo copy for any blank field, so every field is set)."""
    ans = [answer] if isinstance(answer, str) else list(answer)
    NB = "\u00a0"  # an empty string makes the block fall back to its own demo copy; a no-break space stays blank
    ans = [a or NB for a in (ans + ["", ""])[:2]] + [bullets_title]
    bl = [b or NB for b in (list(bullets) + ["", "", ""])[:3]]
    h, sub, cta, foot = [x or NB for x in end]
    spec = registry(gid, "ai-chat-reveal", {"botName": bot, "userMessage": question, "answer1": ans[0], "answer2": ans[1], "answer3": ans[2],
                                            "bullet1": bl[0], "bullet2": bl[1], "bullet3": bl[2], "ecHeadline": h, "ecSub": sub, "ecCta": cta,
                                            "ecFooter": foot, "brandLogo": "assets/brand-logo.svg"},
                    dur=dur, words=question.split() + " ".join(ans).split(), captions=False, exit=exit)
    spec["registry_files"][str(_logo_file(handle))] = "assets/brand-logo.svg"
    return spec


def notifications(gid, title, messages, app, headline=("", ""), footer="", handle="@yourbrand", dur=10, exit=True):
    """Phone notifications cascading in over a desk, then a two-part headline (the registry's
    notification-cascade). messages: up to four short lines from `app`."""
    m = [x or "\u00a0" for x in (list(messages) + ["", "", "", ""])[:4]]
    headline = tuple(x or "\u00a0" for x in headline)
    footer = footer or "\u00a0"
    spec = registry(gid, "notification-cascade", {"notifTitle": title, "message1": m[0], "message2": m[1], "message3": m[2], "message4": m[3],
                                                  "appName": app, "headlineTop": headline[0], "headlineAccent": headline[1], "footerText": footer,
                                                  "brandLogo": "assets/brand-logo.svg"},
                    dur=dur, words=" ".join(m).split(), captions=False, exit=exit)
    spec["registry_files"][str(_logo_file(handle))] = "assets/brand-logo.svg"
    return spec


def proof_card(gid, brand, proof, cta, features=(), dur=4, exit=True):
    """A social-proof card: a brand name, a proof line, three short feature pairs ("Label|value") and a call to
    action (the registry's social-proof-card). Only real claims from the script's sources."""
    f = [x or "\u00a0" for x in (list(features) + ["", "", ""])[:3]]
    return registry(gid, "social-proof-card", {"brand": brand, "proof": proof, "cta": cta, "f1": f[0], "f2": f[1], "f3": f[2]},
                    dur=dur, box=(420, 860), captions=True, exit=exit)


def annotate(gid, text, keyword, note="", style="circle", draw_at=None, dur=4, exit=True):
    """A line of text where one keyword gets a hand-drawn mark (circle, highlight, underline or scribble) while a
    thin connector draws up to a small mono note (the registry's vox-annotate). draw_at: when the mark lands
    (seconds; default 1.0). Shows the words itself. The note hangs up and right of the keyword: pick a keyword in
    the first half of the line, or leave note empty, or it runs off the edge."""
    _no_dash(text, keyword, note)
    spec = registry(gid, "vox-annotate", {"text": text, "keyword": keyword, "note": note, "style": style, "draw_at": draw_at if draw_at is not None else 1.0, "accent": "blue"},
                    dur=dur, box=(560, 520), words=text.split(), captions=False, exit=exit)
    return spec


def sketch(gid, preset="bulb", caption="", dur=4, exit=True):
    """A whiteboard sketch drawing itself one stroke at a time with a pen nib (bulb, flow or rocket), an optional
    handwritten caption (the registry's whiteboard-ink). Studio's captions carry the words."""
    _no_dash(caption)
    return registry(gid, "whiteboard-ink", {"sketch": preset, "caption": caption, "pen": "show", "accent": "blue"}, dur=dur, box=(380, 860), exit=exit)


def flap_board(gid, text, dur=4, exit=True):
    """A split-flap departure board: every cell rolls through the alphabet to land on `text` (capitals, up to
    about 16 characters a row; the registry's split-flap-board). Shows the words itself."""
    _no_dash(text)
    return registry(gid, "split-flap-board", {"boardText": text.upper()}, dur=dur, words=text.split(), captions=False, exit=exit)


def chart_race(gid, title, periods, series, prefix="", suffix="", dur=8, exit=True):
    """Ranked bars racing and overtaking period by period (the registry's bar-chart-race). periods: ["2020", ...];
    series: [{"name": "A", "values": [..one per period..]}, ...]. Only real numbers from the script's sources."""
    _no_dash(title, *periods, *[x["name"] for x in series])
    per = max(0.6, (dur - 1.5) / max(1, len(periods)))
    rows = "\n".join(f'{x["name"]}: {", ".join(str(v) for v in x["values"])}' for x in series)
    return registry(gid, "bar-chart-race", {"title": title, "subtitle": "", "periods": ", ".join(periods), "series": rows, "barCount": min(8, len(series)),
                                            "periodDuration": round(per, 2), "valuePrefix": prefix, "valueSuffix": suffix, "valueDecimals": 0,
                                            "accent": "__ACCENT__"}, dur=dur, exit=exit)


SHAPES = {
    # single closed paths on a 0..200 box, so MorphSVG can turn any one into any other
    "circle": "M100 10 C150 10 190 50 190 100 C190 150 150 190 100 190 C50 190 10 150 10 100 C10 50 50 10 100 10 Z",
    "square": "M24 24 H176 V176 H24 Z",
    "star": "M100 8 L124 72 L192 74 L138 116 L158 184 L100 144 L42 184 L62 116 L8 74 L76 72 Z",
    "heart": "M100 178 C40 136 8 100 8 64 C8 32 34 12 62 12 C80 12 94 22 100 36 C106 22 120 12 138 12 C166 12 192 32 192 64 C192 100 160 136 100 178 Z",
    "bolt": "M118 6 L34 116 H92 L78 194 L166 78 H106 Z",
    "check": "M18 104 L44 78 L82 116 L156 42 L182 68 L82 168 Z",
    "up": "M100 10 L186 100 H134 V190 H66 V100 H14 Z",
    "house": "M100 14 L190 92 H164 V186 H118 V132 H82 V186 H36 V92 H10 Z",
    "drop": "M100 8 C130 60 170 96 170 132 C170 172 138 194 100 194 C62 194 30 172 30 132 C30 96 70 60 100 8 Z",
    "coin": "M100 12 A88 88 0 1 1 99.9 12 Z M100 52 A48 48 0 1 0 100.1 52 Z",
}


def morph(gid, steps, dur=5, exit=True):
    """One bold shape morphing from step to step (MorphSVG), each with a label underneath: steps =
    [(shape, label)] with shapes from SHAPES (circle square star heart bolt check up house drop coin). Lands on
    each label's first word when the voice says it. Shows the words itself."""
    for sh, lab in steps:
        if sh not in SHAPES:
            raise ValueError(f"morph: shape one of {', '.join(SHAPES)}")
        _no_dash(lab)
    labels = "".join(f'<div class="ml" style="position:absolute;left:0;right:0;top:0;text-align:center;opacity:0">{_spans(_words(lab), "w mw")}</div>' for _, lab in steps)
    body = f"""<div class="col" style="justify-content:flex-start;padding-top:120px">
  <svg id="msvg" viewBox="0 0 200 200" style="width:460px;height:460px;overflow:visible;filter:drop-shadow(0 24px 40px var(--glow))">
    <path id="mp" d="{SHAPES[steps[0][0]]}" style="fill:var(--accent)"/></svg>
  <div id="mls" class="big" style="position:relative;width:940px;height:260px;margin-top:70px;font-size:calc(112px * var(--head-scale))">{labels}</div>
</div>"""
    js = """
  const steps = __STEPS__, shapes = __SHAPES__, labs = gsap.utils.toArray(".ml");
  let k = 0;
  const lens = steps.map(s => s[1].replace(/[{}]/g, "").split(/\s+/).length);
  popIn(tl, "#msvg", 0.05, { from: 0.3, ease: "back.out(2)", d: 0.5 });
  steps.forEach((st, i) => {
    const at = WT && WT[k] != null ? Math.max(0.3, WT[k] - 0.15) : 0.35 + i * Math.max(0.8, (DUR - 1.4) / steps.length);
    if (i > 0) {
      tl.to("#mp", { morphSVG: shapes[st[0]], duration: 0.55, ease: "power3.inOut" }, at - 0.1);
      tl.to(labs[i - 1], { opacity: 0, y: -24, filter: "blur(6px)", duration: 0.22 }, at - 0.1);
    }
    tl.fromTo(labs[i], { opacity: 0, y: 30, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.35, ease: "power3.out" }, at);
    k += lens[i];
  });
  hold(tl, "#msvg", 0.6, DUR);
""".replace("__STEPS__", json.dumps(steps)).replace("__SHAPES__", json.dumps(SHAPES))
    return dict(dur=dur, css="", body=body, js=js, words=[w for _, lab in steps for w in _plain(_words(lab))], captions=False, exit=exit,
                plugins=["MorphSVGPlugin"])


def kinetic(gid, text, size=120, dur=4, exit=True):
    """Kinetic type: every letter rises out of a mask in turn (SplitText), word by word as the voice says it, then
    a swell passes across the line letter by letter. Accent words in braces. Shows the words itself."""
    ws = _words(text)
    body = f'<div class="col"><div id="kt" class="big" style="font-size:calc({size}px * var(--head-scale));line-height:1.05">{_spans(ws, "w kw2")}</div></div>'
    js = """
  fitH(document.getElementById("kt"), 760, 48);
  const words = gsap.utils.toArray(".kw2");
  words.forEach((w, i) => {
    const sp = new SplitText(w, { type: "chars", charsClass: "kc" });
    const at = WT && WT[i] != null ? Math.max(0.05, WT[i] - 0.05) : 0.15 + i * 0.16;
    gsap.set(w, { overflow: "hidden", paddingBottom: "0.08em", verticalAlign: "bottom", opacity: 0 });
    tl.set(w, { opacity: 1 }, at);
    tl.fromTo(sp.chars, { yPercent: 115, rotation: 6, opacity: 0 }, { yPercent: 0, rotation: 0, opacity: 1, duration: 0.42, ease: "power4.out", stagger: 0.022 }, at);
  });
  const all = gsap.utils.toArray("#kt .kc");
  const end = (WT && WT[words.length - 1] != null ? WT[words.length - 1] : 0.15 + words.length * 0.16) + 0.6;
  tl.to(all, { keyframes: [ { scale: 1.16, y: -10, duration: 0.16, ease: "power2.out" }, { scale: 1, y: 0, duration: 0.3, ease: "back.out(2)" } ], stagger: 0.025 }, end);
  hold(tl, ".col", end + 0.4, DUR);
"""
    return dict(dur=dur, css=".kc { display: inline-block; }", body=body, js=js, words=_plain(ws), captions=False, exit=exit, plugins=["SplitText"])


def lottie_card(gid, file, caption=None, loop=False, size=720, dur=4, exit=True):
    """A Lottie animation (a .json export: LottieFiles free animations, or one made with the text-to-lottie skill)
    playing in the content band, seeked frame-accurately by HyperFrames' lottie-web adapter; an optional caption
    under it inks in. loop: cycle it for the card's length; else it plays once and holds its last frame."""
    _no_dash(caption)
    cw = _words(caption) if caption else []
    body = f"""<div class="col"><div id="lot" style="width:{size}px;height:{size}px"></div>
  {f'<div id="lc" class="big" style="margin-top:40px;font-size:calc(72px * var(--head-scale))">{_spans(cw, "w lw2")}</div>' if caption else ''}</div>"""
    head = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>'
            f'<script>window.__hfLottie = window.__hfLottie || []; document.addEventListener("DOMContentLoaded", function () {{'
            f' window.__hfLottie.push(lottie.loadAnimation({{ container: document.getElementById("lot"), renderer: "svg", loop: {str(bool(loop)).lower()},'
            f' autoplay: false, path: "assets/anim.json" }})); }});</script>')
    js = """
  popIn(tl, "#lot", 0.0, { from: 0.9, d: 0.3, ease: "power2.out" });
  if (document.getElementById("lc")) ink(tl, "#lc .w", WT, 0.15, 0.6);
"""
    return dict(dur=dur, css="", body=body, js=js, words=_plain(cw), captions=not bool(caption), exit=exit, head=head, files={"anim.json": file})


def chart_morph(gid, title, labels, values, unit="", note=None, dur=6, exit=True):
    """A chart that changes form: bars grow one by one, then shrink into points that a line draws through, then
    the peak gets a callout (note). labels/values: one per point (only the script's real numbers). Studio's
    captions carry the words."""
    _no_dash(title, note, unit, *labels)
    n = len(values)
    mx = max(values) or 1
    W_, H_, L, B = 820, 520, 40, 470
    step = (W_ - 2 * L) / max(1, n - 1) if n > 1 else 0
    bw = min(90, (W_ - 2 * L) / n * 0.6)
    pts = [(L + i * step, B - v / mx * 330) for i, v in enumerate(values)]
    bars = "".join(f'<rect class="cb" x="{x - bw / 2:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{B - y:.1f}" rx="10" style="fill:var(--bar-dim)"/>' for x, y in pts)
    dots = "".join(f'<circle class="cd" cx="{x:.1f}" cy="{y:.1f}" r="13" style="fill:var(--accent)"/>' for x, y in pts)
    labs = "".join(f'<text x="{x:.1f}" y="{B + 44}" text-anchor="middle" style="fill:var(--win-dim);font-family:PSans;font-size:26px;font-weight:600">{esc(l)}</text>' for (x, _), l in zip(pts, labels))
    vals = "".join(f'<text class="cv" x="{x:.1f}" y="{y - 26:.1f}" text-anchor="middle" style="fill:var(--win-text);font-family:PSans;font-size:30px;font-weight:800">{esc(v)}{esc(unit)}</text>' for (x, y), v in zip(pts, values))
    line = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    k = max(range(n), key=lambda i: values[i])
    px, py = pts[k]
    callout = (f'<g id="co"><path class="dr" id="cl2" d="M {px:.1f} {py - 20:.1f} L {px + (-90 if px > W_ / 2 else 90):.1f} {py - 110:.1f}" style="stroke:var(--accent)" stroke-width="4" fill="none"/>'
               f'<text x="{px + (-100 if px > W_ / 2 else 100):.1f}" y="{py - 122:.1f}" text-anchor="{"end" if px > W_ / 2 else "start"}" style="fill:var(--accent);font-family:PSans;font-size:34px;font-weight:800">{esc(note)}</text></g>') if note else ""
    inner = (f'<svg id="cm" viewBox="0 -30 {W_} {B + 100}" style="width:100%;height:auto;overflow:visible">{bars}'
             f'<path id="ln2" class="dr" d="{line}" style="stroke:var(--accent)" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>{dots}{vals}{labs}{callout}</svg>')
    body = _window(title, inner, top=360)
    js = """
  winIn(tl);
  const cb = gsap.utils.toArray(".cb"), cd = gsap.utils.toArray(".cd"), cv = gsap.utils.toArray(".cv");
  gsap.set(cb, { transformOrigin: "50% 100%" }); gsap.set(cd, { transformOrigin: "50% 50%" });
  tl.fromTo(cb, { scaleY: 0 }, { scaleY: 1, duration: 0.45, ease: "power3.out", stagger: 0.12 }, 0.45);
  tl.fromTo(cv, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.12 }, 0.6);
  const m = Math.min(DUR - 2.6, 0.45 + cb.length * 0.12 + 0.8);
  tl.to(cb, { scaleY: 0.0, opacity: 0, duration: 0.45, ease: "power2.in", stagger: 0.05 }, m);
  tl.fromTo(cd, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(3)", stagger: 0.05 }, m + 0.2);
  draw(tl, "#ln2", m + 0.35, 0.8, { ease: "power2.inOut" });
  if (document.getElementById("co")) { gsap.set("#co text", { opacity: 0 }); draw(tl, "#cl2", m + 1.15, 0.35); tl.to("#co text", { opacity: 1, duration: 0.3 }, m + 1.4); }
  hold(tl, "#win", m + 1.6, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def big_number(gid, label, value, prefix="", suffix="", sub=None, dur=4, exit=True):
    """A small label, a huge number counting up with the accent underline drawing, a soft line under it."""
    _no_dash(label, sub, prefix, suffix)
    body = f"""<div class="col" style="height:900px">
  <div id="lb" style="font-size:32px;font-weight:700;letter-spacing:0.2em;color:var(--soft);text-transform:uppercase">{esc(label)}</div>
  <div id="nb" style="font-size:230px;font-weight:840;letter-spacing:-0.04em;line-height:1;margin-top:18px;white-space:nowrap;color:var(--ink)">{esc(prefix)}0{esc(suffix)}</div>
  <svg style="width:420px;height:36px;margin-top:8px;overflow:visible"><path id="ul" class="dr" d="M 10 20 Q 210 4 410 18" style="stroke:var(--accent)" stroke-width="10" stroke-linecap="round" fill="none"/></svg>
  {f'<div id="sb" class="lead" style="margin-top:30px">{esc(sub)}</div>' if sub else ''}
</div>"""
    js = f"""
  rise(tl, "#lb", 0.1, {{ y: 20 }});
  const nb = document.getElementById("nb");
  nb.textContent = {json.dumps(prefix)} + Number({value}).toLocaleString("en-US") + {json.dumps(suffix)}; fitW(nb, 940, 80);
  count(tl, nb, 0.25, 1.1, {value}, {{ prefix: {json.dumps(prefix)}, suffix: {json.dumps(suffix)}, ease: "power3.out" }});
  rise(tl, "#nb", 0.2, {{ y: 40, from: 0.85 }});
  draw(tl, "#ul", 1.0, 0.5, {{ ease: "power3.out" }});
  if (document.getElementById("sb")) rise(tl, "#sb", 1.2, {{ y: 20 }});
  hold(tl, ".col", 1.6, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def versus(gid, left, right, dur=4.5, exit=True):
    """Two cards side by side: left = (title, [points]) muted with crosses, right = (title, [points]) with an
    accent edge and ticks; the right one lands second and lifts."""
    def card(cid, t, pts, good):
        _no_dash(t, *pts)
        mk = CHECK if good else CROSS
        col = "var(--good)" if good else "#B9B1A4"
        items = "".join(f'<div class="pt" style="display:flex;gap:14px;align-items:flex-start;text-align:left;font-size:44px;font-weight:680;color:{"var(--card-text)" if good else "#A39E96"};margin-top:28px;line-height:1.15"><i style="flex:none;width:52px;height:52px;margin-top:2px;border-radius:50%;background:{col};display:inline-flex;align-items:center;justify-content:center"><span style="width:30px;height:30px;display:block">{mk}</span></i><span>{esc(p)}</span></div>' for p in pts)
        border = "box-shadow:0 0 0 4px var(--accent),0 24px 50px var(--glow);" if good else "box-shadow:var(--card-shadow);"
        return f'<div id="{cid}" style="width:450px;background:var(--card);border-radius:34px;padding:44px 36px 50px;{border}"><div style="font-size:60px;font-weight:820;color:{"var(--accent)" if good else "#A39E96"};text-align:left">{esc(t)}</div>{items}</div>'
    body = f'<div class="col" style="flex-direction:row;gap:36px;align-items:center">{card("vl", left[0], left[1], False)}{card("vr", right[0], right[1], True)}</div>'
    js = """
  rise(tl, "#vl", 0.1, { y: 70, d: 0.5 });
  rise(tl, "#vl .pt", 0.4, { y: 20, stagger: 0.14, d: 0.3 });
  rise(tl, "#vr", 0.9, { y: 90, d: 0.55, ease: "back.out(1.5)" });
  rise(tl, "#vr .pt", 1.2, { y: 20, stagger: 0.14, d: 0.3 });
  tl.to("#vr", { y: -16, duration: 0.5, ease: "power2.out" }, 1.9);
  tl.to("#vl", { opacity: 0.7, scale: 0.97, duration: 0.5 }, 1.9);
  hold(tl, ".col", 2.4, DUR);
"""
    return dict(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


# ------------------------------------------------------------------------------------------------ writing

_norm = lambda s: re.sub(r"[^a-z0-9$%]", "", s.lower())


def map_times(card_words, spoken):
    """Match a card's on-screen words to the voice's words in order: spoken = [(word, seconds from card
    start)]. Unmatched card words follow the word before them by 0.12 s."""
    out, j, last = [], 0, 0.0
    for w in card_words:
        n = _norm(w)
        hit = None
        for k in range(j, min(len(spoken), j + 6)):
            if _norm(spoken[k][0]) == n and n:
                hit = k
                break
        if hit is not None:
            last = max(0.0, spoken[hit][1])
            j = hit + 1
        else:
            last = last + 0.12 if out else 0.1
        out.append(round(last, 3))
    return out


RESERVED = ("lamp", "root", "scene", "bg", "stage", "grain", "birds", "city", "mark", "strip", "chip", "folds", "spot", "hdr", "prog",
            "neon", "ndot", "board", "tools", "tline", "tbar", "phead", "cur", "selb")


def write_cards(G, outdir, durs=None, times=None, handle=None, theme="paper", title=None):
    """One HyperFrames project per card under outdir/<card>/, in `theme`. durs: {card: seconds} (a card plays
    its whole voice slot; leave ~0.8 s spare and the card leaves ~1 s before its end). times: {card: [(word,
    s)]}, the voice's words over that card, so words ink in as they are said."""
    if theme not in THEMES:
        raise ValueError(f"theme: one of {', '.join(THEMES)}")
    th = THEMES[theme]
    outdir = Path(outdir)
    durs, times = durs or {}, times or {}
    order = list(G)
    for gid, spec in G.items():
        if gid in RESERVED:
            raise ValueError(f"card id {gid!r} is reserved by the page")
        d = outdir / gid
        (d / "assets").mkdir(parents=True, exist_ok=True)
        for f in ("hyperframes.json", "meta.json"):
            if not (d / f).exists():
                shutil.copy(TEMPLATE / f, d / f)
        pkg = json.loads((TEMPLATE / "package.json").read_text())
        pkg["name"] = gid
        (d / "package.json").write_text(json.dumps(pkg, indent=2) + "\n")
        for k in th["fonts"]:
            shutil.copy(FONTS[k][0], d / "assets" / FONTS[k][0].name)
        for name, src in (spec.get("files") or {}).items():
            shutil.copy(src, d / "assets" / name)
        dur = round(max(float(durs.get(gid, spec["dur"])), 1.6), 3)
        wt = map_times(spec.get("words") or [], times[gid]) if gid in times and spec.get("words") else None
        js = "  const WT = " + json.dumps(wt) + ";\n" + spec["js"]
        exit_at = round(dur - 1.0, 3) if spec.get("exit", True) else None
        for src, target in (spec.get("registry_files") or {}).items():
            (d / target).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, d / target)
        body = spec["body"].replace("__DUR__", str(dur))
        (d / "index.html").write_text(page(gid, dur, {**spec, "js": js, "body": body}, theme=theme, handle=handle, exit_at=exit_at,
                                           index=order.index(gid) + 1, total=len(order), title=title))
    return list(G)


def demo():
    """A demo set on invented text (no business named), one card of each kind."""
    return {
        "p-hook": headline("p-hook", "This tool makes {unlimited} reels", icons=("doc", "spark"), label=".txt",
                           pills=["in any style", "no credits, no per-reel cost"]),
        "p-eq": equation("p-eq", "spark", "camera", "flame"),
        "p-show": kicker_title("p-show", "let me show you", "how it works"),
        "p-code": with_chip(code_window("p-code", "Editor  reel.html", ['<Reel style="any">', '  <Hook text={idea} />',
                            '  <Scene kind="proof" />', '  <Caption words={vo} />', "</Reel>"], note="rendered from code, frame by frame"), 1, 3, "Reels, rendered"),
        "p-steps": ui_steps("p-steps", "Studio", [("Add a connector", "button", "Connect"), ("Name it", "field", "My account"), ("Allow posting", "toggle", "Publish content")]),
        "p-repo": counter_card("p-repo", "studio/content-skills", 52, tags=["skills", "mit", "free"],
                               items=["reel-writer/", "carousel-builder/", "caption-writer/", "comment-replies/", "bio-check/", "post-planner/"]),
        "p-think": strike("p-think", "you might be thinking", "the reels might {flop}", "not at all."),
        "p-q": question("p-q", "the next thing on your mind", "they won't go {viral}"),
        "p-stats": with_chip(stat_window("p-stats", "Analytics  your page", [("views", 742940), ("visitors", 22221)]), 2, 3, "Proof"),
        "p-bars": bars_window("p-bars", "Compare", [("a typical agency", 18), ("this page", 100)]),
        "p-list": list_window("p-list", "Checklist", [("Script written", True), ("Cards rendered", True), ("Captions synced", True), ("Paid credits", False)]),
        "p-lens": lens("p-lens", "imagination"),
        "p-read": read_card("p-read", ["One shop pays its floor staff {$24 an hour}.", "The other pays {$19}, and loses a third of them every year.",
                                       "Same aisles, same products. {Different math}."]),
        "p-num": big_number("p-num", "website visitors", 40000, sub="in sixty days"),
        "p-vs": versus("p-vs", ("Before", ["Hours per reel", "Paid credits"]), ("After", ["Minutes per reel", "Free to run"])),
        "p-fan": fan("p-fan", badge="in your brand"),
        "p-hub": hub("p-hub", "changing the game for {distribution}"),
        "p-chat": chat_thread("p-chat", "Sam", [("them", "did you post the reel yet"), ("me", "rendering it now"), ("them", "how long does that take"), ("me", "about two minutes. no credits")]),
        "p-post": post_card("p-post", "Field Notes", "@fieldnotes", "A store, a carton of milk, and one long walk.", "The shelf at the back was never an accident (circa 1950s)."),
        "p-sheet": cheat_sheet("p-sheet", "How stores", "keep you shopping", [("store", "Staples sit at the {back}, so you walk the aisles"), ("cart", "Bigger trolleys make a full basket feel {small}"),
                               ("clock", "No clocks or windows, so time {disappears}"), ("coin", "Prices end in 99 to feel {cheaper}"), ("bulb", "Sweets wait at the {checkout} for the queue")], footer="save this"),
        "p-page": page_card("p-page", "Five quiet rules for a better shop:", [("To save:", "Write the list before you walk in."), ("To focus:", "Shop the edges, skip the middle aisles."),
                            ("To compare:", "Read the price per kilo, not the sticker.")]),
        "p-morph": morph("p-morph", [("star", "An {idea}"), ("bolt", "A {script}"), ("house", "A {brand}"), ("check", "A {post}")]),
        "p-cm": chart_morph("p-cm", "Weekly views", ["W1", "W2", "W3", "W4", "W5", "W6"], [12, 18, 15, 31, 44, 39], unit="k", note="best week"),
        "p-kin": kinetic("p-kin", "Made with {code}, not credits"),
        "p-cta": comment_cta("p-cta", "if you want to know how", "REELS", after="I'll send you all the details"),
    }


def demo_registry():
    """Registry-backed demo cards (need the HyperFrames plugin's registry on this Mac)."""
    return {
        "r-ann": annotate("r-ann", "The milk is at the back on purpose", "back", note="by design"),
        "r-sk": sketch("r-sk", "bulb", "the idea"),
        "r-flap": flap_board("r-flap", "NOW BOARDING"),
        "r-race": chart_race("r-race", "Members by year", ["2022", "2023", "2024", "2025"],
                             [{"name": "Plan A", "values": [10, 30, 55, 70]}, {"name": "Plan B", "values": [25, 35, 40, 44]},
                              {"name": "Plan C", "values": [5, 12, 40, 90]}], dur=7),
        "r-ai": ai_chat("r-ai", "Why is the milk always at the back?", ["So you walk past everything else first.", "It's a layout choice."],
                        bullets=["Snacks on the way", "Specials at aisle ends", "Sweets at the checkout"], end=("Every aisle", "is a choice.", "Follow for more", "@yourbrand")),
        "r-notif": notifications("r-notif", "New order", ["Order placed", "Packed and on the way", "Delivered", "Review left: 5 stars"], "Shop",
                                 headline=("SOLD WHILE", "YOU SLEPT"), footer="@yourbrand"),
        "r-proof": proof_card("r-proof", "Your brand", "Made with code", "Follow for more", ["Write|a script", "Render|a reel", "Post|every day"]),
        "r-lot": lottie_card("r-lot", KIT / "examples" / "check-badge.json", caption="Posted, {every day}"),
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        sys.exit(f"usage: kit.py <outdir> [theme: {'|'.join(THEMES)}] [handle]   (writes the demo cards)")
    th = sys.argv[2] if len(sys.argv) > 2 else "paper"
    names = write_cards(demo(), sys.argv[1], theme=th, handle=sys.argv[3] if len(sys.argv) > 3 else "@yourbrand")
    print("\n".join(names))
