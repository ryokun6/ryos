#!/usr/bin/env python3
"""
Compose the 30 s Dictionary + Fitness promo from real ryOS captures.

  python3 scripts/promo/build.py [--vertical] [--out path.mp4] [--music track.mp3]
                                 [--music-start 110.705] [--bpm 126.35]

Horizontal = desktop takes in a drawn laptop frame; --vertical = phone takes in a drawn phone frame.
Inputs: $PROMO_WORK_DIR/rec/{desktop,phone}-{dictionary,fitness}/ (capture.mkv + marks.json from shoot.ts);
PROMO_WORK_DIR defaults to tmp/promo at the repo root.

Music: --music or $PROMO_MUSIC (never committed). Every cut and text hit is placed on the track's beat
grid: --music-start ($PROMO_MUSIC_START) is the downbeat the excerpt starts on and --bpm ($PROMO_BPM) its
tempo – find both with music.py. The excerpt is faded out over the end card, normalized to -14 LUFS and
muxed as AAC 192k. Without music the video is silent on the same grid.

Needs numpy, Pillow, opencv-python-headless (and ffmpeg on PATH).
"""
import argparse
import json
import math
import os
import subprocess
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.environ.get("PROMO_WORK_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tmp", "promo")
REC = os.path.join(ROOT, "rec")
FPS = 30
DURATION = 30.0
FONT_DIR = os.environ.get("PROMO_FONT_DIR", "/usr/share/fonts/truetype/macos")
BOLD = os.path.join(FONT_DIR, "Inter-Bold.ttf")
SEMIBOLD = os.path.join(FONT_DIR, "Inter-SemiBold.ttf")
MEDIUM = os.path.join(FONT_DIR, "Inter-Medium.ttf")

BG = (245, 245, 247)
INK = (29, 29, 31)
SUBTLE = (110, 110, 115)
REVEAL_S = 0.3     # caption slide-up reveal
PUNCH_S = 0.42     # in-screen punch-in
PUSH_S = 0.32      # scene push

LAYOUTS = {
    "h": dict(W=1920, H=1080, device="desktop", src=(2880, 1620), dsf=2, screen=(280, 196, 1360, 765),
              cap_y=96, cap_size=60, cap_max=1600, title_size=240, sub_size=66, tap_r=24),
    "v": dict(W=1080, H=1920, device="phone", src=(1170, 2532), dsf=3, screen=(208, 384, 664, 1437),
              cap_y=200, cap_size=74, cap_max=900, title_size=230, sub_size=70, tap_r=40),
}


def ease_out(u):
    u = min(max(u, 0.0), 1.0)
    return 1 - (1 - u) ** 5


def ease_io(u):
    u = min(max(u, 0.0), 1.0)
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2


# ---------------------------------------------------------------- drawing
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


def paste_rgba(dst, layer, x, y, alpha=1.0):
    h, w = layer.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    sub = layer[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
    a = sub[..., 3:4] / 255.0 * alpha
    roi = dst[y0:y1, x0:x1].astype(np.float32)
    dst[y0:y1, x0:x1] = (roi * (1 - a) + sub[..., [2, 1, 0]] * a).astype(np.uint8)


def reveal(dst, layer, x, y, u):
    """Slide-up mask reveal: the text rises into its own box; nothing fades."""
    h = layer.shape[0]
    dy = int(round((1 - ease_out(u)) * h))
    if dy < h:
        paste_rgba(dst, layer[:h - dy], x, y + dy)


def rounded_mask(w, h, r, ss=4):
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * ss - 1, h * ss - 1), r * ss, fill=255)
    return np.array(m.resize((w, h), Image.LANCZOS), np.float32)[..., None] / 255.0


def draw_device(L):
    """Background + soft shadow + a plain drawn bezel (no product artwork)."""
    W, H = L["W"], L["H"]
    sx, sy, sw, sh = L["screen"]
    ss = 3
    img = Image.new("RGB", (W * ss, H * ss), BG)
    shadow = Image.new("L", (W * ss, H * ss), 0)
    sd = ImageDraw.Draw(shadow)
    d = ImageDraw.Draw(img)
    S = lambda *v: [int(round(a * ss)) for a in v]  # noqa: E731
    if L["device"] == "desktop":
        b, bb = 16, 14
        lid = (sx - b, sy - b, sx + sw + b, sy + sh + bb)
        deck = (lid[0] - 92, lid[3], lid[2] + 92, lid[3] + 20)
        sd.rounded_rectangle(S(lid[0] + 10, lid[1] + 40, lid[2] - 10, deck[3] + 16), 40 * ss, fill=120)
        shadow = shadow.filter(ImageFilter.GaussianBlur(34 * ss))
        img.paste((0, 0, 0), mask=shadow.point(lambda v: v * 0.55))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle(S(*lid), 30 * ss, fill=(86, 86, 92))
        d.rounded_rectangle(S(lid[0] + 2, lid[1] + 2, lid[2] - 2, lid[3]), 28 * ss, fill=(22, 22, 24))
        d.ellipse(S(W / 2 - 4, sy - b / 2 - 4, W / 2 + 4, sy - b / 2 + 4), fill=(44, 44, 48))
        dh = deck[3] - deck[1]
        for i in range(dh * ss):
            u = i / (dh * ss)
            c = tuple(int(226 - 64 * u ** 1.6) for _ in range(3))
            inset = int(max(0, (u - 0.55) / 0.45) ** 2 * 10 * ss)
            d.line([(deck[0] * ss + inset, deck[1] * ss + i), (deck[2] * ss - inset, deck[1] * ss + i)], fill=c)
        d.rounded_rectangle(S(W / 2 - 110, deck[1], W / 2 + 110, deck[1] + 7), 4 * ss, fill=(178, 178, 184))
        radius = 6
    else:
        b = 22
        body = (sx - b, sy - b, sx + sw + b, sy + sh + b)
        sd.rounded_rectangle(S(body[0] + 16, body[1] + 50, body[2] - 16, body[3] + 24), 96 * ss, fill=120)
        shadow = shadow.filter(ImageFilter.GaussianBlur(38 * ss))
        img.paste((0, 0, 0), mask=shadow.point(lambda v: v * 0.5))
        d = ImageDraw.Draw(img)
        for (x0, y0, x1, y1) in [(body[0] - 5, sy + 190, body[0] + 4, sy + 250), (body[0] - 5, sy + 300, body[0] + 4, sy + 400),
                                 (body[0] - 5, sy + 420, body[0] + 4, sy + 520), (body[2] - 4, sy + 330, body[2] + 5, sy + 490)]:
            d.rounded_rectangle(S(x0, y0, x1, y1), 4 * ss, fill=(120, 120, 126))
        d.rounded_rectangle(S(*body), 86 * ss, fill=(132, 132, 138))
        d.rounded_rectangle(S(body[0] + 4, body[1] + 4, body[2] - 4, body[3] - 4), 82 * ss, fill=(18, 18, 20))
        radius = 64
    base = np.array(img.resize((W, H), Image.LANCZOS))[..., ::-1].copy()
    return base, rounded_mask(sw, sh, radius)


# ---------------------------------------------------------------- footage
class Take:
    def __init__(self, L, session):
        self.L = L
        self.dir = os.path.join(REC, f"{L['device']}-{session}")
        m = json.load(open(os.path.join(self.dir, "marks.json")))
        self.marks = {mk["name"]: mk for mk in m["marks"]}
        self.taps = [mk for mk in m["marks"] if mk["name"].startswith("tap:")]

    def t(self, name, off=0.0):
        return self.marks[name]["t"] + off

    def box(self, name):
        b = self.marks[name]["box"]
        k = self.L["dsf"]
        return (b["x"] * k, b["y"] * k, b["width"] * k, b["height"] * k)

    def frames(self, a, rate, n):
        sw, sh = self.L["src"]
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


def cam(L, cx, cy, w):
    """Camera rect (x, y, w, h) in capture px with the screen's aspect, clamped to native resolution."""
    sw, sh = L["src"]
    w = min(max(w, L["screen"][2]), sw)
    h = w * sh / sw
    return (min(max(cx - w / 2, 0), sw - w), min(max(cy - h / 2, 0), sh - h), w, h)


def fit(L, box, pad=1.12, wmax=None):
    x, y, w, h = box
    sw, sh = L["src"]
    cw = max(w * pad, h * pad * sw / sh)
    if wmax:
        cw = min(cw, wmax)
    return cam(L, x + w / 2, y + h / 2, cw)


def lerp_cam(L, a, b, u):
    w = math.exp(math.log(a[2]) * (1 - u) + math.log(b[2]) * u)
    cx = (a[0] + a[2] / 2) * (1 - u) + (b[0] + b[2] / 2) * u
    cy = (a[1] + a[3] / 2) * (1 - u) + (b[1] + b[3] / 2) * u
    return cam(L, cx, cy, w)


def cam_at(L, shot, tau):
    rect = shot["cam"]
    for (t0, target) in shot.get("moves", []):
        if tau <= t0:
            break
        rect = lerp_cam(L, rect, target, ease_io((tau - t0) / PUNCH_S))
    return rect


def render_screen(L, frame, rect):
    x, y, w, h = (int(round(v)) for v in rect)
    _, _, sw, sh = L["screen"]
    return cv2.resize(frame[y:y + h, x:x + w], (sw, sh), interpolation=cv2.INTER_AREA)


def draw_tap(f, L, rect, pt, age):
    """Apple-style tap indicator: a gray dot that presses in, holds, then lifts."""
    if not (-0.04 <= age <= 0.5):
        return
    sx, sy, sw, _ = L["screen"]
    k = sw / rect[2]
    px, py = sx + (pt[0] - rect[0]) * k, sy + (pt[1] - rect[1]) * k
    r = L["tap_r"] * (1.35 - 0.35 * ease_out(age / 0.12))
    alpha = 0.42 * (1 - max(0.0, (age - 0.36) / 0.14))
    ov = f.copy()
    cv2.circle(ov, (int(px * 4), int(py * 4)), int(r * 4), (112, 108, 108), -1, cv2.LINE_AA, shift=2)
    cv2.addWeighted(ov, alpha, f, 1 - alpha, 0, dst=f)


# ---------------------------------------------------------------- timeline
def plan(L, B):
    """Scenes on the beat grid: (start_beat, end_beat, scene)."""
    phone = L["device"] == "phone"
    d, fz = Take(L, "dictionary"), Take(L, "fitness")
    full = cam(L, L["src"][0] / 2, L["src"][1] / 2, L["src"][0])
    win_d = full if phone else fit(L, d.box("en"), 1.04)
    win_f = full if phone else fit(L, fz.box("body-end"), 1.02)

    def narrow(box, wcss):
        x, y, w, h = box
        return (x, y, min(w, wcss * L["dsf"]), h)

    def top(box, hcss):
        x, y, w, h = box
        return (x, y, w, min(h, hcss * L["dsf"]))

    def shot(take, at, src, rate=1.0, rect=None, moves=()):
        return {"take": take, "at": at, "src": src, "rate": rate, "cam": rect, "moves": list(moves)}

    k = L["dsf"]
    cards = d.box("hanzi-start")
    ai = d.box("ai-end")
    rv, sd = fz.box("food-review"), fz.box("split-done")
    review = fit(L, (rv[0], rv[1], rv[2], sd[1] + sd[3] + 40 * k - rv[1]), 1.1)
    chart = fit(L, top(fz.box("body"), 200), 1.12)
    fs = fz.box("food-start")
    if phone:
        result = win_d
        meal = cam(L, L["src"][0] / 2, fs[1] + fs[3] / 2, L["src"][0] * 0.8)
        cards_cam = fit(L, narrow(cards, 230), 1.12)
        ai_cam = cam(L, ai[0] + ai[2] / 2, 480 * k, ai[2] * 1.05)
    else:
        result = cam(L, cards[0] + cards[2] / 2, 330 * k, 900 * k)
        meal = fit(L, fs, 1.3)
        # Both glyph squares sit in the left ~640 px of the side-by-side cards.
        cards_cam = fit(L, narrow(cards, cards[2] / k / 2 + 200), 1.08)
        # Streaming notes grow upward from the bottom of the scroll view, so frame that edge.
        ai_cam = cam(L, ai[0] + ai[2] / 2, ai[1] + ai[3] + 10 * k - 255 * k, ai[2] * 1.05)
    ai_src = d.t("tap:explain", -0.55)
    meal_src = fz.t("tap:describe", -0.35)
    split_src = fz.t("tap:split", -0.55)
    title = lambda text, beat, size, color, font: dict(text=text, beat=beat, size=size, color=color, font=font)  # noqa: E731

    return [
        (0, 4, {"kind": "title", "lines": [title("ryOS", 0, L["title_size"], INK, BOLD),
                                            title("Two new apps.", 2, L["sub_size"], SUBTLE, SEMIBOLD)]}),
        (4, 10, {"kind": "device", "caption": "Look up any word, in any language.", "shots": [
            shot(d, 0, d.t("en", 0.1), rect=result),
            shot(d, 2 * B, d.t("ja", -0.05), rect=result),
            shot(d, 4 * B, d.t("ko", -0.05), rect=result)]}),
        (10, 20, {"kind": "device", "caption": "Watch every stroke.", "shots": [
            shot(d, 0, d.t("hanzi-start", -0.15), rect=win_d, moves=[(B, cards_cam)])]}),
        (20, 32, {"kind": "device", "caption": "Ask AI how a word is used.", "shots": [
            shot(d, 0, ai_src, (d.t("ai-end", 0.25) - ai_src) / (12 * B), rect=win_d, moves=[(2 * B, ai_cam)])]}),
        (32, 42, {"kind": "device", "caption": "Log a meal with AI.", "enter": "push", "shots": [
            shot(fz, 0, meal_src, (fz.t("tap:estimate", 0.55) - meal_src) / (6 * B), rect=meal),
            shot(fz, 6 * B, fz.t("food-review", -0.2), rect=review)]}),
        (42, 50, {"kind": "device", "caption": "Split it ÷2.", "shots": [
            shot(fz, 0, split_src, rect=review)]}),
        (50, 56, {"kind": "device", "caption": "See your progress.", "shots": [
            shot(fz, 0, fz.t("body", 0.1), rect=win_f, moves=[(B, chart)])]}),
        (56, None, {"kind": "title", "enter": "push", "lines": [title("ryOS", 0, L["title_size"], INK, BOLD),
                                                                title("os.ryo.lu", 2, L["sub_size"], SUBTLE, SEMIBOLD)]}),
    ]


def render_title(L, sc, B, n):
    W, H = L["W"], L["H"]
    layers = [text_layer(ln["text"], ln["size"], ln["color"], ln["font"], -0.035 if ln["size"] > 120 else -0.015)
              for ln in sc["lines"]]
    gap = int(L["sub_size"] * 0.15)
    total = sum(l.shape[0] for l in layers) + gap * (len(layers) - 1)
    y = (H - total) // 2
    ys = []
    for l in layers:
        ys.append(y)
        y += l.shape[0] + gap
    base = np.empty((H, W, 3), np.uint8)
    base[:] = BG[::-1]
    for i in range(n):
        tau = i / FPS
        f = base.copy()
        for ln, layer, ly in zip(sc["lines"], layers, ys):
            u = (tau - ln["beat"] * B) / REVEAL_S
            if u >= 0:
                reveal(f, layer, (W - layer.shape[1]) // 2, ly, u)
        yield f


def render_device(L, sc, B, n, chrome):
    base, mask = chrome
    sx, sy, sw, sh = L["screen"]
    cap = text_layer(sc["caption"], L["cap_size"], INK, SEMIBOLD, -0.015, max_w=L["cap_max"])
    cx, cy = (L["W"] - cap.shape[1]) // 2, L["cap_y"] - cap.shape[0] // 2
    shots = sc["shots"]
    bounds = [round(s["at"] * FPS) for s in shots] + [n]
    for k, s in enumerate(shots):
        count = bounds[k + 1] - bounds[k]
        taps = [(mk["t"], (mk["box"]["x"] + mk["box"]["width"] / 2) * L["dsf"], (mk["box"]["y"] + mk["box"]["height"] / 2) * L["dsf"])
                for mk in s["take"].taps]
        for j, fr in enumerate(s["take"].frames(s["src"], s["rate"], count)):
            tau_shot = j / FPS
            tau = bounds[k] / FPS + tau_shot
            rect = cam_at(L, s, tau_shot)
            f = base.copy()
            if fr is not None:
                roi = f[sy:sy + sh, sx:sx + sw].astype(np.float32)
                f[sy:sy + sh, sx:sx + sw] = (render_screen(L, fr, rect) * mask + roi * (1 - mask)).astype(np.uint8)
            src_t = s["src"] + tau_shot * s["rate"]
            for (tt, px, py) in taps:
                draw_tap(f, L, rect, (px, py), (src_t - tt) / s["rate"])
            reveal(f, cap, cx, cy, tau / REVEAL_S)
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
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", os.environ.get("PROMO_CRF", "20"),
         "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp_video],
        stdin=subprocess.PIPE)
    chrome = draw_device(L)
    scenes = plan(L, B)
    written, prev = 0, None
    for b0, b1, sc in scenes:
        f0 = round(b0 * B * FPS)
        f1 = total if b1 is None else round(b1 * B * FPS)
        n = f1 - f0
        gen = render_title(L, sc, B, n) if sc["kind"] == "title" else render_device(L, sc, B, n, chrome)
        hold = prev
        push_n = round(PUSH_S * FPS) if sc.get("enter") == "push" and hold is not None else 0
        print(f"[{f0 / FPS:6.2f}s] beat {b0:>2} {sc['kind']:6s} {sc.get('caption') or sc['lines'][0]['text']}", flush=True)
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
    out = args.out or os.path.join(ROOT, "out", f"ryos-dictionary-fitness-30s{'-vertical' if args.vertical else ''}.mp4")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    compose(L, 60.0 / args.bpm, out, args.music, args.music_start)
