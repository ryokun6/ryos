"""Dump a frame per mark: python3 scripts/promo/peek.py <rec/session dir> [offset_s]"""
import json, subprocess, sys, os
d = sys.argv[1]; out = os.path.join(d, "peek"); os.makedirs(out, exist_ok=True)
m = json.load(open(os.path.join(d, "marks.json")))
for i, mk in enumerate(m["marks"]):
    t = max(0, mk["t"] + float(sys.argv[2] if len(sys.argv) > 2 else 0))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", os.path.join(d, "capture.mkv"), "-frames:v", "1", "-vf", "scale=1024:-1", os.path.join(out, f"{i:02d}-{mk['name']}.jpg")])
    print(f"{i:02d} {mk['name']:12s} {mk['t']:.2f}")
