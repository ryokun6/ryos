#!/usr/bin/env python3
"""
Download + cache the official Apple product bezels the promo is framed in.

  python3 scripts/promo/bezels.py            # prints the cached PNG paths

Source: Apple Design Resources → Product Bezels (https://developer.apple.com/design/resources/#product-bezels),
public DMGs on devimages-cdn.apple.com. They are covered by the "Apple Design Resources License" inside each DMG
(mock-ups of software for Apple platforms only, no redistribution), so they are never committed: this script
fetches the DMG once, extracts the one PNG it needs with 7-Zip (`apt install p7zip-full`) and caches it under
$PROMO_BEZEL_DIR (default $PROMO_WORK_DIR/bezels, i.e. tmp/promo/bezels).

Colors: $PROMO_MAC_COLOR (Silver | Midnight | Sky Blue | Starlight), $PROMO_PHONE_COLOR (Silver | Black | Glacier | Burgundy).
Each PNG has a transparent screen cut-out at the panel's native pixel size, which is what shoot.ts captures:
  MacBook Air M5 13-inch: 3400x2240, screen 2560x1664 at (420, 288)
  iPhone 18 Pro portrait:  1350x2760, screen 1206x2622 at (72, 69)
"""
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.environ.get("PROMO_WORK_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tmp", "promo")
CACHE = os.environ.get("PROMO_BEZEL_DIR") or os.path.join(ROOT, "bezels")
CDN = "https://devimages-cdn.apple.com/design/resources/download/"

BEZELS = {
    "desktop": ("Bezel-MacBook-Air-M5.dmg", "Bezel-MacBook-Air-M5/PNG/MacBook Air M5 13-inch {}.png",
                os.environ.get("PROMO_MAC_COLOR", "Silver")),
    "phone": ("Bezel-iPhone-18.dmg", "Bezel-iPhone-18/PNG/iPhone 18 Pro/iPhone 18 Pro - {} - Portrait.png",
              os.environ.get("PROMO_PHONE_COLOR", "Silver")),
}


def bezel_path(device):
    dmg, member, color = BEZELS[device]
    member = member.format(color)
    out = os.path.join(CACHE, os.path.basename(member))
    if os.path.exists(out):
        return out
    os.makedirs(CACHE, exist_ok=True)
    dmg_path = os.path.join(CACHE, dmg)
    if not os.path.exists(dmg_path):
        print(f"[bezel] downloading {CDN + dmg}", file=sys.stderr)
        req = urllib.request.Request(CDN + dmg, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r, open(dmg_path + ".part", "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(dmg_path + ".part", dmg_path)
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["7z", "x", "-y", f"-o{td}", dmg_path, member], check=True, stdout=subprocess.DEVNULL)
        shutil.move(os.path.join(td, member), out)
    return out


if __name__ == "__main__":
    for d in BEZELS:
        print(bezel_path(d))
