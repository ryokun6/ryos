#!/usr/bin/env python3
"""
Compose the Dictionary + Fitness promo from real ryOS captures.

  python3 scripts/promo/build.py [--vertical] [--out path.mp4]

Inputs: $PROMO_WORK_DIR/rec/{dictionary,fitness}/capture.mkv + marks.json (from shoot.ts);
PROMO_WORK_DIR defaults to tmp/promo at the repo root. Needs numpy, Pillow, opencv-python-headless.
Ken Burns rects are in capture pixels (2880x1620, 2x of a 1440x810 CSS viewport).
"""
import argparse
import json
import math
import os
import subprocess
from collections import deque

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.environ.get("PROMO_WORK_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tmp", "promo")
REC = os.path.join(ROOT, "rec")
FPS = 30
SRC_W, SRC_H = 2880, 1620
FONT_DIR = "/usr/share/fonts/truetype/macos"
BOLD = os.path.join(FONT_DIR, "Inter-Bold.ttf")
REGULAR = os.path.join(FONT_DIR, "Inter-Regular.ttf")
SEMIBOLD = os.path.join(FONT_DIR, "Inter-SemiBold.ttf")

INK = {"white": ((255, 255, 255), (29, 29, 31)), "black": ((0, 0, 0), (245, 245, 247))}
SUBTLE = {"white": (110, 110, 115), "black": (134, 134, 139)}

XF_CARD = 0.4   # card <-> clip dissolve
XF_CUT = 0.3    # clip <-> clip dissolve


def load_marks(session):
    m = json.load(open(os.path.join(REC, session, "marks.json")))
    return {mk["name"]: mk for mk in m["marks"]}


MARKS = {s: load_marks(s) for s in ("dictionary", "fitness")}


def t(session, name, off=0.0):
    return MARKS[session][name]["t"] + off


def R(cx, cy, w):
    """16:9 rect centered at (cx, cy) with width w, clamped inside the capture."""
    w = min(w, SRC_W)
    h = w * 9 / 16
    x = min(max(cx - w / 2, 0), SRC_W - w)
    y = min(max(cy - h / 2, 0), SRC_H - h)
    return (x, y, w, h)


FULL = R(1440, 810, 2880)


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def ease_io(u):
    u = min(max(u, 0.0), 1.0)
    return 0.5 - 0.5 * math.cos(math.pi * u)


# ---------------------------------------------------------------- timeline
def card(text, bg="white", dur=1.6, sub=None, size=118, xf=XF_CARD):
    return {"kind": "card", "text": text, "bg": bg, "dur": dur, "sub": sub, "size": size, "xf": xf}


def clip(session, a, b, r0, r1, speed=1.0, caption=None, xf=XF_CARD, curve=ease_io):
    return {"kind": "clip", "session": session, "a": a, "b": b, "r0": r0, "r1": r1,
            "speed": speed, "caption": caption, "xf": xf, "curve": curve,
            "dur": (b - a) / speed}


D, F = "dictionary", "fitness"
WIN_D = R(1440, 763, 2500)
WIN_F = R(1440, 700, 2500)

TIMELINE = [
    card("ryOS", "black", 2.0, size=170),
    card("two new apps.", "black", 1.8),
    card("meet dictionary.", "white", 1.6),
    clip(D, t(D, "en-start", 0.15), t(D, "en-end", 0.4), WIN_D, R(1250, 560, 1820), 1.1,
         caption="meet dictionary."),
    card("every language. instantly.", "white", 1.5, size=104),
    clip(D, t(D, "ja-start", 0.1), t(D, "ja-end"), R(1440, 763, 2350), R(1230, 600, 1950), 1.25,
         caption="every language. instantly.", xf=XF_CUT),
    clip(D, t(D, "ko-start", 0.1), t(D, "ko-end"), R(1230, 600, 1950), R(1360, 700, 2250), 1.25,
         caption="every language. instantly.", xf=XF_CUT),
    clip(D, t(D, "zh-start", 0.1), t(D, "zh-result", 0.6), R(1360, 700, 2250), R(1230, 640, 1900), 1.15,
         caption="every language. instantly."),
    card("watch every stroke.", "white", 1.4),
    # Starts after the browser pinch settles (Chrome shows blank tiles while re-rasterizing).
    clip(D, t(D, "hanzi-start", -0.1), t(D, "pinch-out", 0.0), R(1330, 1080, 2560), R(1320, 1120, 2200), 1.15,
         caption="watch every stroke."),
    card("ask ai – in real time.", "white", 1.5),
    clip(D, t(D, "ai-click", -0.5), t(D, "ai-end", 0.2), R(1440, 860, 2300), "ai", 1.15,
         caption="ask ai – in real time."),
    card("or just write it.", "white", 1.3),
    clip(D, t(D, "hw-start", -0.2), t(D, "hw-drawn", 0.1), R(1440, 1150, 2350), R(1250, 1250, 1900), 3.2,
         caption="or just write it.", xf=XF_CUT),
    clip(D, t(D, "hw-drawn", 0.1), t(D, "hw-end", 0.5), R(1250, 1250, 1900), R(1440, 900, 2500), 1.2,
         caption="or just write it."),
    card("meet fitness.", "white", 1.6),
    clip(F, t(F, "ex-start", 0.1), t(F, "ex-end"), WIN_F, R(1440, 560, 2000), 1.2, caption="meet fitness."),
    card("in your language.", "white", 1.3),
    clip(F, t(F, "lang-start", -0.2), t(F, "lang-end"), R(1440, 560, 2000), R(1440, 520, 1800), 1.35,
         caption="in your language."),
    card("log a meal. split it.", "white", 1.5),
    clip(F, t(F, "food-start", 0.1), t(F, "food-analyze", 0.9), R(1440, 640, 2050), R(1440, 520, 1700), 1.35,
         caption="log a meal. split it.", xf=XF_CUT),
    clip(F, t(F, "food-review", -0.6), t(F, "split-done", 2.0), R(1440, 600, 1700), R(1440, 620, 1520), 1.2,
         caption="log a meal. split it.", xf=XF_CUT),
    clip(F, t(F, "food-end", -1.9), t(F, "food-end", 0.0), R(1440, 620, 1520), R(1700, 640, 2000), 1.0,
         caption="log a meal. split it."),
    card("see the trend.", "white", 1.3),
    clip(F, t(F, "body-start", 0.3), t(F, "body-end", 0.2), R(1440, 470, 1750), R(1440, 400, 1480), 1.0,
         caption="see the trend."),
    card("ryOS", "black", 3.2, sub="os.ryo.lu", size=170),
]


def resolve_named_rects():
    ai = MARKS[D]["ai-end"].get("box")
    for seg in TIMELINE:
        if seg.get("r1") == "ai":
            if ai:
                cx = (ai["x"] + ai["width"] / 2) * 2
                cy = (ai["y"] + ai["height"] / 2) * 2
                w = max(ai["width"] * 2 + 160, (ai["height"] * 2 + 140) * 16 / 9)
                seg["r1"] = R(cx, cy, w)
            else:
                seg["r1"] = R(1440, 900, 2000)


# ---------------------------------------------------------------- text
def tracked(draw, xy, text, font, fill, tracking):
    x0, y0 = xy
    for i, ch in enumerate(text):
        x = x0 + font.getlength(text[:i]) + i * tracking
        draw.text((x, y0), ch, font=font, fill=fill)


def text_width(text, font, tracking):
    return font.getlength(text) + max(0, len(text) - 1) * tracking


def text_layer(text, size, color, W, font_path=BOLD, tracking_em=-0.025, max_w=None):
    """RGBA layer (cropped) with optional wrapping to max_w."""
    font = ImageFont.truetype(font_path, size)
    tr = size * tracking_em
    lines = [text]
    if max_w and text_width(text, font, tr) > max_w:
        words, lines, cur = text.split(" "), [], ""
        for w in words:
            cand = (cur + " " + w).strip()
            if text_width(cand, font, tr) <= max_w or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    asc, desc = font.getmetrics()
    lh = int((asc + desc) * 1.05)
    lw = int(max(text_width(l, font, tr) for l in lines)) + 8
    img = Image.new("RGBA", (lw, lh * len(lines) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        x = (lw - text_width(l, font, tr)) / 2
        tracked(d, (x, i * lh), l, font, color + (255,), tr)
    return np.array(img)


def paste_rgba(dst, layer, x, y, alpha=1.0):
    h, w = layer.shape[:2]
    H, W = dst.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    sub = layer[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
    a = (sub[..., 3:4] / 255.0) * alpha
    rgb = sub[..., [2, 1, 0]]  # RGBA -> BGR
    roi = dst[y0:y1, x0:x1].astype(np.float32)
    dst[y0:y1, x0:x1] = (roi * (1 - a) + rgb * a).astype(np.uint8)


_layer_cache = {}


def cached_layer(key, fn):
    if key not in _layer_cache:
        _layer_cache[key] = fn()
    return _layer_cache[key]


def render_card(seg, W, H):
    bg, fg = INK[seg["bg"]]
    scale = W / 1920 if W > H else 1080 / 1920 * 1.55
    size = int(seg["size"] * scale)
    main = cached_layer(("main", seg["text"], size, fg, W),
                        lambda: text_layer(seg["text"], size, fg, W, max_w=W * 0.86))
    sub = None
    if seg["sub"]:
        ssize = int(46 * scale)
        sub = cached_layer(("sub", seg["sub"], ssize, W),
                           lambda: text_layer(seg["sub"], ssize, SUBTLE[seg["bg"]], W, REGULAR, 0.0))
    base = np.zeros((H, W, 3), np.uint8)
    base[:] = bg[::-1]
    n = int(round(seg["dur"] * FPS))
    gap = int(28 * scale)
    total_h = main.shape[0] + (gap + sub.shape[0] if sub is not None else 0)
    for i in range(n):
        tt = i / FPS
        u = ease(tt / 0.55)
        f = base.copy()
        y = int((H - total_h) / 2 + (1 - u) * 22 * scale)
        paste_rgba(f, main, (W - main.shape[1]) // 2, y, u)
        if sub is not None:
            u2 = ease((tt - 0.35) / 0.6)
            paste_rgba(f, sub, (W - sub.shape[1]) // 2, y + main.shape[0] + gap + int((1 - u2) * 14 * scale), u2)
        yield f


# ---------------------------------------------------------------- footage
def decode(session, a, b, speed):
    path = os.path.join(REC, session, "capture.mkv")
    n = int(round((b - a) / speed * FPS))
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{a:.3f}", "-i", path, "-t", f"{b - a:.3f}",
           "-vf", f"setpts=(PTS-STARTPTS)/{speed},fps={FPS}", "-frames:v", str(n), "-pix_fmt", "bgr24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=SRC_W * SRC_H * 3 * 2)
    size = SRC_W * SRC_H * 3
    last = None
    for _ in range(n):
        buf = p.stdout.read(size)
        if len(buf) == size:
            last = np.frombuffer(buf, np.uint8).reshape(SRC_H, SRC_W, 3)
        if last is None:
            continue
        yield last
    p.stdout.close()
    p.wait()


def crop_to(frame, rect, W, H):
    x, y, w, h = rect
    s = w / W
    src = frame
    if s > 1.15:
        k = s * 0.45
        src = cv2.GaussianBlur(frame, (0, 0), sigmaX=k, sigmaY=k)
    M = np.array([[1 / s, 0, -x / s], [0, 1 / s, -y / s]], np.float32)
    return cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def lerp_rect(r0, r1, u):
    # Interpolate zoom in log space so motion feels constant.
    w = math.exp(math.log(r0[2]) * (1 - u) + math.log(r1[2]) * u)
    cx = (r0[0] + r0[2] / 2) * (1 - u) + (r1[0] + r1[2] / 2) * u
    cy = (r0[1] + r0[3] / 2) * (1 - u) + (r1[1] + r1[3] / 2) * u
    return R(cx, cy, w)


def render_clip(seg, W, H, vertical):
    n = int(round(seg["dur"] * FPS))
    if vertical:
        bw, bh = 1080, 608
        cap = None
        if seg["caption"]:
            cap = cached_layer(("cap", seg["caption"]),
                               lambda: text_layer(seg["caption"], 76, (245, 245, 247), 1080, max_w=960))
        base = np.zeros((H, W, 3), np.uint8)
        band_y = (H - bh) // 2 + 120
    for i, fr in enumerate(decode(seg["session"], seg["a"], seg["b"], seg["speed"])):
        u = seg["curve"](i / max(1, n - 1))
        rect = lerp_rect(seg["r0"], seg["r1"], u)
        if not vertical:
            yield crop_to(fr, rect, W, H)
        else:
            f = base.copy()
            f[band_y:band_y + bh] = crop_to(fr, rect, bw, bh)
            if cap is not None:
                paste_rgba(f, cap, (W - cap.shape[1]) // 2, band_y - 90 - cap.shape[0])
            yield f


# ---------------------------------------------------------------- compose
def blend(a, b, u):
    return cv2.addWeighted(a, 1 - u, b, u, 0)


def compose(W, H, vertical, out):
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", str(FPS), out],
        stdin=subprocess.PIPE)
    written = 0
    tail = []
    log = []
    clock = 0.0
    for idx, seg in enumerate(TIMELINE):
        gen = render_card(seg, W, H) if seg["kind"] == "card" else render_clip(seg, W, H, vertical)
        xin = len(tail)
        nxt = TIMELINE[idx + 1] if idx + 1 < len(TIMELINE) else None
        xout = int(round(min(seg["xf"], nxt["xf"] if nxt else 0) * FPS)) if nxt else 0
        if nxt and (seg["kind"] == "card" or nxt["kind"] == "card"):
            xout = int(round(XF_CARD * FPS))
        start_written = written
        for i in range(xin):
            f = next(gen)
            enc.stdin.write(blend(tail[i], f, (i + 1) / (xin + 1)).tobytes())
            written += 1
        dq = deque()
        for f in gen:
            dq.append(f)
            if len(dq) > xout:
                enc.stdin.write(dq.popleft().tobytes())
                written += 1
        tail = list(dq)
        label = seg["text"] if seg["kind"] == "card" else f'{seg["session"]} {seg["a"]:.2f}-{seg["b"]:.2f}s x{seg["speed"]}'
        log.append((start_written / FPS - (xin / FPS), seg["kind"], label))
        print(f"[{start_written / FPS:6.2f}s] {seg['kind']:4s} {label}", flush=True)
    for f in tail:
        enc.stdin.write(f.tobytes())
        written += 1
    enc.stdin.close()
    enc.wait()
    print(f"[done] {out} {written} frames = {written / FPS:.2f}s")
    return log


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--vertical", action="store_true")
    ap.add_argument("--out")
    args = ap.parse_args()
    resolve_named_rects()
    W, H = (1080, 1920) if args.vertical else (1920, 1080)
    out = args.out or os.path.join(ROOT, "out", "ryos-dictionary-fitness-vertical.mp4" if args.vertical else "ryos-dictionary-fitness.mp4")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    compose(W, H, args.vertical, out)
