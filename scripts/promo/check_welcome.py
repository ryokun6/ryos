#!/usr/bin/env python3
"""Fail if the Dictionary welcome-screen sample chips (which include 學習) appear in a video.

  python3 scripts/promo/check_welcome.py <video> [scale ...]
`scale` = video px per capture px (1.0 for capture.mkv); pass several for zoomed renders.
The reference crop comes from welcome-ref.ts.
"""
import os
import subprocess
import sys

import cv2
import numpy as np

video = sys.argv[1]
WORK = os.environ.get("PROMO_WORK_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tmp", "promo")
ref = cv2.imread(os.path.join(WORK, "rec", "welcome-chips.png"), cv2.IMREAD_GRAYSCALE)
probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                        "-of", "csv=p=0", video], capture_output=True, text=True).stdout.strip().split(",")
W, H = int(probe[0]), int(probe[1])
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", video, "-vf", "fps=4,format=gray", "-f", "rawvideo", "-"],
                     stdout=subprocess.PIPE)
scales = [float(s) for s in sys.argv[2:]] or [1.0]
worst = (0.0, -1, 0)
i = 0
while True:
    buf = p.stdout.read(W * H)
    if len(buf) < W * H:
        break
    frame = np.frombuffer(buf, np.uint8).reshape(H, W)
    for s in scales:
        tpl = cv2.resize(ref, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s != 1.0 else ref
        score = cv2.matchTemplate(frame, tpl, cv2.TM_CCOEFF_NORMED).max()
        if score > worst[0]:
            worst = (float(score), i / 4, s)
    i += 1
print(f"frames={i} best_match={worst[0]:.3f} at t={worst[1]:.2f}s scale={worst[2]}")
sys.exit(1 if worst[0] > 0.7 else 0)
