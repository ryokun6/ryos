#!/usr/bin/env python3
"""
Download + cache the official Apple product bezels the promo is framed in.

  python3 scripts/promo/bezels.py            # prints the cached PNG paths

Source: Apple Design Resources → Product Bezels (https://developer.apple.com/design/resources/#product-bezels),
public DMGs on devimages-cdn.apple.com. They are covered by the "Apple Design Resources License" inside each DMG
(mock-ups of software for Apple platforms only, no redistribution), so they are never committed: this script
fetches the DMG once, extracts the one PNG it needs with 7-Zip (`apt install p7zip-full`) and caches it under
$PROMO_BEZEL_DIR (default $PROMO_WORK_DIR/bezels, i.e. tmp/promo/bezels).

Colors: $PROMO_PHONE_COLOR (Silver | Black | Glacier | Burgundy).
Each PNG has a transparent screen cut-out at the panel's native pixel size, which is what shoot.ts captures:
  iBook G4 (from scripts/promo/assets/ibook-g4.png): screen 2560x1920 (4:3)
  iPhone 18 Pro portrait:  1350x2760, screen 1206x2622 at (72, 69)
"""
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROMO_WORK_DIR") or os.path.join(HERE, "..", "..", "tmp", "promo")
CACHE = os.environ.get("PROMO_BEZEL_DIR") or os.path.join(ROOT, "bezels")
CDN = "https://devimages-cdn.apple.com/design/resources/download/"
# The attached iBook photo's black panel is 1114x730. A 972x729 window inside it is exactly 4:3;
# the cache PNG scales that window to the desktop capture (1280x960 CSS at 2x).
IBOOK_SRC = os.path.join(HERE, "assets", "ibook-g4.png")
IBOOK_HOLE = (243, 66, 972, 729)  # x, y, w, h in the source photo
IBOOK_SCREEN = (2560, 1920)

BEZELS = {
    "phone": ("Bezel-iPhone-18.dmg", "Bezel-iPhone-18/PNG/iPhone 18 Pro/iPhone 18 Pro - {} - Portrait.png",
              os.environ.get("PROMO_PHONE_COLOR", "Silver")),
}


def ibook_bezel_path():
    """White iBook G4 bezel: photo background removed, 4:3 LCD punched out, chin label kept."""
    out = os.path.join(CACHE, "iBook G4.png")
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(IBOOK_SRC):
        return out
    import cv2
    import numpy as np
    from PIL import Image

    rgb = np.array(Image.open(IBOOK_SRC).convert("RGB"))
    h, w = rgb.shape[:2]
    if (w, h) != (1466, 1073):
        raise SystemExit(f"iBook asset is {w}x{h}, expected 1466x1073")
    luma = rgb.astype(np.float32).mean(axis=2)
    cand = (luma >= 250).astype(np.uint8)
    flood = cand.copy()
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 2)
    alpha = np.where(flood == 2, np.uint8(0), np.uint8(255))
    black = (luma < 20) & (alpha > 0)
    n, lab = cv2.connectedComponents(black.astype(np.uint8))
    i = max(range(1, n), key=lambda k: int((lab == k).sum()))
    ys, xs = np.where(lab == i)
    sx0, sy0, sx1, sy1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    hx, hy, hw, hh = IBOOK_HOLE
    if not (sx0 < hx and hy == sy0 and hx + hw < sx1 and hy + hh <= sy1 + 1):
        raise SystemExit(f"iBook LCD {sx0, sy0, sx1, sy1} does not contain the 4:3 hole {IBOOK_HOLE}")
    # The photo's panel is wider than 4:3. Paint the unused side strips as the surrounding plastic
    # and keep the original inner shadow on the new edge. The chin label sits below this band.
    plastic_x = sx0 - 12
    for y in range(sy0, sy1 + 1):
        rgb[y, sx0:hx] = rgb[y, plastic_x]
        rgb[y, hx + hw:sx1 + 1] = rgb[y, plastic_x]
    # Only the screen band: copying the whole column would paint the lid edge across the chin.
    rgb[sy0:sy1 + 1, hx - 4:hx] = rgb[sy0:sy1 + 1, sx0 - 4:sx0]
    rgb[sy0:sy1 + 1, hx + hw:hx + hw + 4] = rgb[sy0:sy1 + 1, sx1 + 1:sx1 + 5]
    alpha[hy:hy + hh, hx:hx + hw] = 0
    scale = IBOOK_SCREEN[0] / hw
    out_w, out_h = int(round(w * scale)), int(round(h * scale))
    im = Image.fromarray(rgb)
    im.putalpha(Image.fromarray(alpha))
    im = im.resize((out_w, out_h), Image.Resampling.LANCZOS)
    arr = np.array(im)
    ox, oy = int(round(hx * scale)), int(round(hy * scale))
    sw, sh = IBOOK_SCREEN
    arr[oy:oy + sh, ox:ox + sw, 3] = 0
    os.makedirs(CACHE, exist_ok=True)
    Image.fromarray(arr).save(out)
    print(f"[bezel] iBook G4 {out_w}x{out_h}, screen {sw}x{sh} at ({ox}, {oy})", file=sys.stderr)
    return out


def bezel_path(device):
    if device == "desktop":
        return ibook_bezel_path()
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
    for d in ("desktop", "phone"):
        print(bezel_path(d))
