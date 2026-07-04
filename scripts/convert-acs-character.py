#!/usr/bin/env python3
"""Convert a Microsoft Agent .acs file (v2.0) into ryOS assistant assets.

Produces the clippy.js-compatible data used by src/components/assistant:
  <out-dir>/map.png      palettized sprite sheet of deduplicated frames
  <out-dir>/agent.json   framesize + animations (durations, branching, sounds)
  <out-dir>/sounds.json  sound key -> "data:audio/mpeg;base64,..." map

Usage:
  python3 scripts/convert-acs-character.py <file.acs> <out-dir> [--no-sounds]

Requires Pillow (pip install pillow) and ffmpeg on PATH for sound conversion.
The binary layout follows Remy Lebeau's MSAgent Character Data Specification
(http://fileformats.lebeausoftware.org); parsing structure adapted from the
s-zeid/agentpy project. Output validated pixel-identical against the shipped
clippy.js-derived data for Clippy (CLIPPIT.ACS).

Used to add the Office Logo (LOGO.ACS), Saeko Sensei (SAEKO.ACS) and
Monkey King (Monkey King.ACS) assistants from the TMAFE classic MS Agent
archive (https://tmafe.com/classic-ms-agents/).
"""

import base64
import json
import math
import os
import struct
import subprocess
import sys
import tempfile


class Reader:
    def __init__(self, data: bytes):
        self.data = data

    def byte(self, o):
        return self.data[o]

    def ushort(self, o):
        return struct.unpack_from("<H", self.data, o)[0]

    def short(self, o):
        return struct.unpack_from("<h", self.data, o)[0]

    def ulong(self, o):
        return struct.unpack_from("<L", self.data, o)[0]

    def string(self, o):
        """ACS string: ulong char count, UTF-16LE chars, terminator if count>0.

        Returns (value, total byte size)."""
        n = self.ulong(o)
        term = 2 if n else 0
        raw = self.data[o + 4 : o + 4 + n * 2]
        return raw.decode("utf-16-le"), 4 + n * 2 + term


def decompress(data: bytes, dst_size: int) -> bytearray:
    """Decompress the Agent 2.0 proprietary LZ77-style bitstream."""
    if len(data) < 7 or data[0] != 0 or data[-6:] != b"\xFF" * 6:
        raise ValueError("malformed compressed data")
    nbits = len(data) * 8

    def bit(i):
        return (data[i >> 3] >> (i & 7)) & 1

    def read(i, count):
        v = 0
        for k in range(count):
            v |= bit(i + k) << k
        return v

    dst = bytearray(dst_size)
    n = 8
    ip = 0
    while n < nbits:
        if not bit(n):
            dst[ip] = read(n + 1, 8)
            n += 9
            ip += 1
            continue
        n += 1
        n_bytes = 2
        ones = 0
        while ones < 3:
            if not bit(n):
                n += 1
                break
            n += 1
            ones += 1
        count = (6, 9, 12, 20)[ones]
        offset = read(n, count)
        n += count
        if count == 20:
            if offset == 0xFFFFF:
                break
            n_bytes += 1
        offset += (1, 65, 577, 4673)[ones]
        ones2 = 0
        while ones2 < 12:
            n += 1
            if not bit(n - 1):
                break
            ones2 += 1
        if ones2 == 12:
            raise ValueError("malformed run length")
        if ones2:
            n_bytes += (1 << ones2) - 1 + read(n, ones2)
            n += ones2
        for _ in range(n_bytes):
            dst[ip] = dst[ip - offset]
            ip += 1
    return dst


class ACSFile:
    def __init__(self, path):
        with open(path, "rb") as f:
            self.data = f.read()
        self.r = Reader(self.data)
        if self.r.ulong(0) != 0xABCDABC3:
            raise ValueError("not an ACS 2.0 file")
        self.char_off = self.r.ulong(4)
        self.anim_off = self.r.ulong(12)
        self.img_off = self.r.ulong(20)
        self.aud_off, self.aud_size = self.r.ulong(28), self.r.ulong(32)
        self._parse_character_info()
        self._parse_animations()
        self._parse_image_index()
        self._parse_audio()

    def _parse_character_info(self):
        r = self.r
        o = self.char_off
        o += 4  # minor + major version
        li_off = r.ulong(o)
        o += 8  # localized info locator
        self.localized = []
        lo = li_off
        n = r.ushort(lo)
        lo += 2
        for _ in range(n):
            lang = r.ushort(lo)
            lo += 2
            name, sz = r.string(lo)
            lo += sz
            desc, sz = r.string(lo)
            lo += sz
            extra, sz = r.string(lo)
            lo += sz
            self.localized.append((lang, name, desc, extra))
        o += 16  # guid
        self.width = r.ushort(o)
        self.height = r.ushort(o + 2)
        o += 4
        self.transparent_index = r.byte(o)
        o += 1
        flags = r.ulong(o)
        o += 4
        voice_enabled = bool(flags >> 5 & 1)
        balloon_enabled = bool(flags >> 9 & 1)
        o += 4  # animation set version
        if voice_enabled:
            o += 32 + 4 + 2  # tts guids + speed + pitch
            extra_flag = r.byte(o)
            o += 1
            if extra_flag & 1:
                o += 2  # lang id
                _, sz = r.string(o)  # dialect
                o += sz
                o += 4  # gender + age
                _, sz = r.string(o)  # style
                o += sz
        if balloon_enabled:
            o += 2 + 12  # lines/chars + 3 rgbquads
            _, sz = r.string(o)  # font name
            o += sz
            o += 10  # height + weight + italic + unknown
        pal_count = r.ulong(o)
        o += 4
        self.palette = []
        for _ in range(pal_count):
            b, g, rr, _res = self.data[o : o + 4]
            self.palette.append((rr, g, b))
            o += 4

    def _parse_animations(self):
        r = self.r
        o = self.anim_off
        count = r.ulong(o)
        o += 4
        self.animations = {}
        for _ in range(count):
            name, sz = r.string(o)
            o += sz
            data_off = r.ulong(o)
            o += 8
            self.animations[name] = self._parse_animation_data(data_off)

    def _parse_animation_data(self, o):
        r = self.r
        _name, sz = r.string(o)
        o += sz
        transition_type = r.byte(o)
        o += 1
        _return_anim, sz = r.string(o)
        o += sz
        frame_count = r.ushort(o)
        o += 2
        frames = []
        for _ in range(frame_count):
            frame, o = self._parse_frame(o)
            frames.append(frame)
        return {"transition_type": transition_type, "frames": frames}

    def _parse_frame(self, o):
        r = self.r
        img_count = r.ushort(o)
        o += 2
        images = []
        for _ in range(img_count):
            images.append((r.ulong(o), r.short(o + 4), r.short(o + 6)))
            o += 8
        audio_index = r.ushort(o)
        duration_csec = r.ushort(o + 2)
        exit_frame = r.short(o + 4)
        o += 6
        branches = []
        branch_count = r.byte(o)
        o += 1
        for _ in range(branch_count):
            branches.append((r.ushort(o), r.ushort(o + 2)))
            o += 4
        overlay_count = r.byte(o)
        o += 1
        for _ in range(overlay_count):
            region_flag = r.byte(o + 5)
            o += 14  # type, replace, image idx, unknown, region flag, x/y/w/h
            if region_flag:
                rd_size = r.ulong(o)
                o += 4 + rd_size
        return (
            {
                "images": images,
                "audio_index": audio_index,
                "duration_ms": duration_csec * 10,
                "exit_frame": exit_frame,
                "branches": branches,
            },
            o,
        )

    def _parse_image_index(self):
        r = self.r
        o = self.img_off
        count = r.ulong(o)
        o += 4
        self.image_locators = []
        for _ in range(count):
            self.image_locators.append(r.ulong(o))
            o += 12  # locator (offset + size) + checksum

    def get_image(self, index):
        """Returns (width, height, 8bpp top-down palette-index rows)."""
        r = self.r
        o = self.image_locators[index]
        o += 1  # unknown byte
        w = r.ushort(o)
        h = r.ushort(o + 2)
        o += 4
        compressed = bool(r.byte(o))
        o += 1
        blob_size = r.ulong(o)
        o += 4
        blob = self.data[o : o + blob_size]
        stride = (w + 3) & ~3
        if compressed:
            blob = decompress(blob, stride * h)
        rows = []
        for row in range(h - 1, -1, -1):  # bottom-up DIB -> top-down
            rows.append(blob[row * stride : row * stride + w])
        return w, h, b"".join(rows)

    def _parse_audio(self):
        r = self.r
        self.audio = []
        if not self.aud_size:
            return
        o = self.aud_off
        count = r.ulong(o)
        o += 4
        for _ in range(count):
            off, size = r.ulong(o), r.ulong(o + 4)
            o += 12
            self.audio.append(self.data[off : off + size])


def compose_frame(acs, images):
    """Flatten a frame's image stack into one framesize palette-index tile.

    ACS lists frame images top-first, so draw them in reverse. Returns None
    for blank frames (no images)."""
    if not images:
        return None
    fw, fh = acs.width, acs.height
    tile = bytearray([acs.transparent_index]) * (fw * fh)
    for idx, ox, oy in reversed(images):
        w, h, pixels = acs.get_image(idx)
        for row in range(h):
            ty = oy + row
            if ty < 0 or ty >= fh:
                continue
            src = pixels[row * w : row * w + w]
            for col in range(w):
                tx = ox + col
                if tx < 0 or tx >= fw:
                    continue
                p = src[col]
                if p != acs.transparent_index:
                    tile[ty * fw + tx] = p
    return bytes(tile)


def wav_to_mp3_data_url(wav: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        tf.write(wav)
        wav_path = tf.name
    mp3_path = wav_path + ".mp3"
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
                "-codec:a", "libmp3lame", "-b:a", "32k", mp3_path,
            ],
            check=True,
        )
        with open(mp3_path, "rb") as f:
            mp3 = f.read()
    finally:
        os.unlink(wav_path)
        if os.path.exists(mp3_path):
            os.unlink(mp3_path)
    return "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()


def convert(acs_path, out_dir, include_sounds=True):
    from PIL import Image

    acs = ACSFile(acs_path)
    fw, fh = acs.width, acs.height
    os.makedirs(out_dir, exist_ok=True)

    tiles = {}
    tile_list = []
    animations = {}
    used_sounds = {}

    def tile_for(pixels):
        if pixels not in tiles:
            tiles[pixels] = len(tile_list)
            tile_list.append(pixels)
        return tiles[pixels]

    for name, anim in acs.animations.items():
        frames_out = []
        for frame in anim["frames"]:
            fo = {"duration": frame["duration_ms"]}
            pixels = compose_frame(acs, frame["images"])
            if pixels is not None:
                fo["images"] = [tile_for(pixels)]  # tile index, mapped below
            if frame["exit_frame"] >= 0:
                fo["exitBranch"] = frame["exit_frame"]
            if frame["branches"]:
                fo["branching"] = {
                    "branches": [
                        {"frameIndex": b[0], "weight": b[1]}
                        for b in frame["branches"]
                    ]
                }
            ai = frame["audio_index"]
            if include_sounds and 0 <= ai < len(acs.audio):
                fo["sound"] = used_sounds.setdefault(
                    ai, str(len(used_sounds) + 1)
                )
            frames_out.append(fo)
        entry = {"frames": frames_out}
        if anim["transition_type"] == 1:
            entry["useExitBranching"] = True
        animations[name] = entry

    # Near-square grid of framesize tiles, like the clippy.js sheets.
    n = len(tile_list)
    cols = max(1, round(math.sqrt(n * fh / fw)))
    rows = math.ceil(n / cols)
    sheet = Image.new("P", (cols * fw, rows * fh), acs.transparent_index)
    flat = []
    for rgb in acs.palette:
        flat.extend(rgb)
    flat.extend([0] * (768 - len(flat)))
    sheet.putpalette(flat)
    transparency = bytearray([255]) * 256
    transparency[acs.transparent_index] = 0

    positions = []
    for i, pixels in enumerate(tile_list):
        x = (i % cols) * fw
        y = (i // cols) * fh
        sheet.paste(Image.frombytes("P", (fw, fh), pixels), (x, y))
        positions.append([x, y])

    for anim in animations.values():
        for frame in anim["frames"]:
            if "images" in frame:
                frame["images"] = [positions[frame["images"][0]]]

    sheet.save(
        os.path.join(out_dir, "map.png"),
        optimize=True,
        transparency=bytes(transparency),
    )

    agent = {
        "overlayCount": 1,
        "framesize": [fw, fh],
        "animations": animations,
    }
    with open(os.path.join(out_dir, "agent.json"), "w") as f:
        json.dump(agent, f, separators=(",", ":"))
        f.write("\n")

    sounds = {}
    if include_sounds:
        for ai, key in sorted(used_sounds.items(), key=lambda kv: int(kv[1])):
            sounds[key] = wav_to_mp3_data_url(acs.audio[ai])
    with open(os.path.join(out_dir, "sounds.json"), "w") as f:
        json.dump(sounds, f, indent=2)

    print(
        f"{os.path.basename(acs_path)}: {len(animations)} animations,"
        f" {n} unique tiles ({cols}x{rows} grid, {cols * fw}x{rows * fh}px),"
        f" {len(sounds)} sounds"
    )


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        sys.exit(1)
    convert(args[0], args[1], include_sounds="--no-sounds" not in sys.argv)
