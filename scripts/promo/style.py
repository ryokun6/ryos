"""
Tunable look of the promo. Every number build.py uses for motion, zoom and type lives here.

Override any subset with a JSON file (deep-merged over these defaults):
  PROMO_STYLE=style.json python3 scripts/promo/build.py      # or --style style.json
e.g. {"move": {"duration_s": 1.1, "ease": [0.25, 0.1, 0.25, 1]}, "zoom": {"strokes": {"factor": 1.25}}}

Units: seconds, output px, beats of the music grid. Eases are CSS cubic-bezier control points [x1, y1, x2, y2].
Zoom factors are relative to the resting device (1.0 = no zoom); the camera always moves the whole device.
"""
import copy
import json
import os

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")

DEFAULTS = {
    # Myriad Pro bold cut shipped with ryOS (fontconfig: "Myriad Pro | Semibold,Bold"); used for every caption.
    "font": os.path.join(REPO, "public", "fonts", "MyriadPro-Semibold.otf"),
    "tracking_em": -0.01,
    "colors": {"bg": [245, 245, 247], "ink": [29, 29, 31]},
    "layout": {
        # Resting device: its height and top edge. Captions sit centred under it: "band" centres them in the
        # space between the device and the frame bottom, "gap" puts their top `caption_gap` px under the device.
        # "side" is Apple's title-card layout: the block left-aligned at text_x_frac x width, vertically centred,
        # max_chars per line within block_w_frac x width; the device sits device_gap px right of the block's widest
        # line (at most side_device_h_max tall), its right edge mirroring the left margin.
        "h": {"device_h": 790, "device_top": 56, "caption_anchor": "band", "caption_gap": 36,
              "caption_size": 56, "title_size": 64, "caption_max_w": 1500, "line_height": 1.12, "margin": 40,
              "icon": 256, "name_size": 80, "url_size": 64,
              "text_x_frac": 0.063, "block_w_frac": 0.49, "max_chars": None, "device_gap": 133,
              "side_device_h_max": 700, "icon_align": "center",
              # title_anchor: layout for title captions only (None = caption_anchor). side_scale: "fit" shrinks
              # the device into the space beside the text, "rest" keeps its wide-shot size and only translates it.
              "title_anchor": None, "side_scale": "fit"},
        "v": {"device_h": 1440, "device_top": 150, "caption_anchor": "band", "caption_gap": 48,
              "caption_size": 68, "title_size": 76, "caption_max_w": 920, "line_height": 1.12, "margin": 60,
              "icon": 300, "name_size": 90, "url_size": 72,
              # Vertical hero title: one word per line, left-aligned at hero_x_frac x width.
              "hero_size": 300, "hero_x_frac": 0.07, "hero_line_height": 0.98},
    },
    "caption": {
        "in_s": 0.4, "out_s": 0.3, "stagger_s": 0.06,
        "in_ease": [0.16, 1, 0.3, 1], "out_ease": [0.7, 0, 0.84, 0],
        "out_dir": "down",          # "down": back out through the bottom of its mask, "up": out through the top
        "pad_em": 0.14,             # transparent margin around every line's glyphs; the reveal mask is that box
        # Between in-place steps of one app: "tuck" (the caption slides back behind the device and the next slides
        # out) or "roll" (the caption stays up and rolls over to the next one in its window, over roll_s).
        "change": "tuck", "roll_s": 0.6,
    },
    "move": {
        "duration_s": 1.0,
        "ease": [0.42, 0, 0.58, 1],  # ease-in-out
        "pull": 0.7,                 # how far the zoom recentres on its target (0 = straight in, 1 = target centred)
    },
    # In-app sounds (the 60 s cut's pronunciation clip): the music dips by duck_db, ramping over duck_ramp_s,
    # from duck_lead_s before the sound until duck_tail_s after it; gain_db lifts the clip itself.
    "sfx": {"duck_db": 10, "duck_ramp_s": 0.15, "duck_lead_s": 0.1, "duck_tail_s": 0.3, "gain_db": 5},
    # iPod: the bed ducks under the song (not under click-wheel ticks). A short ramp, and the bed stays audible.
    "song": {"duck_db": 10, "duck_ramp_s": 0.2, "duck_lead_s": 0.08, "duck_tail_s": 0.45},
    # One entry per zoom in the cut: factor vs the resting device, and the beat (within its scene) it starts on.
    # The scene's caption exits on the same beat.
    "zoom": {
        "open": {"factor": 1.15, "beat": 4.5},
        "strokes": {"factor": 1.35, "beat": 3},
        "ai": {"factor": 1.3, "beat": 3},
        "review": {"factor": 1.25, "beat": 4},
        "progress": {"factor": 1.2, "beat": 2},
        # 60 s cut only: their beat comes from the take's marks (audio start, Zhuyin on, set entry, detail open).
        "listen": {"factor": 1.4, "beat": 3},
        "readings": {"factor": 1.45, "beat": 6},
        "lift": {"factor": 1.3, "beat": 4},
        "exercise": {"factor": 1.25, "beat": 4},
    },
    "icon": {"pop_s": 0.34, "overshoot": 1.9, "name_delay_beats": 0.5, "url_delay_beats": 1.0},
    "push_s": 0.32,
    "caption_in_beat": {"open": 1},
    "caption_in_s": 0.4,            # side layout: when a scene's caption starts sliding out (s into the scene)
    # App intros: "none" = icon card on the background; "wipe" = a solid panel wipes in from the left over the last
    # scene (in_s), carries the icon + label in `ink`, then slides off to the right (out_s) into the app demo.
    "panel": {"kind": "none", "color": [44, 44, 46], "ink": [255, 255, 255], "in_s": 1.0, "out_s": 0.93,
              "content_at_s": 0.45},
    # --- switches the Apple Support override (styles/apple-support.json) turns on; defaults keep the v4 look.
    "shadow": True,                 # soft contact shadow under the device
    "trailing_period": True,        # captions end with "."
    "caption_entrance": "mask",     # "mask": rise inside the line's own box; "behind": slide out from behind the device
    # Between scenes: "cut", "push" (device slide on move.ease) or "inplace" (steps within an app stay on the same
    # device: the camera eases back from the last step's zoom and the captions change under it).
    "transition": {"kind": "cut", "duration_s": 1.0},
    # Opening: start with the device centred and move it to rest at `move_at_s` over `move_s`; the title slides
    # out from behind it at the same time and settles after `title_s`. from_center=False keeps v4's static opening.
    # v_title_push (vertical): the hero title (layout.v.hero_*) reveals alone, word by word – the first word at
    # title_in_beats, then one every word_stagger_beats, each sliding up in its mask over word_in_s – then at
    # push_at_s the phone pushes up from below the frame and carries the title up and out.
    # move_at_beats / push_at_beats, when set, put those two hits on the music grid instead (they win over *_s).
    "open": {"from_center": False, "move_at_s": 1.0, "move_s": 1.24, "title_s": 1.3,
             "v_title_push": False, "title_in_beats": 0.5, "word_stagger_beats": 0.25, "word_in_s": 0.3,
             "push_at_s": 1.4, "move_at_beats": None, "push_at_beats": None, "push_at_beats_60": None},
    "tap": {
        "phone": "dot", "mac": "dot",   # "dot": grey press dot; phone "ios": hover disc + blue ring; mac "cursor"
        # iOS indicator, in px of a 1080p frame whose iPhone is `ref_device_h` tall (scaled to the device on screen).
        "ref_device_h": 950, "hover_d": 85, "lead_s": 0.8, "rest_s": 0.3, "chain_s": 1.5,
        "ring_d": 59, "ring_w": 4, "ring_min_d": 55, "ring_max_d": 67, "ring_s": 0.25, "ring_tighten_s": 0.06,
        "hover_rgba": [120, 120, 128, 0.32], "ring_rgb": [0, 122, 255],
        "cursor_css": 1.0,              # macOS arrow at its native point size (x the camera scale)
    },
    # End card: "pop" (icon pops in) or "mask" (the last shot shrinks through an icon-shaped mask onto the icon).
    "end": {"kind": "pop", "mask_s": 0.47, "overshoot": 0.09, "icon_above_mid_1080": 0},
}


def _merge(a, b):
    for k, v in b.items():
        if k.startswith("_"):
            continue
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            _merge(a[k], v)
        else:
            a[k] = v
    return a


def _load_file(style, path):
    """Merge a style file; "extends" (relative to the file) is merged first, so a file can override another."""
    with open(path) as f:
        data = json.load(f)
    if data.get("extends"):
        _load_file(style, os.path.join(os.path.dirname(os.path.abspath(path)), data.pop("extends")))
    _merge(style, data)


def load(path=None):
    style = copy.deepcopy(DEFAULTS)
    path = path or os.environ.get("PROMO_STYLE")
    if path:
        _load_file(style, path)
    return style


def bezier(x1, y1, x2, y2):
    """CSS cubic-bezier easing u -> eased u."""
    def at(t, a, b):
        return 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3

    def f(u):
        u = min(max(u, 0.0), 1.0)
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if at(mid, x1, x2) < u:
                lo = mid
            else:
                hi = mid
        return at((lo + hi) / 2, y1, y2)
    return f
