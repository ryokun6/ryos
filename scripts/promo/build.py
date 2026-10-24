#!/usr/bin/env python3
"""
Compose the 30 s (or --length 60) Dictionary + Fitness promo from real ryOS captures.

  python3 scripts/promo/build.py --music bgm2.mp3 [--length 30|60] [--vertical] [--out path.mp4]
                                 [--style style.json] [--music-start s] [--bpm bpm]

Horizontal = desktop takes in the iBook G4 bezel (4:3); --vertical = phone takes in the iPhone 18 Pro bezel.
Bezels come from Apple Design Resources and are downloaded + cached by bezels.py (never committed). The captures
are the bezel's native screen size, so footage maps 1:1 onto the screen cut-out (its corner radius, the notch and
the Dynamic Island come from the bezel's own alpha). The camera moves the whole device: zooms scale and slide
the framed device, never crop inside the screen, and stop at 1 output px per screen px.

Apple Support layout: captions (Myriad Pro) sit centred under the resting device, or (layout "side", Apple's
title card) left-aligned beside it, sliding out from behind the device's edge. On a zoom's beat the caption
exits and the whole device eases in by a subtle factor (the Apple Support style allows one per cut). Within an
app the first caption enters once and later steps roll it over in place (caption.change "roll"). App intros are icon cards, optionally on a solid panel
that wipes in over the last scene and slides off into the app demo; the end card is centred.
The phone gets an iOS home indicator (the bezel's screen is empty). Every size, duration, easing, zoom factor and
zoom beat is in style.py and can be overridden with a JSON file (--style / $PROMO_STYLE). Each render reports
how many frames carried text and whether any of it left the frame or overlapped the device.

Inputs: $PROMO_WORK_DIR/rec/{desktop,phone}-{desktop,dictionary,fitness}/ (capture.mkv + marks.json from shoot.ts),
plus -{dict-extra,fitness-extra,exercises}/ for the 60 s cut;
PROMO_WORK_DIR defaults to tmp/promo at the repo root. App icons are the repo's macOS X theme icons in public/icons.

Music: --music or $PROMO_MUSIC (bgm2.mp3, never committed). Every cut and text hit is placed on the track's beat
grid: --music-start ($PROMO_MUSIC_START) is the downbeat the excerpt starts on and --bpm ($PROMO_BPM) its
tempo. Both default to bgm2's grid for the chosen length (BGM2_GRID); for another track find them with music.py. The excerpt is faded out over the end card, normalized to -14 LUFS and
muxed as AAC 192k. In the 60 s cut the pronunciation clip the Listen button played (dict-extra/listen.*) is
mixed in at the moment it plays on screen, with the music ducked under it (style "sfx").
The iPod cut keeps the take's own audio when the capture has some (click-wheel ticks and the YouTube song
together). A silent screencast gets that same mix rebuilt from the app's click samples and the song file
($PROMO_IPOD_SONG, default tmp/promo/supernatural.webm), lined up to the on-screen clock. The bed ducks under
the song and stays up under the ticks. --remux VIDEO writes that mix onto an existing master without
re-encoding the picture.
Without music the video is silent on the same grid.

Needs numpy, Pillow, opencv-python-headless, ffmpeg and 7z (for bezels.py).
"""
import argparse
import itertools
import json
import math
import os
import subprocess
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import style as style_mod
from bezels import bezel_path

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..", "..")
ROOT = os.environ.get("PROMO_WORK_DIR") or os.path.join(REPO, "tmp", "promo")
REC = os.path.join(ROOT, "rec")
ICONS = os.path.join(REPO, "public", "icons")
FPS = 60
DURATION = 30.0
# bgm2.mp3's beat grid per cut length: (downbeat the excerpt starts on, BPM). 30 s = the climax after the
# breakdown; 60 s = from the lighter break at 112.5 s up to the end of the climax at 172.5 s.
BGM2_GRID = {30: (182.640, 129.82), 60: (112.501, 128.499)}
BGM2_STYLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "styles", "apple-support-bgm2.json")
S_MAX = 1.0        # never enlarge the footage past native

# Fixed geometry per cut; everything tunable (sizes, placement, timing, easing, zoom) comes from style.py.
LAYOUTS = {
    "h": dict(key="h", W=1920, H=1080, device="desktop", dsf=2, tap_css=13),
    "v": dict(key="v", W=1080, H=1920, device="phone", dsf=3, tap_css=19),
}
# iOS home indicator (portrait, CSS px): 134 x 5, 8 above the screen's bottom edge.
HOME_INDICATOR = (134, 5, 8)
# iOS status bar text (not a caption): system UI face.
STATUS_FONT = os.path.join(os.environ.get("PROMO_FONT_DIR", "/usr/share/fonts/truetype/macos"), "Inter-SemiBold.ttf")


def status_font_path():
    """iOS status-bar face. Inter on Linux; a system face on macOS."""
    for p in (STATUS_FONT,
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/Library/Fonts/Arial Bold.ttf",
              "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if os.path.exists(p):
            return p
    raise FileNotFoundError("no font for the iOS status bar")

STYLE = style_mod.load()
BG = tuple(STYLE["colors"]["bg"])
INK = tuple(STYLE["colors"]["ink"])


def configure(style):
    """(Re)derive the module-level knobs from a style dict."""
    global STYLE, BG, INK, FONT, ease_move, ease_cap_in, ease_cap_out
    STYLE = style
    BG, INK, FONT = tuple(style["colors"]["bg"]), tuple(style["colors"]["ink"]), style["font"]
    ease_move = style_mod.bezier(*style["move"]["ease"])
    ease_cap_in = style_mod.bezier(*style["caption"]["in_ease"])
    ease_cap_out = style_mod.bezier(*style["caption"]["out_ease"])


def ease_back(u, k=1.9):
    u = min(max(u, 0.0), 1.0) - 1
    return 1 + (k + 1) * u ** 3 + k * u ** 2


configure(STYLE)


# ---------------------------------------------------------------- text
def text_layer(text, size, color=None):
    """One line in the caption font. The layer is the line's mask box: full ascender/descender height plus
    `pad_em` on every side, and it fails loudly if any glyph would touch its edge (so a reveal never clips ink)."""
    color = color or INK
    font = ImageFont.truetype(FONT, size)
    tr = size * STYLE["tracking_em"]
    pad = int(math.ceil(size * STYLE["caption"]["pad_em"]))
    asc, desc = font.getmetrics()
    width = font.getlength(text) + max(0, len(text) - 1) * tr
    img = Image.new("RGBA", (int(math.ceil(width)) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for j, ch in enumerate(text):
        d.text((pad + font.getlength(text[:j]) + j * tr, pad + asc), ch, font=font, fill=color + (255,), anchor="ls")
    arr = np.array(img)
    al = arr[..., 3]
    if al[0].any() or al[-1].any() or al[:, 0].any() or al[:, -1].any():
        raise ValueError(f"glyphs of {text!r} reach the edge of their mask box – raise caption.pad_em")
    return arr


def paste_rgba(dst, layer, x, y):
    h, w = layer.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    sub = layer[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
    a = sub[..., 3:4] / 255.0
    roi = dst[y0:y1, x0:x1].astype(np.float32)
    dst[y0:y1, x0:x1] = (roi * (1 - a) + sub[..., [2, 1, 0]] * a).astype(np.uint8)


def reveal(dst, layer, x, y, u_in, u_out=0.0):
    """Mask reveal inside the line's own box: slides up into it, then out through the bottom (or top). No fades.
    Fully revealed and not exiting = the whole layer, so resting text is never cut."""
    h = layer.shape[0]
    if u_out <= 0 and u_in >= 1:
        paste_rgba(dst, layer, x, y)
        return
    dy = int(round((1 - ease_cap_in(u_in)) * h))
    out = int(round(ease_cap_out(u_out) * h)) if u_out > 0 else 0
    if STYLE["caption"]["out_dir"] == "up":
        dy -= out
    else:
        dy += out
    if abs(dy) >= h:
        return
    if dy >= 0:
        paste_rgba(dst, layer[:h - dy], x, y + dy)
    else:
        paste_rgba(dst, layer[-dy:], x, y)


def behind(dst, layer, x, y, clip_y):
    """Paste a layer with every row above clip_y hidden (it is behind the device or icon)."""
    cut = int(math.ceil(clip_y - y)) if clip_y is not None else 0
    if cut >= layer.shape[0]:
        return
    if cut > 0:
        paste_rgba(dst, layer[cut:], x, y + cut)
    else:
        paste_rgba(dst, layer, x, y)


def paste_rows(dst, layer, x, y, lo, hi):
    """Paste a layer showing only output rows lo..hi (a caption window)."""
    a, b = max(0, int(lo) - y), min(layer.shape[0], int(hi) - y)
    if b > a:
        paste_rgba(dst, layer[a:b], x, y + a)


def roll(dst, old, old_at, new, new_at, u):
    """Caption change in place: the old block rolls up out of the caption window while the new one rolls up into
    it from below, on the caption curve, both cut by the window (the union of their resting boxes). No fades."""
    (ox, oy), (nx, ny) = old_at, new_at
    lo, hi = min(oy, ny), max(oy + old.h, ny + new.h)
    e = ease_cap_in(min(max(u, 0.0), 1.0))
    for cap, ax, y, off in ((old, ox, oy, -e * (hi - lo)), (new, nx, ny, (1 - e) * (hi - lo))):
        for l, (lx, ly) in zip(cap.lines, cap.line_xy(ax, int(round(y + off)))):
            paste_rows(dst, l, lx, ly, lo, hi)


def behind_x(dst, layer, x, y, clip_x):
    """Paste a layer with every pixel at or right of clip_x hidden (it is behind the device). clip_x is a number or
    one x per layer row (the device's silhouette edge on that row; inf where the device doesn't reach)."""
    if clip_x is None:
        paste_rgba(dst, layer, x, y)
        return
    keep = np.broadcast_to(np.asarray(clip_x, np.float32) - x, (layer.shape[0],))
    if keep.max() <= 0:
        return
    cols = np.arange(layer.shape[1], dtype=np.float32)
    cov = np.clip(keep[:, None] - cols[None, :], 0, 1)
    masked = layer.copy()
    masked[..., 3] = (masked[..., 3] * cov).astype(np.uint8)
    paste_rgba(dst, masked, x, y)


def wrap(text, size, max_w, max_chars=None):
    """Fewest lines that fit max_w (and max_chars per line), then the most even break into that many lines.
    A newline in `text` is an explicit line break (the iPod title is "iPod" / "on ryOS")."""
    font = ImageFont.truetype(FONT, size)
    width = lambda s: font.getlength(s) + max(0, len(s) - 1) * size * STYLE["tracking_em"]  # noqa: E731
    if "\n" in text:
        lines = text.split("\n")
        if max(width(l) for l in lines) > max_w or (max_chars and max(len(l) for l in lines) > max_chars):
            raise ValueError(f"{text!r} does not fit {max_w}px / {max_chars} chars at {size}px")
        return lines
    words = text.split(" ")
    for n in range(1, len(words) + 1):
        best = None
        for cuts in itertools.combinations(range(1, len(words)), n - 1):
            b = (0,) + cuts + (len(words),)
            lines = [" ".join(words[b[i]:b[i + 1]]) for i in range(n)]
            if max_chars and max(len(l) for l in lines) > max_chars:
                continue
            w = max(width(l) for l in lines)
            if best is None or w < best[0]:
                best = (w, lines)
        if best and best[0] <= max_w:
            return best[1]
    raise ValueError(f"{text!r} has a word wider than {max_w}px at {size}px")


class Caption:
    """Multi-line caption, centred or left-aligned; each line is its own mask box."""

    def __init__(self, text, size, max_w, line_height, max_chars=None, align="center", lines=None):
        self.lines = [text_layer(l, size) for l in (lines or wrap(text, size, max_w, max_chars))]
        if lines and max(l.shape[1] for l in self.lines) > max_w:
            raise ValueError(f"{text!r} is wider than {max_w}px at {size}px")
        self.lh = int(round(size * line_height))
        self.pad = int(math.ceil(size * STYLE["caption"]["pad_em"]))
        self.w = max(l.shape[1] for l in self.lines)
        self.h = self.lh * (len(self.lines) - 1) + self.lines[-1].shape[0]
        self.n = len(self.lines)
        self.align = align

    def rect(self, cx, y):
        """Block box incl. padding; anchor is the top-centre ("center") or the ink's left edge ("left")."""
        if self.align == "left":
            return (cx - self.pad, y, cx - self.pad + self.w, y + self.h)
        return (int(round(cx - self.w / 2)), y, int(round(cx + self.w / 2)), y + self.h)

    def line_xy(self, ax, y):
        """Top-left of every line layer for anchor ax (centre x, or the ink's left edge when left-aligned)."""
        if self.align == "left":
            return [(ax - self.pad, y + i * self.lh) for i in range(self.n)]
        return [(int(round(ax - l.shape[1] / 2)), y + i * self.lh) for i, l in enumerate(self.lines)]

    def draw_side(self, dst, x, y, e, clip_rows, clip0):
        """Left-aligned block that slides out leftward from behind the device: e=0 its ink starts at clip0 (the
        resting device's left silhouette edge), e=1 at x. clip_rows(y0, h) gives the device's current left
        silhouette edge for each output row; only pixels left of it show."""
        if e <= 0:
            return
        e = 1.0 if e >= 0.999 else e
        xt = int(round(x + (1 - e) * (clip0 - x)))
        for l, (lx, ly) in zip(self.lines, self.line_xy(xt, y)):
            behind_x(dst, l, lx, ly, clip_rows(ly, l.shape[0]))
        return xt

    def draw_behind(self, dst, cx, y, e, clip_y, clip0):
        """Slide out from behind the device: e=0 tucked fully above clip0 (the resting device's bottom edge), e=1 at
        rest. Only rows below the device's current bottom edge clip_y are drawn."""
        if e <= 0:
            return
        e = 1.0 if e >= 0.999 else e
        yt = int(round(y - (1 - e) * (y + self.h - clip0)))
        for i, l in enumerate(self.lines):
            behind(dst, l, int(round(cx - l.shape[1] / 2)), yt + i * self.lh, clip_y)
        return yt

    def draw(self, dst, cx, y, t_in, t_out=None):
        """(cx, y): top-centre of the block. Times in s since the reveal / exit started."""
        c = STYLE["caption"]
        for i, l in enumerate(self.lines):
            u_in = (t_in - i * c["stagger_s"]) / c["in_s"]
            u_out = 0.0 if t_out is None else (t_out - i * c["stagger_s"]) / c["out_s"]
            if u_in > 0:
                reveal(dst, l, int(round(cx - l.shape[1] / 2)), y + i * self.lh, u_in, max(0.0, u_out))


def load_icon(name):
    return np.array(Image.open(os.path.join(ICONS, name)).convert("RGBA"))


def pop(dst, icon, cx, cy, size, u):
    """Icon pops in by scale (with a little overshoot), centred on (cx, cy)."""
    k = ease_back(u, STYLE["icon"]["overshoot"])
    s = int(round(size * k))
    if s < 2:
        return
    interp = cv2.INTER_AREA if s <= icon.shape[0] else cv2.INTER_CUBIC
    im = cv2.resize(icon, (s, s), interpolation=interp)
    paste_rgba(dst, np.clip(im, 0, 255).astype(np.uint8), int(round(cx - s / 2)), int(round(cy - s / 2)))


# ---------------------------------------------------------------- device
class Device:
    """An Apple bezel PNG with footage composited into its transparent screen, rendered through a camera.

    A camera is (s, fx, fy): output px per bezel px, and the bezel point shown at the frame centre."""

    def __init__(self, L):
        self.L = L
        rgba = np.array(Image.open(bezel_path(L["device"])).convert("RGBA")).astype(np.float32) / 255.0
        a = rgba[..., 3]
        bh, bw = a.shape
        n, lab = cv2.connectedComponents((a < 0.5).astype(np.uint8))
        scr = lab == lab[bh // 2, bw // 2]
        ys, xs = np.where(scr)
        self.screen = (int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))
        ys, xs = np.where(a > 0.03)
        self.bbox = (int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1))
        # Left silhouette edge per bezel row (a MacBook's lid is much narrower than its base): text that slides
        # out from behind the device is hidden at this edge, not at the bbox.
        solid = a > 0.5
        any_ = solid.any(axis=1)
        self.left_col = np.where(any_, solid.argmax(axis=1), np.inf).astype(np.float64)
        # Footage runs a few px under the bezel's inner edge so its anti-aliased rim never shows the background.
        sm = cv2.dilate(scr.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=3).astype(np.float32)
        color = rgba[..., :3] * a[..., None]
        if L["device"] == "phone":
            color, a, sm = self._status_bar(color, a, sm, scr)
        x0, y0, x1, y1 = self.bbox
        self.C = np.ascontiguousarray(color[y0:y1, x0:x1, ::-1])           # premultiplied BGR
        self.A = np.ascontiguousarray(a[y0:y1, x0:x1])
        self.Wf = np.ascontiguousarray(((1 - a) * sm)[y0:y1, x0:x1])         # footage weight
        # Soft contact shadow: blurred silhouette at 1/8 res, dropped slightly.
        q = 8
        sil = cv2.resize(a, (bw // q, bh // q), interpolation=cv2.INTER_AREA)
        pad = 24
        sil = cv2.copyMakeBorder(sil, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
        self.shadow = cv2.GaussianBlur(sil, (0, 0), 7) * 0.30
        self.shadow_q, self.shadow_off = q, (-pad * q, -pad * q + 36)
        self._cache = {}
        lay = STYLE["layout"]["h" if L["device"] == "desktop" else "v"]
        s0 = lay["device_h"] / (y1 - y0)
        self.rest = (s0, (x0 + x1) / 2, y0 - (lay["device_top"] - L["H"] / 2) / s0)

    def _status_bar(self, color, a, sm, scr):
        """iOS-style status bar (time, signal, battery) either side of the Dynamic Island."""
        sx, sy, sw, sh = self.screen
        band = np.zeros_like(scr)
        band[sy:sy + 300, sx + 300:sx + sw - 300] = True
        ys, xs = np.where(band & ~scr & (a > 0.5))
        ix0, ix1, icy = xs.min(), xs.max(), (ys.min() + ys.max()) / 2
        ss = 4
        h = 300
        img = Image.new("RGBA", (sw * ss, h * ss), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        white = (255, 255, 255, 255)
        cy = (icy - sy) * ss
        font = ImageFont.truetype(status_font_path(), 52 * ss)
        lx = ((ix0 - sx) / 2 + 18) * ss
        d.text((lx, cy), "9:41", font=font, fill=white, anchor="mm")
        rx = ((ix1 - sx) + (sw - (ix1 - sx)) / 2 - 10) * ss
        # signal bars
        bwid, gap = 9 * ss, 5 * ss
        x = rx - 112 * ss
        for i, hh in enumerate((13, 19, 25, 31)):
            d.rounded_rectangle((x, cy + 15 * ss - hh * ss, x + bwid, cy + 15 * ss), 2 * ss, fill=white)
            x += bwid + gap
        # battery
        bx0, bx1 = rx - 36 * ss, rx + 42 * ss
        d.rounded_rectangle((bx0, cy - 17 * ss, bx1, cy + 17 * ss), 11 * ss, outline=(255, 255, 255, 150), width=3 * ss)
        d.rounded_rectangle((bx0 + 6 * ss, cy - 11 * ss, bx1 - 14 * ss, cy + 11 * ss), 6 * ss, fill=white)
        d.rounded_rectangle((bx1 + 4 * ss, cy - 6 * ss, bx1 + 9 * ss, cy + 6 * ss), 2 * ss, fill=(255, 255, 255, 150))
        st = np.array(img.resize((sw, h), Image.LANCZOS)).astype(np.float32) / 255.0
        sa = np.zeros_like(a)
        sc = np.zeros_like(color)
        sa[sy:sy + h, sx:sx + sw] = st[..., 3] * scr[sy:sy + h, sx:sx + sw]
        sc[sy:sy + h, sx:sx + sw] = st[..., :3] * sa[sy:sy + h, sx:sx + sw, None]
        color = color + (1 - a)[..., None] * sc
        new_a = a + (1 - a) * sa
        sm = sm * (1 - sa)
        return color, new_a, sm

    # -- camera
    def zoom(self, box, factor):
        """Camera `factor` x the resting scale, pulled toward a bezel-space box (x, y, w, h) by STYLE move.pull."""
        return self.zoom_from(self.rest, box, factor)

    def zoom_from(self, cam, box, factor):
        """`factor` times `cam`'s scale, pulled toward a bezel-space box by STYLE move.pull."""
        x, y, w, h = box
        s, fx, fy = cam
        pull = STYLE["move"]["pull"]
        return (min(S_MAX, s * factor), fx + (x + w / 2 - fx) * pull, fy + (y + h / 2 - fy) * pull)

    def out_box(self, cam):
        """Output-space bbox of the whole device (bezel incl.) under a camera."""
        (ax, ay), (bx, by) = self.to_out(cam, self.bbox[0], self.bbox[1]), self.to_out(cam, self.bbox[2], self.bbox[3])
        return (ax, ay, bx, by)

    def left_edge_rows(self, cam, y0, h):
        """Output-space x of the device's left silhouette edge on output rows y0 .. y0+h-1 (inf: no device there)."""
        s, fx, fy = cam
        rows = fy + (np.arange(y0, y0 + h) + 0.5 - self.L["H"] / 2) / s
        idx = np.floor(rows).astype(np.int64)
        ok = (idx >= 0) & (idx < len(self.left_col))
        col = np.full(h, np.inf)
        col[ok] = self.left_col[idx[ok]]
        return (col - fx) * s + self.L["W"] / 2

    def from_capture(self, box_px):
        x, y, w, h = box_px
        return (x + self.screen[0], y + self.screen[1], w, h)

    def to_out(self, cam, bx, by):
        s, fx, fy = cam
        return ((bx - fx) * s + self.L["W"] / 2, (by - fy) * s + self.L["H"] / 2)

    def _place(self, layer, ox, oy, cam, k=1.0, interp=cv2.INTER_AREA):
        """Resize the visible part of a layer whose top-left is at bezel (ox, oy) and whose px are k bezel px."""
        s, fx, fy = cam
        W, H = self.L["W"], self.L["H"]
        lh, lw = layer.shape[:2]
        vx0, vx1 = fx - W / 2 / s, fx + W / 2 / s
        vy0, vy1 = fy - H / 2 / s, fy + H / 2 / s
        i0, i1 = max(0, math.floor((vx0 - ox) / k)), min(lw, math.ceil((vx1 - ox) / k))
        j0, j1 = max(0, math.floor((vy0 - oy) / k)), min(lh, math.ceil((vy1 - oy) / k))
        if i1 <= i0 or j1 <= j0:
            return None
        X0, X1 = (round((ox + i * k - fx) * s + W / 2) for i in (i0, i1))
        Y0, Y1 = (round((oy + j * k - fy) * s + H / 2) for j in (j0, j1))
        if X1 <= X0 or Y1 <= Y0:
            return None
        img = cv2.resize(layer[j0:j1, i0:i1], (X1 - X0, Y1 - Y0), interpolation=interp)
        cx0, cy0, cx1, cy1 = max(0, X0), max(0, Y0), min(W, X1), min(H, Y1)
        if cx1 <= cx0 or cy1 <= cy0:
            return None
        return cx0, cy0, img[cy0 - Y0:cy1 - Y0, cx0 - X0:cx1 - X0]

    def _static(self, cam):
        key = tuple(round(v, 4) for v in cam)
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        W, H = self.L["W"], self.L["H"]
        bg = np.empty((H, W, 3), np.float32)
        bg[:] = np.array(BG[::-1], np.float32) / 255.0
        p = STYLE["shadow"] and self._place(self.shadow, self.shadow_off[0], self.shadow_off[1], cam, self.shadow_q,
                                            cv2.INTER_LINEAR)
        if p:
            x, y, img = p
            bg[y:y + img.shape[0], x:x + img.shape[1]] *= 1 - img[..., None]
        C = np.zeros((H, W, 3), np.float32)
        A = np.zeros((H, W), np.float32)
        Wf = np.zeros((H, W), np.float32)
        x0, y0 = self.bbox[:2]
        for layer, dst in ((self.C, C), (self.A, A), (self.Wf, Wf)):
            p = self._place(layer, x0, y0, cam)
            if p:
                x, y, img = p
                dst[y:y + img.shape[0], x:x + img.shape[1]] = img
        out = (bg * (1 - A - Wf)[..., None] + C, Wf)
        if len(self._cache) > 64:
            self._cache.clear()
        self._cache[key] = out
        return out

    def render(self, frame, cam):
        base, Wf = self._static(cam)
        f = base.copy()
        if frame is not None:
            p = self._place(frame, self.screen[0], self.screen[1], cam)
            if p:
                x, y, img = p
                h, w = img.shape[:2]
                f[y:y + h, x:x + w] += Wf[y:y + h, x:x + w, None] * (img.astype(np.float32) / 255.0)
        out = (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)
        if frame is not None and self.L["device"] == "phone":
            self._home_indicator(out, frame, cam)
        return out

    def _home_indicator(self, out, frame, cam):
        """The bezel's screen is empty, so draw iOS's home indicator: dark over light content, light over dark."""
        k = self.L["dsf"]
        w, h, gap = (v * k for v in HOME_INDICATOR)
        fh, fw = frame.shape[:2]
        x0, y0 = (fw - w) / 2, fh - gap - h
        under = frame[int(y0) - h:int(y0 + 2 * h), int(x0):int(x0 + w)]
        luma = float((under.astype(np.float32) @ np.array([0.114, 0.587, 0.299], np.float32)).mean()) / 255.0
        color = (20, 20, 20) if luma > 0.55 else (250, 250, 250)
        (ax, ay), (bx, by) = (self.to_out(cam, self.screen[0] + px, self.screen[1] + y0 + h / 2) for px in (x0 + h / 2, x0 + w - h / 2))
        q = 8
        cv2.line(out, (int(ax * q), int(ay * q)), (int(bx * q), int(by * q)), color, max(1, int(round(h * cam[0]))), cv2.LINE_AA, shift=3)


def lerp_cam(a, b, u):
    s = math.exp(math.log(a[0]) * (1 - u) + math.log(b[0]) * u)
    return (s, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)


def cam_at(shot, tau):
    """Camera at shot time tau. Moves are (t0, target[, duration]); all run on the one move curve."""
    cam = shot["cam"]
    for mv in shot.get("moves", []):
        t0, target = mv[0], mv[1]
        if tau <= t0:
            break
        cam = lerp_cam(cam, target, ease_move((tau - t0) / (mv[2] if len(mv) > 2 else STYLE["move"]["duration_s"])))
    return cam


def blend_disc(f, cx, cy, d, rgb, alpha, ring_w=None):
    """Anti-aliased filled disc (or ring of width ring_w) of diameter d, alpha-blended onto f."""
    if d <= 0 or alpha <= 0:
        return
    r = d / 2
    pad = int(r + 4)
    x0, y0 = int(cx) - pad, int(cy) - pad
    x1, y1 = x0 + 2 * pad, y0 + 2 * pad
    H, W = f.shape[:2]
    if x1 <= 0 or y1 <= 0 or x0 >= W or y0 >= H:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dist = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    cov = np.clip(r - dist + 0.5, 0, 1)
    if ring_w:
        cov *= np.clip(dist - (r - ring_w) + 0.5, 0, 1)
    cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    a = (cov[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0] * alpha)[..., None]
    roi = f[cy0:cy1, cx0:cx1].astype(np.float32)
    f[cy0:cy1, cx0:cx1] = (roi * (1 - a) + np.array(rgb[::-1], np.float32) * a).astype(np.uint8)


def shot_taps(L, shot):
    """Taps of a shot as (output time since shot start, x, y in capture px), in order."""
    out = []
    for mk in shot["take"].taps:
        b = mk["box"]
        out.append(((mk["t"] - shot["src"]) / shot["rate"], (b["x"] + b["width"] / 2) * L["dsf"], (b["y"] + b["height"] / 2) * L["dsf"]))
    return sorted(out)


def draw_ios_taps(f, dev, cam, taps, tau):
    """iOS screen-recording touches: a grey hover disc arrives lead_s before the tap, glides to the target and rests
    rest_s; on touch-down it becomes a blue ring that tightens, then grows while it fades."""
    T = STYLE["tap"]
    k = dev.out_box(cam)[3] - dev.out_box(cam)[1]
    k /= T["ref_device_h"]
    css = dev.L["dsf"]
    for i, (tt, px, py) in enumerate(taps):
        ts = tt - T["lead_s"]
        if not (ts <= tau <= tt + T["ring_tighten_s"] + T["ring_s"]):
            continue
        chained = i > 0 and tt - taps[i - 1][0] <= T["chain_s"]
        sx, sy = (taps[i - 1][1], taps[i - 1][2]) if chained else (px + 28 * css, py + 44 * css)
        if tau < tt:
            g = ease_move((tau - ts) / max(1e-3, T["lead_s"] - T["rest_s"]))
            bx, by = sx + (px - sx) * g, sy + (py - sy) * g
            grow = 1.0 if chained else min(1.0, (tau - ts) / 0.12)
            ox, oy = dev.to_out(cam, bx + dev.screen[0], by + dev.screen[1])
            r, g_, b_, a = T["hover_rgba"]
            blend_disc(f, ox, oy, T["hover_d"] * k * grow, (r, g_, b_), a)
        else:
            ox, oy = dev.to_out(cam, px + dev.screen[0], py + dev.screen[1])
            dt = tau - tt
            if dt < T["ring_tighten_s"]:
                d, a = T["ring_d"] + (T["ring_min_d"] - T["ring_d"]) * dt / T["ring_tighten_s"], 1.0
            else:
                u = min(1.0, (dt - T["ring_tighten_s"]) / T["ring_s"])
                d, a = T["ring_min_d"] + (T["ring_max_d"] - T["ring_min_d"]) * u, 1 - u
            blend_disc(f, ox, oy, d * k, T["ring_rgb"], 0.9 * a, ring_w=T["ring_w"] * k)


_CURSORS = {}


def cursor_tile(scale):
    """The standard macOS arrow pointer (black, white outline), tip at (pad, pad); RGBA, scale = px per point."""
    key = round(scale, 2)
    if key in _CURSORS:
        return _CURSORS[key]
    ss, pad = 4, 3
    pts = [(0, 0), (0, 16.6), (3.9, 12.8), (6.7, 19.3), (9.4, 18.2), (6.7, 11.9), (12.1, 11.9)]
    w, h = int((13 + 2 * pad) * scale * ss), int((21 + 2 * pad) * scale * ss)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    poly = [((x + pad) * scale * ss, (y + pad) * scale * ss) for x, y in pts]
    d.polygon(poly, fill=(255, 255, 255, 255), outline=(255, 255, 255, 255), width=int(2.2 * scale * ss))
    d.line(poly + [poly[0]], fill=(255, 255, 255, 255), width=int(2.2 * scale * ss), joint="curve")
    d.polygon(poly, fill=(0, 0, 0, 255))
    tile = np.array(img.resize((w // ss, h // ss), Image.LANCZOS))
    _CURSORS[key] = (tile, int(round(pad * scale)))
    return _CURSORS[key]


def draw_cursor(f, dev, cam, taps, tau):
    """macOS arrow: parked near the first target, glides to each click target on the move curve, no click ring."""
    if not taps:
        return
    T = STYLE["tap"]
    css = dev.L["dsf"]
    glide = T["lead_s"] - T["rest_s"]
    x, y = taps[0][1] + 60 * css, taps[0][2] + 90 * css
    for tt, px, py in taps:
        g0 = tt - T["lead_s"]
        if tau <= g0:
            break
        g = ease_move((tau - g0) / glide)
        x, y = x + (px - x) * g, y + (py - y) * g
    ox, oy = dev.to_out(cam, x + dev.screen[0], y + dev.screen[1])
    tile, pad = cursor_tile(cam[0] * css * T["cursor_css"])
    paste_rgba(f, tile, int(round(ox)) - pad, int(round(oy)) - pad)


def draw_tap(f, dev, cam, pt, age):
    """Apple-style tap indicator: a gray dot that presses in, holds, then lifts."""
    if not (-0.04 <= age <= 0.5):
        return
    L = dev.L
    px, py = dev.to_out(cam, pt[0] + dev.screen[0], pt[1] + dev.screen[1])
    r = L["tap_css"] * L["dsf"] * cam[0] * (1.35 - 0.35 * (1 - (1 - min(1.0, max(0.0, age / 0.12))) ** 3))
    alpha = 0.42 * (1 - max(0.0, (age - 0.36) / 0.14))
    ov = f.copy()
    cv2.circle(ov, (int(px * 4), int(py * 4)), int(r * 4), (112, 108, 108), -1, cv2.LINE_AA, shift=2)
    cv2.addWeighted(ov, alpha, f, 1 - alpha, 0, dst=f)


# ---------------------------------------------------------------- footage
class Take:
    def __init__(self, L, session):
        self.L = L
        self.dir = os.path.join(REC, f"{L['device']}-{session}")
        m = json.load(open(os.path.join(self.dir, "marks.json")))
        self.marks = {mk["name"]: mk for mk in m["marks"]}
        self.taps = [mk for mk in m["marks"] if mk["name"].startswith("tap:")]
        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                                "-of", "csv=p=0", os.path.join(self.dir, "capture.mkv")], capture_output=True, text=True)
        self.size = tuple(int(v) for v in probe.stdout.strip().split(","))

    def t(self, name, off=0.0):
        return self.marks[name]["t"] + off

    def box(self, name):
        b = self.marks[name]["box"]
        k = self.L["dsf"]
        return (b["x"] * k, b["y"] * k, b["width"] * k, b["height"] * k)

    def frames(self, a, rate, n):
        sw, sh = self.size
        cmd = ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, a):.3f}", "-i", os.path.join(self.dir, "capture.mkv"),
               "-vf", f"setpts=(PTS-STARTPTS)/{rate},fps={FPS}", "-frames:v", str(n),
               "-pix_fmt", "bgr24", "-f", "rawvideo", "-"]
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=sw * sh * 3 * 2)
        size, last = sw * sh * 3, None
        for _ in range(n):
            buf = p.stdout.read(size)
            if len(buf) == size:
                last = np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
            yield last
        p.stdout.close()
        p.wait()


def union(*boxes):
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return (x0, y0, x1 - x0, y1 - y0)


# ---------------------------------------------------------------- timeline
APP = os.environ.get("PROMO_APP", "dictionary")


def plan_ipod(L, dev, B, length=30):
    """iPod. Both cuts end on lyrics that show a translation and a pronunciation guide.
    30 s: browse, Cover Flow, Now Playing, lyrics.
    60 s, in order: browse, Cover Flow, Now Playing, volume, seek, video, lyrics."""
    home, ipod = Take(L, "desktop"), Take(L, "ipod")
    for t in (home, ipod):
        assert t.size == dev.screen[2:], f"{t.dir}: capture {t.size} != bezel screen {dev.screen[2:]} – re-shoot"
    rest = dev.rest
    cb = lambda box: dev.from_capture(box)  # noqa: E731

    def shot(take, at, src, rate=1.0, cam=rest, moves=()):
        return {"take": take, "at": at, "src": src, "rate": rate, "cam": cam, "moves": list(moves)}

    Z = STYLE["zoom"]
    targets = {}
    if ipod.marks.get("fs", {}).get("box"):
        # Full-screen glow lyrics. A light punch-in keeps the ruby and the translation line in frame.
        targets["lyrics"] = cb(ipod.box("fs"))

    def D(caption, shots, zoom=None, cap_in=0, title=False, cap_in_s=None, zoom_beat=None):
        cap_out = None
        if not STYLE["trailing_period"]:
            caption = caption.rstrip(".")
        side = make_caption(L, dev, caption, title)[2]
        if side is not None:
            for sh_ in shots:
                if sh_["cam"] is rest:
                    sh_["cam"] = side
                sh_["moves"] = [(m[0], side, *m[2:]) if m[1] is rest else m for m in sh_["moves"]]
            if cap_in_s is None:
                cap_in_s = STYLE["caption_in_s"]
        if zoom and Z.get(zoom) and zoom in targets:
            beat = Z[zoom]["beat"] if zoom_beat is None else zoom_beat
            t = beat * B
            s = [sh_ for sh_ in shots if sh_["at"] <= t][-1]
            # A side-shifted iBook scales in place. Zooming from `rest` (or pulling toward the
            # screen) would slide it back across the caption column.
            base = s["cam"]
            if base is rest:
                zcam = dev.zoom(targets[zoom], Z[zoom]["factor"])
            else:
                zs, zfx, zfy = base
                zcam = (min(S_MAX, zs * Z[zoom]["factor"]), zfx, zfy)
            s["moves"].append((t - s["at"], zcam))
            cap_out = beat
        return dict(kind="device", caption=caption, cap_in=cap_in, cap_out=cap_out, title=title, shots=shots,
                    cap_in_s=cap_in_s)

    title = "iPod\non ryOS" if L["key"] == "h" else "iPod on ryOS"
    O = dict(STYLE["open"])
    if length == 60 and O.get("push_at_beats_60") is not None:
        O["push_at_beats"] = O["push_at_beats_60"]
    for key in ("move_at", "push_at"):
        if O.get(f"{key}_beats") is not None:
            O[f"{key}_s"] = O[f"{key}_beats"] * B
    if L["key"] == "v" and O.get("v_title_push"):
        s0, fx, fy = rest
        below = (s0, fx, fy - (L["H"] + 8 - STYLE["layout"]["v"]["device_top"]) / s0)
        opening = dict(kind="device", caption=title, title=True, cap_in=0, cap_out=None, cap_in_s=None,
                       title_push=True, shots=[shot(home, 0, home.t("start", 0.3), cam=below,
                                                    moves=[(O["push_at_s"], rest, STYLE["move"]["duration_s"])])])
    else:
        s0, fx, _ = rest
        centred = (s0, fx, (dev.bbox[1] + dev.bbox[3]) / 2)
        opening = D(title, [shot(home, 0, home.t("start", 0.3), cam=centred,
                                 moves=[(O["move_at_s"], rest, O["move_s"])])],
                    cap_in_s=O["move_at_s"], title=True)
        opening["cap_dur_s"] = O["title_s"]

    icon = dict(kind="icon", icon="macosx/ipod.png", name="iPod")
    end = dict(kind="end", icon="mac-512.png", url="os.ryo.lu", enter="push")
    browse = D("Browse with the click wheel.", [
        shot(ipod, 0, ipod.t("menu", 0.15), span_rate(ipod.t("menu", 0.15), ipod.t("songs", 0.4), 10, B))])
    covers = D("Flip through Cover Flow.", [
        shot(ipod, 0, ipod.t("cover", 0.15), span_rate(ipod.t("cover", 0.15), ipod.t("cover-end", -0.1), 10, B))])
    playing = D("Now Playing.", [
        shot(ipod, 0, ipod.t("playing", 0.2), span_rate(ipod.t("playing", 0.2), ipod.t("play-end", -0.15), 12 if length == 30 else 10, B))])
    # The bed is bgm2. A ducked clip of the previous hero would play the wrong song under this picture.
    lyrics_src = ipod.t("lyrics")
    if length == 30:
        lyrics = D("Meaning and reading.", [shot(ipod, 0, lyrics_src)], zoom="lyrics", zoom_beat=4)
        return [
            (0, 8, opening),
            (8, 12, icon),
            (12, 22, browse),
            (22, 32, covers),
            (32, 44, playing),
            (44, 56, lyrics),
            (56, None, end),
        ]

    # Volume and seek play at capture speed (rate 1). A fixed beat count here was slow-motion:
    # the wheel and the scrub were stretched to fill 10 and 12 beats. One frame short of the
    # trimmed source window, so the shot ends before the next gesture and the last frame is never held.
    def realtime_beats(a, b):
        frames = max(1, math.floor((b - a) * FPS) - 1)
        return frames / (FPS * B)

    vol_a, vol_b = ipod.t("volume", 0.1), ipod.t("volume-end", -0.1)
    seek_a, seek_b = ipod.t("seek", 0.1), ipod.t("seek-end", -0.1)
    vol_beats, seek_beats = realtime_beats(vol_a, vol_b), realtime_beats(seek_a, seek_b)
    volume = D("Turn the volume.", [shot(ipod, 0, vol_a, 1.0)])
    seek = D("Seek in the song.", [shot(ipod, 0, seek_a, 1.0)])
    video = D("Watch the video.", [
        shot(ipod, 0, ipod.t("video", 0.2), span_rate(ipod.t("video", 0.2), ipod.t("video-end", -0.1), 12, B))])
    # Freed beats go to the lyrics hold, still at rate 1, and only while capture remains.
    # The end card stays on beat 112 when the take is long enough; otherwise it starts early
    # rather than holding the last lyrics frame.
    cursor = 46 + vol_beats + seek_beats + 12
    lyric_frames = max(1, math.floor((ipod.t("end") - lyrics_src) * FPS) - 1)
    lyric_beats = min(lyric_frames / (FPS * B), 112 - cursor)
    end_beat = 112.0 if lyric_beats >= 112 - cursor - 1e-9 else cursor + lyric_beats
    ly0 = cursor
    ly1 = cursor + lyric_beats / 2
    sung_out = (round(ly1 * B * FPS) - round(ly0 * B * FPS)) / FPS
    sung = D("Lyrics, in time.", [shot(ipod, 0, lyrics_src)])
    reading = D("Meaning and reading.", [shot(ipod, 0, lyrics_src + sung_out)], zoom="lyrics", zoom_beat=4)
    return [
        (0, 12, opening),
        (12, 16, icon),
        (16, 26, browse),
        (26, 36, covers),
        (36, 46, playing),
        (46, 46 + vol_beats, volume),
        (46 + vol_beats, 46 + vol_beats + seek_beats, seek),
        (46 + vol_beats + seek_beats, cursor, video),
        (ly0, ly1, sung),
        (ly1, end_beat, reading),
        (end_beat, None, end),
    ]


def plan(L, dev, B, length=30):
    """Scenes on the beat grid: (start_beat, end_beat, scene). Captions sit under the device at rest and slide
    out as the camera punches in, so a zoomed device never has text over it. `length` 60 adds speech, readings,
    schedule, set logging and the exercise library (sessions dict-extra, fitness-extra, exercises)."""
    if APP == "ipod":
        return plan_ipod(L, dev, B, length)
    k = L["dsf"]
    home, d, fz = Take(L, "desktop"), Take(L, "dictionary"), Take(L, "fitness")
    extra = (Take(L, "dict-extra"), Take(L, "fitness-extra"), Take(L, "exercises")) if length == 60 else ()
    for t in (home, d, fz, *extra):
        assert t.size == dev.screen[2:], f"{t.dir}: capture {t.size} != bezel screen {dev.screen[2:]} – re-shoot"
    rest = dev.rest
    cb = lambda box: dev.from_capture(box)  # noqa: E731

    def shot(take, at, src, rate=1.0, cam=rest, moves=()):
        return {"take": take, "at": at, "src": src, "rate": rate, "cam": cam, "moves": list(moves)}

    Z = STYLE["zoom"]
    cards = d.box("hanzi-start")
    # The notes grow downward (and scroll up once they reach the window's bottom): aim at the final box within the window.
    ai, win = d.box("ai-end"), d.box("en")
    ai_y0, ai_y1 = max(ai[1], win[1] + 40 * k), min(ai[1] + ai[3], win[1] + win[3] - 8 * k)
    rv, sd = fz.box("food-review"), fz.box("split-done")
    body = fz.box("body")
    sx, sy, sw, sh = dev.screen
    targets = {
        "open": (sx, sy, sw, sh),
        "strokes": cb(cards),
        "ai": cb((ai[0], ai_y0, ai[2], ai_y1 - ai_y0)),
        "review": cb((rv[0], rv[1], rv[2], sd[1] + sd[3] + 40 * k - rv[1])),
        "progress": cb((body[0], body[1], body[2], min(body[3], 200 * k))),
    }
    if extra:
        dx, fx_, ex = extra
        targets.update({
            "listen": cb(dx.box("listen-ready")),
            "readings": cb(dx.box("zhuyin-on")),
            "lift": cb(fx_.box("sets-done")),
            "exercise": cb(ex.box("ex-detail")),
        })

    meal_src = fz.t("tap:describe", -0.35)
    ai_src = d.t("tap:explain", -0.45)
    split_src = fz.t("tap:split", -1.25)
    split_rate = (fz.t("tap:half", 0.55) - split_src) / (6 * B)

    def D(caption, shots, zoom=None, cap_in=0, title=False, cap_in_s=None, zoom_beat=None):
        """Captioned device scene. With `zoom`, the caption exits on that zoom's beat (style, or `zoom_beat`) as the
        device moves in. cap_in is in beats; cap_in_s (seconds) overrides it."""
        cap_out = None
        if not STYLE["trailing_period"]:
            caption = caption.rstrip(".")
        side = make_caption(L, dev, caption, title)[2]
        if side is not None:
            for sh_ in shots:
                if sh_["cam"] is rest:
                    sh_["cam"] = side
                sh_["moves"] = [(m[0], side, *m[2:]) if m[1] is rest else m for m in sh_["moves"]]
            if cap_in_s is None:
                cap_in_s = STYLE["caption_in_s"]
        if zoom and Z.get(zoom):
            beat = Z[zoom]["beat"] if zoom_beat is None else zoom_beat
            t = beat * B
            s = [sh_ for sh_ in shots if sh_["at"] <= t][-1]
            s["moves"].append((t - s["at"], dev.zoom(targets[zoom], Z[zoom]["factor"])))
            cap_out = beat
        return dict(kind="device", caption=caption, cap_in=cap_in, cap_out=cap_out, title=title, shots=shots,
                    cap_in_s=cap_in_s)

    O = dict(STYLE["open"])
    if length == 60 and O.get("push_at_beats_60") is not None:
        O["push_at_beats"] = O["push_at_beats_60"]
    for key in ("move_at", "push_at"):
        if O.get(f"{key}_beats") is not None:
            O[f"{key}_s"] = O[f"{key}_beats"] * B
    if L["key"] == "v" and O.get("v_title_push"):
        # The title fills the screen on its own; then the phone pushes up from below and pushes it out.
        s0, fx, fy = rest
        below = (s0, fx, fy - (L["H"] + 8 - STYLE["layout"]["v"]["device_top"]) / s0)
        opening = dict(kind="device", caption="New apps on ryOS", title=True, cap_in=0, cap_out=None, cap_in_s=None,
                       title_push=True, shots=[shot(home, 0, home.t("start", 0.3), cam=below,
                                                    moves=[(O["push_at_s"], rest, STYLE["move"]["duration_s"])])])
    elif O["from_center"]:
        # Device already on screen, centred; it moves up to rest to make room as the title slides out from behind it.
        s0, fx, _ = rest
        centred = (s0, fx, (dev.bbox[1] + dev.bbox[3]) / 2)
        opening = D("New apps on ryOS", [shot(home, 0, home.t("start", 0.3), cam=centred,
                                              moves=[(O["move_at_s"], rest, O["move_s"])])],
                    zoom="open", cap_in_s=O["move_at_s"], title=True)
        opening["cap_dur_s"] = O["title_s"]
    else:
        opening = D("New apps on ryOS", [shot(home, 0, home.t("start", 0.6))], zoom="open",
                    cap_in=STYLE["caption_in_beat"]["open"], title=True)

    if length == 60:
        return plan60(d, fz, extra, B, shot, D, opening, ai_src, meal_src, split_src)
    return [
        (0, 7, opening),
        (7, 11, dict(kind="icon", icon="macosx/dictionary.png", name="Dictionary")),
        (11, 17, D("Look up any word, in any language.", [
            shot(d, 0, d.t("en", 0.1)), shot(d, 2 * B, d.t("ja", -0.05)), shot(d, 4 * B, d.t("ko", -0.05))])),
        (17, 25, D("Watch every stroke.", [shot(d, 0, d.t("tap:hanzi1", -0.3))], zoom="strokes")),
        (25, 33, D("Ask AI how a word is used.", [
            shot(d, 0, ai_src, (d.t("ai-end", 0.25) - ai_src) / (8 * B))], zoom="ai")),
        (33, 37, dict(kind="icon", icon="macosx/fitness.png", name="Fitness", enter="push")),
        (37, 45, D("Log a meal with AI.", [
            shot(fz, 0, meal_src, (fz.t("tap:estimate", 0.45) - meal_src) / (4 * B)),
            shot(fz, 4 * B, fz.t("food-review", -0.25))], zoom="review")),
        (45, 51, D("Split it ÷2.", [shot(fz, 0, split_src, split_rate)])),
        (51, 56, D("See your progress.", [shot(fz, 0, fz.t("body", 0.1))], zoom="progress")),
        (56, None, dict(kind="end", icon="mac-512.png", url="os.ryo.lu", enter="push")),
    ]


def span_rate(a, b, beats, B):
    """Playback rate that fits take time a..b into `beats`."""
    return (b - a) / (beats * B)


def plan60(d, fz, extra, B, shot, D, opening, ai_src, meal_src, split_src):
    """The 60 s cut: the 30 s story plus pronunciation, reading guides, the week plan, set logging and the
    exercise library (in Japanese). Scenes start on bar lines (the split runs 6 beats); zooms start on the half
    beat nearest the moment they show (audio starts, Zhuyin turns on, sets land, detail opens)."""
    dx, fx_, ex = extra
    move_beats = STYLE["move"]["duration_s"] / B

    def at(take, mark, src, rate, beats, off=0.0):
        """Zoom beat for a take mark, kept clear of the caption's entrance and done before the scene ends."""
        b = round((take.t(mark, off) - src) / rate / B * 2) / 2
        return min(max(3.0, b), math.floor(beats - move_beats))

    listen_src = dx.t("tap:listen", -1.3)
    read_src = dx.t("tap:readings", -0.9)
    read_rate = span_rate(read_src, dx.t("zhuyin-on", 2.0), 10, B)
    sched_src = fx_.t("tap:start", -3.4)
    lift_src = fx_.t("tap:lift", -1.0)
    lift_rate = span_rate(lift_src, fx_.t("sets-done", 1.0), 10, B)
    ex_src = ex.t("tap:search", -0.6)
    ex_rate = span_rate(ex_src, ex.t("ex-detail", 1.9), 8, B)

    listen = D("Hear how it's said.", [shot(dx, 0, listen_src)], zoom="listen",
               zoom_beat=at(dx, "audio-playing", listen_src, 1.0, 8))
    clip = json.load(open(os.path.join(dx.dir, "listen.json")))["file"]
    listen["sfx"] = [(dx, "audio-playing", os.path.join(dx.dir, clip))]
    return [
        (0, 12, opening),
        (12, 16, dict(kind="icon", icon="macosx/dictionary.png", name="Dictionary")),
        (16, 28, D("Look up any word, in any language.", [
            shot(d, 0, d.t("en", -0.5)), shot(d, 4 * B, d.t("ja", -0.6)), shot(d, 8 * B, d.t("ko", -0.6))])),
        (28, 36, listen),
        (36, 44, D("Watch every stroke.", [shot(d, 0, d.t("tap:hanzi1", -0.3))], zoom="strokes")),
        (44, 54, D("Show readings like Zhuyin.", [shot(dx, 0, read_src, read_rate)], zoom="readings",
                   zoom_beat=at(dx, "zhuyin-on", read_src, read_rate, 10, 0.2))),
        (54, 64, D("Ask AI how a word is used.", [
            shot(d, 0, ai_src, span_rate(ai_src, d.t("ai-end", 0.25), 10, B))], zoom="ai")),
        (64, 68, dict(kind="icon", icon="macosx/fitness.png", name="Fitness", enter="push")),
        (68, 76, D("Plan your week.", [shot(fx_, 0, sched_src, span_rate(sched_src, fx_.t("tap:start", 0.25), 8, B))])),
        (76, 86, D("Log every set.", [shot(fx_, 0, lift_src, lift_rate)], zoom="lift",
                   zoom_beat=at(fx_, "entry", lift_src, lift_rate, 10))),
        (86, 94, D("Learn moves in your language.", [shot(ex, 0, ex_src, ex_rate)], zoom="exercise",
                   zoom_beat=at(ex, "ex-detail", ex_src, ex_rate, 8))),
        (94, 104, D("Log a meal with AI.", [
            shot(fz, 0, meal_src, (fz.t("tap:estimate", 0.45) - meal_src) / (4 * B)),
            shot(fz, 4 * B, fz.t("food-review", -0.25))], zoom="review")),
        (104, 110, D("Split it ÷2.", [shot(fz, 0, split_src, (fz.t("tap:half", 0.55) - split_src) / (6 * B))])),
        (110, 118, D("See your progress.", [shot(fz, 0, fz.t("body", 0.1))], zoom="progress")),
        (118, None, dict(kind="end", icon="mac-512.png", url="os.ryo.lu", enter="push")),
    ]


def make_caption(L, dev, text, title):
    """Centred under the resting device (Apple Support style). Returns the caption and its top-centre anchor;
    refuses layouts where the block would leave the frame or overlap the resting device."""
    lay = STYLE["layout"][L["key"]]
    size = lay["title_size"] if title else lay["caption_size"]
    if (lay.get("title_anchor") or lay["caption_anchor"] if title else lay["caption_anchor"]) == "side":
        return side_caption(L, dev, text, size, lay)
    cap = Caption(text, size, min(lay["caption_max_w"], L["W"] - 2 * lay["margin"]), lay["line_height"])
    dev_bottom = dev.out_box(dev.rest)[3]
    if lay["caption_anchor"] == "gap":
        y = int(round(dev_bottom + lay["caption_gap"])) - cap.pad
    else:
        y = int(round((dev_bottom + L["H"]) / 2 - cap.h / 2))
    x0, y0, x1, y1 = cap.rect(L["W"] / 2, y)
    m = lay["margin"]
    if x0 < m or x1 > L["W"] - m or y1 > L["H"] - m + cap.pad or y + cap.pad < dev_bottom:
        raise ValueError(f"caption {text!r} {x0, y0, x1, y1} doesn't fit under the device (bottom {dev_bottom:.0f}) "
                         f"in {L['W']}x{L['H']} – adjust layout.{L['key']}")
    return cap, (L["W"] // 2, y), None


def side_caption(L, dev, text, size, lay):
    """Apple title-card layout: the block is left-aligned at text_x_frac of the width, vertically centred, at most
    max_chars per line and inside block_w_frac of the width; the device sits device_gap px right of the block's
    widest line, its right edge mirroring the left margin. Returns (caption, (ink left x, top y), device camera)."""
    W, H = L["W"], L["H"]
    x = int(round(lay["text_x_frac"] * W))
    cap = Caption(text, size, lay["block_w_frac"] * W - x, lay["line_height"], lay.get("max_chars"), align="left")
    y = int(round(H / 2 - cap.h / 2))
    ink_w = cap.w - 2 * cap.pad
    # A fixed column keeps the device still across steps. A wider title keeps its own ink width.
    slot = lay.get("side_slot_w")
    ink_right = x + slot if slot and ink_w <= slot + 1 else x + ink_w
    left, right = ink_right + lay["device_gap"], W - x
    bx0, by0, bx1, by1 = dev.bbox
    if lay.get("side_scale") == "rest":
        # Translate only: the device keeps its wide-shot size, its left edge device_gap px right of the block
        # (it may run off the right edge of the frame).
        s = dev.rest[0]
        cam = (s, bx0 + (W / 2 - left) / s, (by0 + by1) / 2)
    else:
        s = min((right - left) / (bx1 - bx0), lay["side_device_h_max"] / (by1 - by0), S_MAX)
        cam = (s, bx1 - (right - W / 2) / s, (by0 + by1) / 2)
    if y < lay["margin"] or y + cap.h > H - lay["margin"]:
        raise ValueError(f"caption {text!r} is too tall for the side layout – adjust layout.{L['key']}")
    return cap, (x, y), cam


CAPTION_LOG = {"frames": 0, "rest": 0, "overlap": [], "offframe": [], "ref_checked": 0, "mismatch": []}


def text_mismatch(frame, cap, ax, y):
    """Largest per-channel difference, over the caption's glyph pixels, between the rendered frame and the same
    lines pasted unmasked onto a plain background: 0 means every glyph is fully visible and uncut."""
    pos = cap.line_xy(ax, y)
    x0, y0 = min(p[0] for p in pos), min(p[1] for p in pos)
    x1 = max(p[0] + l.shape[1] for p, l in zip(pos, cap.lines))
    y1 = max(p[1] + l.shape[0] for p, l in zip(pos, cap.lines))
    H, W = frame.shape[:2]
    if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
        return 255
    ref = np.empty((y1 - y0, x1 - x0, 3), np.uint8)
    ref[:] = BG[::-1]
    ink = np.zeros(ref.shape[:2], bool)
    for (px, py), l in zip(pos, cap.lines):
        paste_rgba(ref, l, px - x0, py - y0)
        ink[py - y0:py - y0 + l.shape[0], px - x0:px - x0 + l.shape[1]] |= l[..., 3] > 0
    d = np.abs(frame[y0:y1, x0:x1].astype(np.int16) - ref.astype(np.int16)).max(axis=2)
    return int(d[ink].max())


def check_caption(L, cap, cx, y, clip_y, tau, at_rest, behind=False, frame=None):
    """Per frame with text on screen: the block (at its current position) stays inside the frame, and once it has
    settled no part of its glyph box is hidden behind the device (below it, or right of it with `behind`), and its
    glyphs match an unmasked reference render pixel for pixel."""
    CAPTION_LOG["frames"] += 1
    x0, y0, x1, y1 = cap.rect(cx, y)
    if x0 < 0 or y1 > L["H"] or (at_rest and (y0 < 0 or x1 > L["W"])):
        CAPTION_LOG["offframe"].append(round(tau, 2))
    if at_rest:
        CAPTION_LOG["rest"] += 1
        if behind or (clip_y is not None and clip_y > y0 + cap.pad):
            CAPTION_LOG["overlap"].append(round(tau, 2))
        if frame is not None:
            CAPTION_LOG["ref_checked"] += 1
            if text_mismatch(frame, cap, cx, y) > 2:
                CAPTION_LOG["mismatch"].append(round(tau, 2))


def blank(L):
    f = np.empty((L["H"], L["W"], 3), np.uint8)
    f[:] = BG[::-1]
    return f


def entrance(sc, prev_sc):
    """(kind, seconds) of the transition a scene enters with; it overlaps the previous scene's tail frames.
    Kinds: None, "mask" (end card), "wipe_in" (panel covers the last scene), "wipe_out" (panel leaves), "push"."""
    P = STYLE["panel"]
    if prev_sc is None:
        return None, 0.0
    if sc["kind"] == "end" and STYLE["end"]["kind"] == "mask":
        return "mask", STYLE["end"]["mask_s"]
    if P["kind"] == "wipe" and sc["kind"] == "icon":
        return "wipe_in", P["in_s"]
    if P["kind"] == "wipe" and prev_sc["kind"] == "icon":
        return "wipe_out", P["out_s"]
    if STYLE["transition"]["kind"] == "inplace" and sc["kind"] == prev_sc["kind"] == "device":
        return "inplace", 0.0
    if STYLE["transition"]["kind"] == "push":
        return "push", STYLE["transition"]["duration_s"]
    return ("push", STYLE["push_s"]) if sc.get("enter") == "push" else (None, 0.0)


def enter_s(sc):
    """How long this scene's entrance transition overlaps the previous scene."""
    return sc.get("enter_s", 0.0)


def slide_text(dst, layer, x, y, t, clip_y):
    """Name / URL entrance: slides out from behind the icon above it ("behind"), or rises in its mask ("mask")."""
    if t <= 0:
        return
    if STYLE["caption_entrance"] == "behind":
        e = ease_cap_in(t / STYLE["caption"]["in_s"])
        behind(dst, layer, x, int(round(y - (1 - e) * (y + layer.shape[0] - clip_y))), clip_y)
    else:
        reveal(dst, layer, x, y, t / STYLE["caption"]["in_s"])


def render_icon(L, sc, B, n):
    """App intro: the theme icon pops in, its name comes out from under it."""
    lay, ic, P = STYLE["layout"][L["key"]], STYLE["icon"], STYLE["panel"]
    icon = load_icon(sc["icon"])
    on_panel = P["kind"] == "wipe"
    name = text_layer(sc["name"], lay["name_size"], tuple(P["ink"]) if on_panel else None)
    pad = int(math.ceil(lay["name_size"] * STYLE["caption"]["pad_em"]))
    size = lay["icon"]
    gap = int(size * 0.12)
    top = (L["H"] - (size + gap + name.shape[0])) // 2
    if on_panel and lay.get("icon_align") == "left":
        # Align the icon's visible art (not its transparent margin) and the label's ink with the caption x.
        x = int(round(lay["text_x_frac"] * L["W"]))
        cols = np.where(icon[..., 3].max(axis=0) > 24)[0]
        icx = x - cols[0] * size / icon.shape[1] + size / 2
        name_x = x - pad
    else:
        icx, name_x = L["W"] / 2, (L["W"] - name.shape[1]) // 2
    base = blank(L)
    if on_panel:
        base[:] = tuple(P["color"])[::-1]
    t_icon = P["content_at_s"] if on_panel else enter_s(sc) * 0.4
    for i in range(n):
        tau = i / FPS
        f = base.copy()
        pop(f, icon, icx, top + size / 2, size, (tau - t_icon) / ic["pop_s"])
        slide_text(f, name, name_x, top + size + gap, tau - t_icon - ic["name_delay_beats"] * B, top + size)
        yield f


def rounded_mask(H, W, cx, cy, side, radius_frac=0.2237):
    """Anti-aliased rounded-square coverage (H, W) centred at (cx, cy)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    h = side / 2
    r = side * radius_frac
    qx = np.abs(xx + 0.5 - cx) - (h - r)
    qy = np.abs(yy + 0.5 - cy) - (h - r)
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return np.clip(0.5 - d, 0, 1)


def render_end(L, sc, B, n, prev=None, focus=None):
    """End card. "mask": the last shot shrinks through an icon-shaped mask onto the ryOS icon (overshoots by
    end.overshoot, springs back), sliding so its device centre (`focus`) lands in the mask; otherwise the icon pops
    in. The URL then comes out from under the icon."""
    lay, ic, E = STYLE["layout"][L["key"]], STYLE["icon"], STYLE["end"]
    icon = load_icon(sc["icon"])
    url = text_layer(sc["url"], lay["url_size"])
    size = int(lay["icon"] * 1.15)
    gap = int(size * 0.1)
    cy = L["H"] / 2 - E["icon_above_mid_1080"] * L["H"] / 1080
    top = int(round(cy - size / 2))
    base = blank(L)
    mask_n = len(prev) if (E["kind"] == "mask" and prev) else 0
    t_icon = mask_n / FPS if mask_n else enter_s(sc)
    cover = 2.7 * max(L["W"] / 2, L["H"] / 2 + abs(cy - L["H"] / 2))
    split = 0.72
    for i in range(n):
        tau = i / FPS
        f = base.copy()
        if i < mask_n:
            u = (i + 1) / mask_n
            if u <= split:
                g = ease_move(u / split)
                side = cover + (size * (1 - E["overshoot"]) - cover) * g
                m = rounded_mask(L["H"], L["W"], L["W"] / 2, cy, side)[..., None]
                src = prev[i]
                if focus is not None:
                    shift = np.float32([[1, 0, (L["W"] / 2 - focus[0]) * g], [0, 1, (cy - focus[1]) * g]])
                    src = cv2.warpAffine(src, shift, (L["W"], L["H"]), borderMode=cv2.BORDER_REPLICATE)
                f = (src.astype(np.float32) * m + f.astype(np.float32) * (1 - m)).astype(np.uint8)
            else:
                v = (u - split) / (1 - split)
                k = (1 - E["overshoot"]) + E["overshoot"] * (1 - (1 - v) ** 3)
                pop(f, icon, L["W"] / 2, cy, size * k, 1.0)
        elif E["kind"] == "mask":
            pop(f, icon, L["W"] / 2, cy, size, 1.0)
        else:
            pop(f, icon, L["W"] / 2, cy, size, (tau - t_icon) / ic["pop_s"])
        slide_text(f, url, (L["W"] - url.shape[1]) // 2, top + size + gap, tau - t_icon - ic["url_delay_beats"] * B,
                   top + size)
        yield f


def render_title_push(L, dev, sc, n, B):
    """Hero title alone, left-aligned with one word per line; each word slides up in its own mask box, one after
    another on beat subdivisions. Then the phone pushes up from below and carries the title up and out."""
    lay, O = STYLE["layout"][L["key"]], STYLE["open"]
    x = int(round(lay["hero_x_frac"] * L["W"]))
    cap = Caption(sc["caption"], lay["hero_size"], L["W"] - x - lay["margin"], lay["hero_line_height"],
                  align="left", lines=sc["caption"].split(" "))
    y0 = int(round(L["H"] / 2 - cap.h / 2))
    s = sc["shots"][0]
    top0 = dev.out_box(s["cam"])[1]
    t_in, step, word_s = O["title_in_beats"] * B, O["word_stagger_beats"] * B, O["word_in_s"]
    settled = t_in + step * (cap.n - 1) + word_s
    for j, fr in enumerate(s["take"].frames(s["src"], s["rate"], n)):
        tau = j / FPS
        cam = cam_at(s, tau)
        sc["last_cam"] = cam
        f = dev.render(fr, cam)
        moved = top0 - dev.out_box(cam)[1]
        y = int(round(y0 - moved))
        if tau >= t_in and y + cap.h > 0:
            for i, (l, (lx, ly)) in enumerate(zip(cap.lines, cap.line_xy(x, y))):
                reveal(f, l, lx, ly, (tau - t_in - i * step) / word_s)
            check_caption(L, cap, x, y, None, tau + sc["t0"], tau >= settled and moved < 0.5, frame=f)
        yield f


def render_device(L, dev, sc, B, n):
    if sc.get("title_push"):
        yield from render_title_push(L, dev, sc, n, B)
        return
    cap, (cx, cy), side_cam = make_caption(L, dev, sc["caption"], sc["title"])
    T = STYLE["tap"]
    t_in = sc["cap_in_s"] if sc.get("cap_in_s") is not None else sc["cap_in"] * B
    in_s = sc.get("cap_dur_s") or STYLE["caption"]["in_s"]
    rolled = None
    if sc.get("roll_from"):
        # The previous step's caption is still up: change it in place instead of entering again.
        old_cap, old_at, _ = make_caption(L, dev, sc["roll_from"], False)
        rolled, roll_n = (old_cap, old_at), round(STYLE["caption"]["roll_s"] * FPS)
        t_in = -in_s
    t_out = sc["cap_out"] * B if sc["cap_out"] is not None else None
    t_gone = None if t_out is None else t_out + STYLE["caption"]["out_s"] + STYLE["caption"]["stagger_s"] * cap.n
    behind_mode = STYLE["caption_entrance"] == "behind"
    if side_cam:
        edge = dev.left_edge_rows(side_cam, cy, cap.h)
        clip0 = float(edge[np.isfinite(edge)].max())   # tucked: the ink starts behind the lid on every text row
    else:
        clip0 = dev.out_box(dev.rest)[3]
    tap_kind = T["phone" if L["device"] == "phone" else "mac"]
    shots = sc["shots"]
    bounds = [min(n, round(s["at"] * FPS)) for s in shots] + [n]
    for k, s in enumerate(shots):
        if bounds[k + 1] <= bounds[k]:
            continue
        count = bounds[k + 1] - bounds[k]
        taps = shot_taps(L, s)
        for j, fr in enumerate(s["take"].frames(s["src"], s["rate"], count)):
            tau_shot = j / FPS
            tau = bounds[k] / FPS + tau_shot
            cam = cam_at(s, tau_shot)
            sc["last_cam"] = cam
            f = dev.render(fr, cam)
            if tap_kind == "ios":
                draw_ios_taps(f, dev, cam, taps, tau_shot)
            elif tap_kind == "cursor":
                draw_cursor(f, dev, cam, taps, tau_shot)
            else:
                for (tt, px, py) in taps:
                    draw_tap(f, dev, cam, (px, py), tau_shot - tt)
            if rolled and bounds[k] + j < roll_n:
                roll(f, rolled[0], rolled[1], cap, (cx, cy), (bounds[k] + j + 1) / roll_n)
            elif tau >= t_in and (t_gone is None or tau < t_gone):
                if side_cam:
                    e = ease_cap_in((tau - t_in) / in_s)
                    if t_out is not None and tau >= t_out:
                        e *= 1 - ease_cap_out((tau - t_out) / STYLE["caption"]["out_s"])
                    clip_rows = lambda y0, h, cam=cam: dev.left_edge_rows(cam, y0, h)  # noqa: E731
                    xt = cap.draw_side(f, cx, cy, e, clip_rows, clip0)
                    if xt is not None:
                        check_caption(L, cap, xt, cy, None, tau + sc["t0"], e >= 0.999,
                                      behind=xt + cap.w - 2 * cap.pad > clip_rows(cy, cap.h).min(), frame=f)
                elif behind_mode:
                    e = ease_cap_in((tau - t_in) / in_s)
                    if t_out is not None and tau >= t_out:
                        e *= 1 - ease_cap_out((tau - t_out) / STYLE["caption"]["out_s"])
                    clip_y = dev.out_box(cam)[3]
                    yt = cap.draw_behind(f, cx, cy, e, clip_y, clip0)
                    if yt is not None:
                        check_caption(L, cap, cx, yt, clip_y, tau + sc["t0"], e >= 0.999, frame=f)
                else:
                    cap.draw(f, cx, cy, tau - t_in, tau - t_out if t_out is not None and tau >= t_out else None)
                    check_caption(L, cap, cx, cy, dev.out_box(cam)[3], tau + sc["t0"],
                                  tau - t_in >= in_s + STYLE["caption"]["stagger_s"] * cap.n and t_out is None or
                                  (t_out is not None and t_in + in_s <= tau < t_out), frame=f)
            yield f


def push(prev, cur, u):
    """Device slide: the next scene pushes in from the right on the move curve."""
    W = cur.shape[1]
    x = int(round(ease_move(u) * W))
    out = np.empty_like(cur)
    out[:, :W - x] = prev[:, x:]
    out[:, W - x:] = cur[:, :x]
    return out


def wipe_in(prev, cur, u):
    """The panel scene (cur) wipes in from the left over the last scene."""
    x = int(round(ease_move(u) * cur.shape[1]))
    out = prev.copy()
    out[:, :x] = cur[:, :x]
    return out


def wipe_out(prev, cur, u):
    """The panel (prev) slides off to the right, revealing the next scene underneath."""
    W = cur.shape[1]
    x = int(round(ease_move(u) * W))
    out = cur.copy()
    out[:, x:] = prev[:, :W - x]
    return out


TRANSITIONS = {"push": push, "wipe_in": wipe_in, "wipe_out": wipe_out}


# ---------------------------------------------------------------- audio
def _env_term(a, b, ramp):
    """Smooth 0→1→0 step covering [a, b], with `ramp` seconds of attack and release."""
    return (f"min(max((t-{a - ramp:.4f})/{ramp:.4f},0),1)"
            f"*min(max(({b + ramp:.4f}-t)/{ramp:.4f},0),1)")


def _max_env(terms):
    env = terms[0]
    for term in terms[1:]:
        env = f"max({env},{term})"
    return env


def atempo_chain(rate):
    """ffmpeg atempo stays in (0.5, 2]. Chain stages when a shot is faster or slower than that."""
    filters, r = [], float(rate)
    if r <= 0:
        raise ValueError(f"playback rate {rate}")
    while r > 2.0 + 1e-6:
        filters.append("atempo=2.0")
        r /= 2.0
    while r < 0.5 - 1e-6:
        filters.append("atempo=0.5")
        r /= 0.5
    filters.append(f"atempo={r:.6f}")
    return ",".join(filters)


def build_audio(music, start, out_wav, sfx=(), beds=()):
    """Music excerpt with a short fade over the end card, normalized to -14 LUFS (two-pass loudnorm).

    `sfx` is (output time, file): dictionary pronunciation clips, and the bed ducks under each one.
    `beds` are pieces of a take's own audio already lined up with a shot:
    {path, t, src, dur, rate, duck}. `duck` dips the bed for that piece (the iPod song). Click-wheel
    ticks ride in the same take audio with duck left off, so the bed stays at its normal level under them.
    """
    fade = 1.6
    A, S = STYLE["sfx"], STYLE.get("song") or STYLE["sfx"]
    inputs = ["-ss", f"{start}", "-t", f"{DURATION}", "-i", music]
    music_chain = f"afade=t=in:d=0.02,afade=t=out:st={DURATION - fade:.2f}:d={fade}"
    dips = []
    if sfx:
        duck = 1 - 10 ** (-A["duck_db"] / 20)
        terms = []
        for t, path in sfx:
            dur = float(subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                capture_output=True, text=True).stdout)
            terms.append(_env_term(t - A["duck_lead_s"], t + dur + A["duck_tail_s"], A["duck_ramp_s"]))
        dips.append(f"{duck:.4f}*({_max_env(terms)})")
    song_windows = []
    for bed in beds:
        if not bed.get("duck"):
            continue
        out_dur = bed["dur"] / bed["rate"]
        song_windows.append((bed["t"], bed["t"] + out_dur))
    if song_windows:
        duck = 1 - 10 ** (-S["duck_db"] / 20)
        terms = [_env_term(a - S["duck_lead_s"], b + S["duck_tail_s"], S["duck_ramp_s"]) for a, b in song_windows]
        dips.append(f"{duck:.4f}*({_max_env(terms)})")
    if dips:
        music_chain += f",volume='max(0.02,1-({'+'.join(dips)}))':eval=frame"

    graph, labels = [], []
    idx = 1
    for i, (t, path) in enumerate(sfx):
        inputs += ["-i", path]
        ms = int(round(t * 1000))
        graph.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume={A['gain_db']}dB,"
                     f"adelay={ms}|{ms},apad[s{i}]")
        labels.append(f"[s{i}]")
        idx += 1
    for i, bed in enumerate(beds):
        inputs += ["-i", bed["path"]]
        out_dur = bed["dur"] / bed["rate"]
        edge = min(0.012, out_dur / 4) if out_dur > 0.05 else 0.0
        fade_out = min(bed.get("fade_out", edge), out_dur / 3) if out_dur > 0.05 else 0.0
        ms = int(round(max(0.0, bed["t"]) * 1000))
        chain = (f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,"
                 f"atrim=start={bed['src']:.4f}:end={bed['src'] + bed['dur']:.4f},asetpts=PTS-STARTPTS,"
                 f"{atempo_chain(bed['rate'])}")
        if edge > 0:
            chain += f",afade=t=in:d={edge:.4f}"
        if fade_out > 0:
            chain += f",afade=t=out:st={max(0.0, out_dur - fade_out):.4f}:d={fade_out:.4f}"
        chain += f",adelay={ms}|{ms},apad[b{i}]"
        graph.append(chain)
        labels.append(f"[b{i}]")
        idx += 1
    graph.insert(0, f"[0:a]aresample=48000,aformat=channel_layouts=stereo,{music_chain}[m]")
    if labels:
        graph.append(f"[m]{''.join(labels)}amix=inputs={len(labels) + 1}:normalize=0:duration=first[mix]")
        mix = "[mix]"
    else:
        mix = "[m]"

    def run(tail, extra, **kw):
        return subprocess.run(["ffmpeg", "-hide_banner", "-y", *inputs, "-filter_complex", ";".join(graph) + f";{mix}{tail}",
                               *extra], **kw)

    probe = run("loudnorm=I=-14:TP=-1:LRA=11:print_format=json[out]", ["-map", "[out]", "-f", "null", "-"],
                capture_output=True, text=True).stderr
    st = json.loads(probe[probe.rindex("{"):probe.rindex("}") + 1])
    norm = (f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={st['input_i']}:measured_TP={st['input_tp']}:"
            f"measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true")
    # level defaults on, which would undo loudnorm. AAC still adds a little inter-sample peak.
    post = ",alimiter=limit=0.89:level=disabled:attack=5:release=60" if beds else ""
    run(f"{norm},aresample=48000{post}[out]", ["-map", "[out]", "-ac", "2", "-t", f"{DURATION}", out_wav],
        check=True, capture_output=True)


# seekPlayer target for the pronunciation line: (line start − lyricOffset) / 1000 + 0.6.
# The stem jumps here at the `lyrics` mark, the first frame the edit keeps. The
# previous mix jumped at video-end, so ~2.1 s of the line played into a gap the
# cut skips and the lyrics shot opened already that far into the vocal.
IPOD_SEEK_SECONDS = 37.883
# Quiet intro sits under a bed ducked 10 dB. Hold it up, then rise 8 dB across
# the volume shot (the old +10.5 dB intro lift was decaying through that shot,
# so the slider moved and the level did not).
IPOD_GAIN_BEFORE_DB = 5.0
IPOD_GAIN_RIDE_DB = 8.0


def _has_audio(path):
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path],
        capture_output=True, text=True)
    return bool(probe.stdout.strip())


def _mark_t(marks, name):
    return marks[name]["t"]


def ipod_gesture_script():
    """Nominal seconds for each click and wheel detent, one list per stretch between marks.

    Durations follow shoot.ts (sleeps, and ~0.36 s per spin() drag). The wheel plays one tick per
    spin — 22° clears the reversal gate once. Seek mode mutes the clicker, so those spins are silent.
    """
    def stretch():
        t, ev = 0.0, []

        def wait(s):
            nonlocal t
            t += s

        def click():
            ev.append((t, "click"))

        def spins(n):
            nonlocal t
            for _ in range(abs(n)):
                ev.append((t + 0.16, "wheel"))
                t += 0.36

        return ev, wait, click, spins, lambda: t

    segs = []

    def add(a, b, build):
        ev, end = build()
        segs.append((a, b, ev, end))

    def menu_to_songs():
        ev, wait, click, spins, end = stretch()
        wait(1.10); click(); wait(0.70); spins(3); wait(0.25); click(); wait(1.40)
        return ev, end()

    def songs_to_cover():
        ev, wait, click, spins, end = stretch()
        click(); wait(0.40); spins(3); wait(0.18); click(); wait(0.70)
        return ev, end()

    def cover_flips():
        ev, wait, click, spins, end = stretch()
        spins(4); wait(0.20); spins(4); wait(0.25)
        return ev, end()

    def start_playback():
        ev, wait, click, spins, end = stretch()
        wait(0.50); click(); wait(0.80)
        return ev, end()

    def volume_on():
        ev, wait, click, spins, end = stretch()
        spins(1); wait(0.08)
        return ev, end()

    def volume_ride():
        ev, wait, click, spins, end = stretch()
        spins(4); wait(1.80)
        return ev, end()

    def into_seek():
        ev, wait, click, spins, end = stretch()
        click(); wait(0.25)
        return ev, end()

    def into_video():
        ev, wait, click, spins, end = stretch()
        click(); wait(0.55)
        return ev, end()

    def into_lyrics():
        ev, wait, click, spins, end = stretch()
        wait(1.10); click(); wait(0.22); click(); wait(0.30)
        return ev, end()

    add("menu", "songs", menu_to_songs)
    add("songs", "cover", songs_to_cover)
    add("cover", "cover-end", cover_flips)
    add("cover-end", "playing", start_playback)
    add("play-end", "volume", volume_on)
    add("volume", "volume-end", volume_ride)
    add("volume-end", "seek", into_seek)
    add("seek-end", "video", into_video)
    add("video-end", "lyrics", into_lyrics)
    return segs


def ipod_heard_windows(marks):
    """Source ranges the 30 s and 60 s cuts actually play. A tick that lands just before one is kept."""
    m = lambda n, off=0.0: _mark_t(marks, n) + off
    return [
        (m("menu", 0.15), m("songs", 0.4)),
        (m("cover", 0.15), m("cover-end", -0.1)),
        (m("playing", 0.2), m("play-end", -0.15)),
        (m("volume", 0.1), m("volume-end", -0.1)),
        (m("seek", 0.1), m("seek-end", -0.1)),
        (m("video", 0.2), m("video-end", -0.1)),
        (m("lyrics"), m("end")),
    ]


def ipod_source_events(marks):
    """Click and wheel times on the capture clock, scaled into each measured gap, then nudged into a heard window."""
    events = []
    for a, b, rel, nominal in ipod_gesture_script():
        span = _mark_t(marks, b) - _mark_t(marks, a)
        scale = span / nominal if nominal else 1.0
        for t, kind in rel:
            events.append((_mark_t(marks, a) + t * scale, kind))
    windows = ipod_heard_windows(marks)
    kept = []
    for t, kind in events:
        if any(a - 0.02 <= t <= b + 0.02 for a, b in windows):
            kept.append((t, kind))
            continue
        nxt = min((a for a, b in windows if a > t), default=None)
        if nxt is not None and nxt - t <= 1.0:
            kept.append((nxt + 0.04, kind))
            print(f"[ipod-audio] nudge {kind} {t:.2f}s → {nxt + 0.04:.2f}s")
        else:
            print(f"[ipod-audio] skip {kind} {t:.2f}s (between shots)")
    kept.sort()
    spread, last = [], -1.0
    for t, kind in kept:
        if t - last < 0.06:
            t = last + 0.07
        spread.append((t, kind))
        last = t
    return spread


def _normalized_song(src):
    """One -14 LUFS / -3 dBTP copy of the YouTube audio, so the mix doesn't chase its true peak."""
    out = os.path.join(ROOT, "supernatural-norm.wav")
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        return out
    probe = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", src, "-af", "loudnorm=I=-14:TP=-3:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    st = json.loads(probe[probe.rindex("{"):probe.rindex("}") + 1])
    norm = (f"loudnorm=I=-14:TP=-3:LRA=11:measured_I={st['input_i']}:measured_TP={st['input_tp']}:"
            f"measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-hide_banner", "-y", "-i", src, "-af", norm, "-ar", "48000", "-ac", "2", out],
                   check=True, capture_output=True)
    print(f"[ipod-audio] normalized song → {out}")
    return out


def _clock_slices(marks):
    """(capture_start, song_seconds, duration) for the on-screen player.

    Reads of the LCD (desktop and phone takes differ by where playback began):
    the clock runs with the capture until the scrub digits step, then again
    until the lyrics mark, where the shooter seeks to the pronunciation line.
    That seek used to fire at video-end, inside a gap the edit does not play.
    """
    playing = _mark_t(marks, "playing")
    lyrics = _mark_t(marks, "lyrics")
    end = float(marks["end"]["t"]) + 0.4
    phone = playing < 14
    # (capture_t, song_s) anchors. Slope is 1 between them except where the
    # next anchor's song time jumps ahead of realtime — those are the scrub steps.
    if phone:
        anchors = [
            (playing, 8.0 + (playing - 18.80)),
            (23.60, 14.00),
            (24.40, 16.00),
            (25.20, 17.00),
            (lyrics, None),  # realtime up to the lyrics seek
        ]
    else:
        anchors = [
            (playing, 8.0 + (playing - 22.00)),
            (28.00, 14.00),
            (28.40, 15.00),
            (28.80, 16.00),
            (29.60, 18.00),
            (lyrics, None),
        ]
    slices = []
    for i, (t0, song0) in enumerate(anchors):
        if song0 is None:
            break
        nxt_t, nxt_song = anchors[i + 1]
        if nxt_song is None:
            # Realtime up to the lyrics mark, then the pronunciation-line seek.
            slices.append((t0, max(0.0, song0), lyrics - t0))
            slices.append((lyrics, IPOD_SEEK_SECONDS, end - lyrics))
            break
        slices.append((t0, max(0.0, song0), nxt_t - t0))
    return [(t, s, d) for t, s, d in slices if d > 0.04]


def _slice_gain_expr(t0, dur, volume_t, volume_end):
    """Gain vs the -14 LUFS stem. +5 dB before the volume shot, then +8 dB across it."""
    lo = 10 ** (IPOD_GAIN_BEFORE_DB / 20)
    hi = 10 ** ((IPOD_GAIN_BEFORE_DB + IPOD_GAIN_RIDE_DB) / 20)
    if t0 + dur <= volume_t + 0.001:
        return f"{lo:.4f}"
    if t0 >= volume_end - 0.001:
        return f"{hi:.4f}"
    t_vol = volume_t - t0
    t_hold = volume_end - t0
    span = max(0.05, t_hold - t_vol)
    return (f"if(lt(t,{t_vol:.3f}),{lo:.4f},if(gt(t,{t_hold:.3f}),{hi:.4f},"
            f"pow(10,({IPOD_GAIN_BEFORE_DB:.1f}+{IPOD_GAIN_RIDE_DB:.1f}*(t-{t_vol:.3f})/{span:.3f})/20)))")


def write_ipod_program(take_dir, marks):
    """Source-timeline mix of the UI samples plus Supernatural, for a capture that has no audio track.

    The screencast is pictures only. These are the same click and wheel files the app played
    (ui sounds default on), placed on the gesture clock. The song follows the on-screen
    player, including the scrub steps and the lyrics seek.
    """
    song_src = os.environ.get("PROMO_IPOD_SONG") or os.path.join(ROOT, "supernatural.webm")
    if not os.path.exists(song_src):
        raise FileNotFoundError(f"no iPod song audio at {song_src} (set PROMO_IPOD_SONG)")
    song = _normalized_song(song_src)
    sounds = os.path.join(REPO, "public", "sounds")
    click = os.path.join(sounds, "ButtonClickDown.mp3")
    wheel = os.path.join(sounds, "WheelsOfTime.m4a")
    events = ipod_source_events(marks)
    dur = float(marks["end"]["t"]) + 0.4
    volume_t = _mark_t(marks, "volume")
    volume_end = _mark_t(marks, "volume-end")
    slices = _clock_slices(marks)
    inputs = ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    graph, labels = [], ["[0:a]"]
    for i, (t, kind) in enumerate(events):
        inputs += ["-i", click if kind == "click" else wheel]
        ms = int(round(t * 1000))
        gain = "1.25" if kind == "click" else "2.5"
        graph.append(f"[{i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume={gain},"
                     f"adelay={ms}|{ms},apad[e{i}]")
        labels.append(f"[e{i}]")
    si = 1 + len(events)
    inputs += ["-i", song]
    n = len(slices)
    graph.append(f"[{si}:a]asplit={n}" + "".join(f"[s{k}]" for k in range(n)))
    prev_end = None
    for k, (t0, song0, length) in enumerate(slices):
        ms = int(round(t0 * 1000))
        expr = _slice_gain_expr(t0, length, volume_t, volume_end)
        seek = prev_end is None or abs(song0 - prev_end) > 0.05
        fade = "afade=t=in:d=0.03," if seek else ""
        graph.append(f"[s{k}]aresample=48000,aformat=channel_layouts=stereo,"
                     f"atrim=start={song0:.3f}:end={song0 + length + 0.02:.3f},asetpts=PTS-STARTPTS,"
                     f"volume='{expr}':eval=frame,{fade}adelay={ms}|{ms},apad[song{k}]")
        labels.append(f"[song{k}]")
        prev_end = song0 + length
        print(f"[ipod-audio] song {t0:.2f}s+{length:.2f}s ← file {song0:.2f}s"
              + (" seek" if seek else ""))
    graph.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first:dropout_transition=0,"
                 f"alimiter=limit=0.95:attack=5:release=80[out]")
    out = os.path.join(take_dir, "program.wav")
    subprocess.run(["ffmpeg", "-hide_banner", "-y", *inputs, "-filter_complex", ";".join(graph),
                    "-map", "[out]", "-ac", "2", "-t", f"{dur:.3f}", out],
                   check=True, capture_output=True)
    print(f"[ipod-audio] {out} {len(events)} ui sounds, {n} song slices, "
          f"volume +{IPOD_GAIN_RIDE_DB:.0f} dB across {volume_t:.2f}–{volume_end:.2f}s")
    return out


def ipod_program(take_dir):
    """The take's audio. A real capture track is used whole; a silent screencast gets program.wav."""
    mkv = os.path.join(take_dir, "capture.mkv")
    if _has_audio(mkv):
        print(f"[ipod-audio] using capture audio {mkv}")
        return mkv
    marks = {mk["name"]: mk for mk in json.load(open(os.path.join(take_dir, "marks.json")))["marks"]}
    return write_ipod_program(take_dir, marks)


def stamp_scenes(scenes, B):
    total = int(round(DURATION * FPS))
    for b0, b1, sc in scenes:
        f0 = round(b0 * B * FPS)
        f1 = total if b1 is None else round(b1 * B * FPS)
        sc["t0"] = f0 / FPS
        sc["t1"] = f1 / FPS
    return scenes


def ipod_beds(scenes):
    """One audio piece per iPod shot, time-warped like the picture. The bed ducks only once the song is on."""
    by_dir = {}
    beds = []
    song_from = {}
    last_song = None
    pieces = []
    for _, _, sc in scenes:
        if sc.get("kind") != "device":
            continue
        for sh in sc["shots"]:
            if not sh["take"].dir.endswith("-ipod"):
                continue
            src = by_dir.get(sh["take"].dir)
            if src is None:
                src = by_dir[sh["take"].dir] = ipod_program(sh["take"].dir)
                song_from[sh["take"].dir] = sh["take"].t("playing")
            dur = max(0.05, (sc["t1"] - sc["t0"] - sh["at"]) * sh["rate"])
            piece = {"path": src, "t": sc["t0"] + sh["at"], "src": sh["src"], "dur": dur, "rate": sh["rate"],
                     "duck": sh["src"] + dur > song_from[sh["take"].dir] + 0.05}
            pieces.append(piece)
            if piece["duck"]:
                last_song = piece
    if last_song is not None:
        last_song["fade_out"] = 0.28
    for piece in pieces:
        if piece["duck"]:
            print(f"[ipod-audio] duck {piece['t']:.2f}s+{piece['dur'] / piece['rate']:.2f}s "
                  f"src {piece['src']:.2f} rate {piece['rate']:.3f}")
    beds.extend(pieces)
    return beds


def mux_audio(video, wav, out):
    """AAC 48 kHz on the existing frames. Video is copied, so a remux does not rebuild the picture."""
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", wav, "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
                    "-t", f"{DURATION}", "-movflags", "+faststart", out], check=True)


def remux_audio(L, B, video, out, music, music_start):
    """Replace the soundtrack on a finished master. The video bitstream is copied through."""
    dev = Device(L)
    scenes = stamp_scenes(plan(L, dev, B, int(DURATION)), B)
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "music.wav")
        beds = ipod_beds(scenes) if APP == "ipod" else []
        build_audio(music, music_start, wav, sfx_times(scenes), beds)
        mux_audio(video, wav, out)
    print(f"[remux] {out}")


def sfx_times(scenes):
    """(output time, file) for each in-app sound: the take mark mapped through the shot that plays it."""
    out = []
    for _, _, sc in scenes:
        for take, mark, path in sc.get("sfx", ()):
            mt = take.t(mark)
            # The shot on screen when the mark plays: the last one that has started by then.
            sh = [s for s in sc["shots"] if s["take"] is take and mt >= s["src"]
                  and all(o["at"] > s["at"] + (mt - s["src"]) / s["rate"] for o in sc["shots"] if o["at"] > s["at"])][-1]
            out.append((sc["t0"] + sh["at"] + (mt - sh["src"]) / sh["rate"], path))
    for t, path in out:
        print(f"[sfx] {t:6.2f}s {os.path.basename(path)}")
    return out


def compose(L, B, out, music=None, music_start=0.0):
    W, H = L["W"], L["H"]
    total = int(round(DURATION * FPS))
    tmp_video = out + ".video.mp4"
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", os.environ.get("PROMO_CRF", "16"),
         "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp_video],
        stdin=subprocess.PIPE)
    dev = Device(L)
    scenes = plan(L, dev, B, int(DURATION))
    for i, (_, _, sc) in enumerate(scenes):
        sc["index"] = i
        sc["enter_kind"], sc["enter_s"] = entrance(sc, scenes[i - 1][2] if i else None)
    # In-place steps within an app: a caption still up at the cut rolls over to the next step's caption
    # (caption.change "roll"), or tucks back behind the device so the next one can slide out again ("tuck").
    for i in range(len(scenes) - 1):
        b0, b1, sc = scenes[i]
        nxt = scenes[i + 1][2]
        if nxt["enter_kind"] == "inplace" and sc["cap_out"] is None:
            if STYLE["caption"].get("change") == "roll":
                nxt["roll_from"] = sc["caption"]
            else:
                sc["cap_out"] = (b1 - b0) - (STYLE["caption"]["out_s"] + 0.1) / B
    written, prev, tail = 0, None, []
    for i, (b0, b1, sc) in enumerate(scenes):
        f0 = round(b0 * B * FPS)
        f1 = total if b1 is None else round(b1 * B * FPS)
        n = f1 - f0
        kind = sc["kind"]
        sc["t0"] = f0 / FPS
        sc["t1"] = f1 / FPS
        # A scene keeps rendering past its end for as long as the next scene's entrance overlaps it.
        nxt = scenes[i + 1][2] if i + 1 < len(scenes) else None
        extra = round(enter_s(nxt) * FPS) if nxt is not None else 0
        enter_n = round(enter_s(sc) * FPS)
        trans = TRANSITIONS.get(sc["enter_kind"])
        last = scenes[i - 1][2].get("last_cam") if i else None
        if sc["enter_kind"] == "inplace" and last and max(abs(a - b) for a, b in zip(last, sc["shots"][0]["cam"])) > 1e-3:
            # Continuous camera: start where the last step ended (e.g. zoomed in) and ease back to this step's framing.
            first = sc["shots"][0]
            first["moves"].insert(0, (0.0, first["cam"]))
            first["cam"] = last
            sc["cap_in_s"] = max(sc.get("cap_in_s") or 0.0, STYLE["move"]["duration_s"] - STYLE["caption"]["in_s"] + 0.1)
        focus = None
        if kind == "end" and i and scenes[i - 1][2].get("last_cam"):
            sx, sy, sw, sh = dev.screen
            focus = dev.to_out(scenes[i - 1][2]["last_cam"], sx + sw / 2, sy + sh / 2)
        gen = (render_icon(L, sc, B, n + extra) if kind == "icon"
               else render_end(L, sc, B, n + extra, focus=focus,
                               prev=tail if kind == "end" and STYLE["end"]["kind"] == "mask" else None)
               if kind == "end" else render_device(L, dev, sc, B, n + extra))
        print(f"[{f0 / FPS:6.2f}s] beat {b0:>2} {kind:6s} {sc.get('caption') or sc.get('name') or sc.get('url')}", flush=True)
        hold, new_tail = prev, []
        for j, f in enumerate(gen):
            if j >= n:
                new_tail.append(f)
                continue
            prev = f
            if j < enter_n and hold is not None and trans:
                f = trans(tail[j] if j < len(tail) else hold, f, (j + 1) / enter_n)
            enc.stdin.write(f.tobytes())
            written += 1
        tail = new_tail
    enc.stdin.close()
    enc.wait()
    if music:
        with tempfile.TemporaryDirectory() as td:
            wav = os.path.join(td, "music.wav")
            beds = ipod_beds(scenes) if APP == "ipod" else []
            build_audio(music, music_start, wav, sfx_times(scenes), beds)
            mux_audio(tmp_video, wav, out)
        os.remove(tmp_video)
    else:
        os.replace(tmp_video, out)
    print(f"[done] {out} {written} frames = {written / FPS:.2f}s")
    log = CAPTION_LOG
    print(f"[captions] {log['frames']} frames with text: {len(log['offframe'])} off-frame, "
          f"{log['rest']} settled, {len(log['overlap'])} settled frames partly behind the device"
          + (f" at {log['overlap'][:6]}…" if log["overlap"] else "")
          + f"; {log['ref_checked']} settled frames vs unmasked reference: {len(log['mismatch'])} with cut/hidden glyphs"
          + (f" at {log['mismatch'][:6]}…" if log["mismatch"] else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--vertical", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--style", default=os.environ.get("PROMO_STYLE", BGM2_STYLE), help="JSON overrides for style.py")
    ap.add_argument("--music", default=os.environ.get("PROMO_MUSIC"), help="bgm2.mp3 (never committed)")
    ap.add_argument("--music-start", type=float, default=os.environ.get("PROMO_MUSIC_START"),
                    help="downbeat the excerpt starts on (default: bgm2's offset for --length)")
    ap.add_argument("--bpm", type=float, default=os.environ.get("PROMO_BPM"), help="default: bgm2's tempo for --length")
    ap.add_argument("--length", type=int, choices=(30, 60), default=int(os.environ.get("PROMO_LENGTH", "30")))
    ap.add_argument("--app", choices=("dictionary", "ipod"), default=os.environ.get("PROMO_APP", "dictionary"))
    ap.add_argument("--remux", metavar="VIDEO",
                    help="Keep this master's frames and write a new -14 LUFS mix to --out")
    args = ap.parse_args()
    APP = args.app
    start, bpm = BGM2_GRID[args.length]
    args.music_start = start if args.music_start is None else float(args.music_start)
    args.bpm = bpm if args.bpm is None else float(args.bpm)
    DURATION = float(args.length)
    configure(style_mod.load(args.style))
    L = LAYOUTS["v" if args.vertical else "h"]
    stem = "ryos-ipod" if args.app == "ipod" else "ryos-dictionary-fitness"
    out = args.out or os.path.join(ROOT, "out", f"{stem}-{args.length}s{'-vertical' if args.vertical else ''}.mp4")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    if args.remux:
        remux_audio(L, 60.0 / args.bpm, args.remux, out, args.music, args.music_start)
    else:
        compose(L, 60.0 / args.bpm, out, args.music, args.music_start)
