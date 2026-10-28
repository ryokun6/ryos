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
# The photo's black LCD is the whole glass. It is scaled onto the 4:3 desktop capture
# (1280x960 CSS at 2x) so the bitmap is full-bleed — no side gutters inside the panel.
IBOOK_SRC = os.path.join(HERE, "assets", "ibook-g4.png")
IBOOK_SCREEN = (2560, 1920)

BEZELS = {
    "phone": ("Bezel-iPhone-18.dmg", "Bezel-iPhone-18/PNG/iPhone 18 Pro/iPhone 18 Pro - {} - Portrait.png",
              os.environ.get("PROMO_PHONE_COLOR", "Silver")),
}


def ibook_bezel_path():
    """White iBook G4 bezel. The whole black LCD is the cut-out, scaled to the 4:3 capture."""
    out = os.path.join(CACHE, "iBook G4.png")
    src_m = os.path.getmtime(IBOOK_SRC)
    # Rebuild when this file changes too, so a mask fix is not stuck on a stale cache.
    code_m = os.path.getmtime(os.path.abspath(__file__))
    if os.path.exists(out) and os.path.getmtime(out) >= max(src_m, code_m):
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
    sw, sh = sx1 - sx0 + 1, sy1 - sy0 + 1
    # The photo's glass is a hair wider than 4:3. Scale X and Y so that entire
    # black rectangle lands on the capture (2560x1920) with nothing left beside it.
    dst_w, dst_h = IBOOK_SCREEN
    sx, sy = dst_w / sw, dst_h / sh
    pad_l, pad_t = int(round(sx0 * sx)), int(round(sy0 * sy))
    out_w = pad_l + dst_w + int(round((w - sx1 - 1) * sx))
    out_h = pad_t + dst_h + int(round((h - sy1 - 1) * sy))
    rgba = np.dstack([rgb, alpha])
    M = np.array([[sx, 0, pad_l - sx0 * sx], [0, sy, pad_t - sy0 * sy]], np.float32)
    warped = cv2.warpAffine(rgba, M, (out_w, out_h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    warped[pad_t:pad_t + dst_h, pad_l:pad_l + dst_w, 3] = 0
    os.makedirs(CACHE, exist_ok=True)
    Image.fromarray(warped).save(out)
    print(f"[bezel] iBook G4 {out_w}x{out_h}, screen {dst_w}x{dst_h} at ({pad_l}, {pad_t}) from LCD {sw}x{sh}", file=sys.stderr)
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
