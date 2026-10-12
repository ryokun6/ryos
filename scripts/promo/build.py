#!/usr/bin/env python3
"""
Compose the 30 s Dictionary + Fitness promo from real ryOS captures.

  python3 scripts/promo/build.py [--vertical] [--out path.mp4] [--music track.mp3]
                                 [--music-start 110.705] [--bpm 126.35]

Horizontal = desktop takes in Apple's MacBook Air 13" bezel; --vertical = phone takes in the iPhone 18 Pro bezel.
Bezels come from Apple Design Resources and are downloaded + cached by bezels.py (never committed). The captures
are the bezel's native screen size, so footage maps 1:1 onto the screen cut-out (its corner radius, the notch and
the Dynamic Island come from the bezel's own alpha). The camera moves the whole device: punch-ins scale and slide
the framed device, never crop inside the screen, and stop at 1 output px per screen px.

Inputs: $PROMO_WORK_DIR/rec/{desktop,phone}-{desktop,dictionary,fitness}/ (capture.mkv + marks.json from shoot.ts);
PROMO_WORK_DIR defaults to tmp/promo at the repo root. App icons are the repo's macOS X theme icons in public/icons.

Music: --music or $PROMO_MUSIC (never committed). Every cut and text hit is placed on the track's beat
grid: --music-start ($PROMO_MUSIC_START) is the downbeat the excerpt starts on and --bpm ($PROMO_BPM) its
tempo – find both with music.py. The excerpt is faded out over the end card, normalized to -14 LUFS and
muxed as AAC 192k. Without music the video is silent on the same grid.

Needs numpy, Pillow, opencv-python-headless, ffmpeg and 7z (for bezels.py).
"""
import argparse
import json
import math
import os
import subprocess
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from bezels import bezel_path

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..", "..")
ROOT = os.environ.get("PROMO_WORK_DIR") or os.path.join(REPO, "tmp", "promo")
REC = os.path.join(ROOT, "rec")
ICONS = os.path.join(REPO, "public", "icons")
FPS = 30
DURATION = 30.0
FONT_DIR = os.environ.get("PROMO_FONT_DIR", "/usr/share/fonts/truetype/macos")
BOLD = os.path.join(FONT_DIR, "Inter-Bold.ttf")
SEMIBOLD = os.path.join(FONT_DIR, "Inter-SemiBold.ttf")

BG = (245, 245, 247)
INK = (29, 29, 31)
SUBTLE = (110, 110, 115)
REVEAL_S = 0.3     # caption slide-up / slide-down
POP_S = 0.34       # icon pop
PUNCH_S = 0.45     # device punch-in
PUSH_S = 0.32      # scene push
S_MAX = 1.0        # never enlarge the footage past native
PUNCH_MAX = 1.9    # ...and keep punch-ins to <=1.9x the resting device so it still reads as a device move

LAYOUTS = {
    # rest: device height on screen and its top edge; caption sits centred in the band below the device.
    "h": dict(W=1920, H=1080, device="desktop", dsf=2, rest_h=780, rest_top=64, cap_size=56, cap_max=1600,
              icon=256, name_size=76, url_size=60, tap_css=13),
    "v": dict(W=1080, H=1920, device="phone", dsf=3, rest_h=1470, rest_top=140, cap_size=66, cap_max=940,
              icon=300, name_size=86, url_size=68, tap_css=19),
}


def ease_out(u):
    u = min(max(u, 0.0), 1.0)
    return 1 - (1 - u) ** 5


def ease_in(u):
    u = min(max(u, 0.0), 1.0)
    return u ** 3


def ease_io(u):
    u = min(max(u, 0.0), 1.0)
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2


def ease_back(u, k=1.9):
    u = min(max(u, 0.0), 1.0) - 1
    return 1 + (k + 1) * u ** 3 + k * u ** 2


# ---------------------------------------------------------------- text
def text_layer(text, size, color, font_path, tracking_em=-0.02, max_w=None):
    font = ImageFont.truetype(font_path, size)
    tr = size * tracking_em

    def width(s):
        return font.getlength(s) + max(0, len(s) - 1) * tr

    lines = [text]
    if max_w and width(text) > max_w:
        # Balanced two-line break (no orphans).
        words = text.split(" ")
        splits = [(" ".join(words[:i]), " ".join(words[i:])) for i in range(1, len(words))]
        lines = list(min(splits, key=lambda ab: max(width(ab[0]), width(ab[1]))))
    asc, desc = font.getmetrics()
    lh = int((asc + desc) * 1.08)
    lw = int(max(width(l) for l in lines)) + 8
    img = Image.new("RGBA", (lw, lh * len(lines) + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        x = (lw - width(l)) / 2
        for j, ch in enumerate(l):
            d.text((x + font.getlength(l[:j]) + j * tr, i * lh), ch, font=font, fill=color + (255,))
    return np.array(img)


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
    """Mask reveal inside the text's own box: slides up in, slides down out. Nothing fades."""
    h = layer.shape[0]
    dy = int(round((1 - ease_out(u_in)) * h + ease_in(u_out) * h))
    if 0 <= dy < h:
        paste_rgba(dst, layer[:h - dy], x, y + dy)


def load_icon(name):
    return np.array(Image.open(os.path.join(ICONS, name)).convert("RGBA"))


def pop(dst, icon, cx, cy, size, u):
    """Icon pops in by scale (with a little overshoot), centred on (cx, cy)."""
    k = ease_back(u)
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
        s0 = L["rest_h"] / (y1 - y0)
        self.rest = (s0, (x0 + x1) / 2, y0 - (L["rest_top"] - L["H"] / 2) / s0)

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
        font = ImageFont.truetype(SEMIBOLD, 52 * ss)
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
    def target(self, box, frac=0.84, s_min=None):
        """Camera that frames a bezel-space box (x, y, w, h) at up to `frac` of the frame."""
        x, y, w, h = box
        L = self.L
        s = min(S_MAX, self.rest[0] * PUNCH_MAX, L["W"] * frac / w, L["H"] * frac / h)
        s = max(s, s_min if s_min is not None else self.rest[0])
        return (s, x + w / 2, y + h / 2)

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
        p = self._place(self.shadow, self.shadow_off[0], self.shadow_off[1], cam, self.shadow_q, cv2.INTER_LINEAR)
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
        return (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)


def lerp_cam(a, b, u):
    s = math.exp(math.log(a[0]) * (1 - u) + math.log(b[0]) * u)
    return (s, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)


def cam_at(shot, tau):
    cam = shot["cam"]
    for (t0, target) in shot.get("moves", []):
        if tau <= t0:
            break
        cam = lerp_cam(cam, target, ease_io((tau - t0) / PUNCH_S))
    return cam


def draw_tap(f, dev, cam, pt, age):
    """Apple-style tap indicator: a gray dot that presses in, holds, then lifts."""
    if not (-0.04 <= age <= 0.5):
        return
    L = dev.L
    px, py = dev.to_out(cam, pt[0] + dev.screen[0], pt[1] + dev.screen[1])
    r = L["tap_css"] * L["dsf"] * cam[0] * (1.35 - 0.35 * ease_out(age / 0.12))
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
def plan(L, dev, B):
    """Scenes on the beat grid: (start_beat, end_beat, scene). Captions sit under the device at rest and slide
    out as the camera punches in, so a zoomed device never has text over it."""
    k = L["dsf"]
    home, d, fz = Take(L, "desktop"), Take(L, "dictionary"), Take(L, "fitness")
    for t in (home, d, fz):
        assert t.size == dev.screen[2:], f"{t.dir}: capture {t.size} != bezel screen {dev.screen[2:]} – re-shoot"
    rest = dev.rest
    cb = lambda box: dev.from_capture(box)  # noqa: E731

    def shot(take, at, src, rate=1.0, cam=rest, moves=()):
        return {"take": take, "at": at, "src": src, "rate": rate, "cam": cam, "moves": list(moves)}

    cards = d.box("hanzi-start")
    hanzi_cam = dev.target(cb(cards), 0.8)
    # The notes grow downward (and scroll up once they reach the window's bottom): frame the final box within the window.
    ai, win = d.box("ai-end"), d.box("en")
    ai_y0, ai_y1 = max(ai[1], win[1] + 40 * k), min(ai[1] + ai[3], win[1] + win[3] - 8 * k)
    ai_cam = dev.target(cb((ai[0], ai_y0, ai[2], ai_y1 - ai_y0)), 0.9)
    rv, sd, sr = fz.box("food-review"), fz.box("split-done"), fz.box("split-ready")
    review_cam = dev.target(cb((rv[0], rv[1], rv[2], sd[1] + sd[3] + 40 * k - rv[1])), 0.9)
    split_box = union(sr, sd)
    split_cam = dev.target(cb((rv[0], split_box[1] - 30 * k, rv[2], split_box[3] + 60 * k)), 0.8)
    body = fz.box("body")
    chart_cam = dev.target(cb((body[0], body[1], body[2], min(body[3], 200 * k))), 0.86)

    meal_src = fz.t("tap:describe", -0.35)
    ai_src = d.t("tap:explain", -0.45)
    split_src = fz.t("tap:split", -1.25)
    split_rate = (fz.t("tap:half", 0.55) - split_src) / (6 * B)
    D = lambda caption, shots, cap_out=None, **kw: dict(kind="device", caption=caption, cap_out=cap_out, shots=shots, **kw)  # noqa: E731
    return [
        (0, 7, D("Two new apps for ryOS.", [shot(home, 0, home.t("start", 0.6))], cap_in=1, cap_out=5)),
        (7, 11, dict(kind="icon", icon="macosx/dictionary.png", name="Dictionary")),
        (11, 17, D("Look up any word, in any language.", [
            shot(d, 0, d.t("en", 0.1)), shot(d, 2 * B, d.t("ja", -0.05)), shot(d, 4 * B, d.t("ko", -0.05))])),
        (17, 25, D("Watch every stroke.", [
            shot(d, 0, d.t("tap:hanzi1", -0.3), moves=[(2 * B, hanzi_cam)])], cap_out=2)),
        (25, 33, D("Ask AI how a word is used.", [
            shot(d, 0, ai_src, (d.t("ai-end", 0.25) - ai_src) / (8 * B), moves=[(2 * B, ai_cam)])], cap_out=2)),
        (33, 37, dict(kind="icon", icon="macosx/fitness.png", name="Fitness", enter="push")),
        (37, 45, D("Log a meal with AI.", [
            shot(fz, 0, meal_src, (fz.t("tap:estimate", 0.45) - meal_src) / (4 * B)),
            shot(fz, 4 * B, fz.t("food-review", -0.25), moves=[(0, review_cam)])], cap_out=4)),
        (45, 51, D("Split it ÷2.", [
            shot(fz, 0, split_src, split_rate, moves=[(1.5 * B, split_cam)])], cap_out=1.5)),
        (51, 56, D("See your progress.", [
            shot(fz, 0, fz.t("body", 0.1), moves=[(2 * B, chart_cam)])], cap_out=2)),
        (56, None, dict(kind="end", icon="mac-512.png", url="os.ryo.lu", enter="push")),
    ]


def caption_pos(L, dev, layer):
    """Centred in the band between the resting device and the bottom of the frame."""
    bottom = dev.to_out(dev.rest, 0, dev.bbox[3])[1]
    return (L["W"] - layer.shape[1]) // 2, int(round((bottom + L["H"]) / 2 - layer.shape[0] / 2))


def blank(L):
    f = np.empty((L["H"], L["W"], 3), np.uint8)
    f[:] = BG[::-1]
    return f


def render_icon(L, sc, B, n):
    """App intro: the theme icon pops in, its name slides up under it."""
    icon = load_icon(sc["icon"])
    name = text_layer(sc["name"], L["name_size"], INK, BOLD, -0.025)
    size = L["icon"]
    gap = int(size * 0.16)
    top = (L["H"] - (size + gap + name.shape[0])) // 2
    base = blank(L)
    t_icon = PUSH_S if sc.get("enter") == "push" else 0.0
    for i in range(n):
        tau = i / FPS
        f = base.copy()
        pop(f, icon, L["W"] / 2, top + size / 2, size, (tau - t_icon) / POP_S)
        u = (tau - t_icon - 0.5 * B) / REVEAL_S
        if u > 0:
            reveal(f, name, (L["W"] - name.shape[1]) // 2, top + size + gap, u)
        yield f


def render_end(L, sc, B, n):
    icon = load_icon(sc["icon"])
    url = text_layer(sc["url"], L["url_size"], INK, SEMIBOLD, -0.015)
    size = int(L["icon"] * 1.15)
    gap = int(size * 0.14)
    top = (L["H"] - (size + gap + url.shape[0])) // 2
    base = blank(L)
    for i in range(n):
        tau = i / FPS
        f = base.copy()
        pop(f, icon, L["W"] / 2, top + size / 2, size, (tau - PUSH_S) / POP_S)
        u = (tau - PUSH_S - B) / REVEAL_S
        if u > 0:
            reveal(f, url, (L["W"] - url.shape[1]) // 2, top + size + gap, u)
        yield f


def render_device(L, dev, sc, B, n):
    cap = text_layer(sc["caption"], L["cap_size"], INK, SEMIBOLD, -0.015, max_w=L["cap_max"])
    cx, cy = caption_pos(L, dev, cap)
    t_in = sc.get("cap_in", 0) * B
    t_out = sc["cap_out"] * B if sc.get("cap_out") is not None else None
    shots = sc["shots"]
    bounds = [round(s["at"] * FPS) for s in shots] + [n]
    for k, s in enumerate(shots):
        count = bounds[k + 1] - bounds[k]
        taps = [(mk["t"], (mk["box"]["x"] + mk["box"]["width"] / 2) * L["dsf"], (mk["box"]["y"] + mk["box"]["height"] / 2) * L["dsf"])
                for mk in s["take"].taps]
        for j, fr in enumerate(s["take"].frames(s["src"], s["rate"], count)):
            tau_shot = j / FPS
            tau = bounds[k] / FPS + tau_shot
            cam = cam_at(s, tau_shot)
            f = dev.render(fr, cam)
            src_t = s["src"] + tau_shot * s["rate"]
            for (tt, px, py) in taps:
                draw_tap(f, dev, cam, (px, py), (src_t - tt) / s["rate"])
            u_out = (tau - t_out) / REVEAL_S if t_out is not None else 0.0
            if tau >= t_in and u_out < 1:
                reveal(f, cap, cx, cy, (tau - t_in) / REVEAL_S, max(0.0, u_out))
            yield f


def push(prev, cur, u):
    W = cur.shape[1]
    x = int(round(ease_io(u) * W))
    out = np.empty_like(cur)
    out[:, :W - x] = prev[:, x:]
    out[:, W - x:] = cur[:, :x]
    return out


# ---------------------------------------------------------------- audio
def build_audio(music, start, out_wav):
    fade = 1.6
    chain = f"afade=t=in:d=0.02,afade=t=out:st={DURATION - fade:.2f}:d={fade}"
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{start}", "-t", f"{DURATION}", "-i", music,
                            "-af", chain + ",loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True).stderr
    st = json.loads(probe[probe.rindex("{"):probe.rindex("}") + 1])
    norm = (f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={st['input_i']}:measured_TP={st['input_tp']}:"
            f"measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start}", "-t", f"{DURATION}", "-i", music,
                    "-af", f"{chain},{norm},aresample=48000", "-ac", "2", out_wav], check=True)


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
    scenes = plan(L, dev, B)
    written, prev = 0, None
    for b0, b1, sc in scenes:
        f0 = round(b0 * B * FPS)
        f1 = total if b1 is None else round(b1 * B * FPS)
        n = f1 - f0
        kind = sc["kind"]
        gen = (render_icon(L, sc, B, n) if kind == "icon" else render_end(L, sc, B, n) if kind == "end"
               else render_device(L, dev, sc, B, n))
        hold = prev
        push_n = round(PUSH_S * FPS) if sc.get("enter") == "push" and hold is not None else 0
        print(f"[{f0 / FPS:6.2f}s] beat {b0:>2} {kind:6s} {sc.get('caption') or sc.get('name') or sc.get('url')}", flush=True)
        for i, f in enumerate(gen):
            prev = f
            if i < push_n:
                f = push(hold, f, (i + 1) / push_n)
            enc.stdin.write(f.tobytes())
            written += 1
    enc.stdin.close()
    enc.wait()
    if music:
        with tempfile.TemporaryDirectory() as td:
            wav = os.path.join(td, "music.wav")
            build_audio(music, music_start, wav)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp_video, "-i", wav, "-map", "0:v", "-map", "1:a",
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out],
                           check=True)
        os.remove(tmp_video)
    else:
        os.replace(tmp_video, out)
    print(f"[done] {out} {written} frames = {written / FPS:.2f}s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--vertical", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--music", default=os.environ.get("PROMO_MUSIC"))
    ap.add_argument("--music-start", type=float, default=float(os.environ.get("PROMO_MUSIC_START", "110.705")))
    ap.add_argument("--bpm", type=float, default=float(os.environ.get("PROMO_BPM", "126.35")))
    args = ap.parse_args()
    L = LAYOUTS["v" if args.vertical else "h"]
    out = args.out or os.path.join(ROOT, "out", f"ryos-dictionary-fitness-30s-v2{'-vertical' if args.vertical else ''}.mp4")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    compose(L, 60.0 / args.bpm, out, args.music, args.music_start)
