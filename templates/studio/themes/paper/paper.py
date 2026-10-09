#!/usr/bin/env python3
"""The paper card kit, kept as a name: the cards now live in ../kit.py (one kit, several themes) and this
module is the kit with "paper" as its theme. New code: `from kit import *` and write_cards(..., theme=...)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from kit import *  # noqa: F401,F403
from kit import THEMES, demo, write_cards

ACCENT = THEMES["paper"]["tokens"]["accent"]
INK = THEMES["paper"]["tokens"]["ink"]

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: paper.py <outdir> [handle]   (writes the demo cards in the paper theme)")
    print("\n".join(write_cards(demo(), sys.argv[1], theme="paper", handle=sys.argv[2] if len(sys.argv) > 2 else "@yourbrand")))
