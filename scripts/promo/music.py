#!/usr/bin/env python3
"""Find a strong, beat-aligned excerpt of a background track for build.py.

  python3 scripts/promo/music.py track.mp3 [--seconds 30] [--top 5]

Tracks beats, fits a straight beat grid (tempo drift-free), and ranks windows that start on a beat
right after a quieter beat (a hit after a dip) by their mean loudness. Pass the chosen start and
tempo to build.py as --music-start / --bpm (or PROMO_MUSIC_START / PROMO_BPM).
Needs librosa (pip install librosa).
"""
import argparse

import librosa
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("track")
ap.add_argument("--seconds", type=float, default=30.0)
ap.add_argument("--top", type=int, default=5)
args = ap.parse_args()

y, sr = librosa.load(args.track, sr=22050, mono=True)
_, frames = librosa.beat.beat_track(y=y, sr=sr)
beats = librosa.frames_to_time(frames, sr=sr)
rms = librosa.feature.rms(y=y, hop_length=256)[0]
rt = librosa.times_like(rms, sr=sr, hop_length=256)


def loud(t0, t1):
    m = (rt >= t0) & (rt < t1)
    return float(rms[m].mean()) if m.any() else 0.0


k = np.arange(len(beats))
period, offset = np.polyfit(k, beats, 1)
print(f"tempo {60 / period:.2f} bpm (beat {period:.4f} s), {len(beats)} beats, track {len(y) / sr:.1f} s")

cands = []
for i in range(1, len(beats)):
    t = beats[i]
    if t + args.seconds > len(y) / sr:
        break
    hit, dip = loud(t, t + period / 2), loud(t - period, t - period / 4)
    if hit > dip * 1.15:
        w = beats[(beats >= t) & (beats <= t + args.seconds)]
        kk = np.arange(len(w))
        p, o = np.polyfit(kk, w, 1) if len(w) > 2 else (period, t)
        cands.append((loud(t, t + args.seconds), t, 60 / p, o))

cands.sort(reverse=True)
seen = []
for energy, t, bpm, o in cands:
    if any(abs(t - s) < args.seconds / 2 for s in seen):
        continue
    seen.append(t)
    print(f"start {o:8.3f} s  bpm {bpm:6.2f}  mean rms {energy:.3f}")
    if len(seen) >= args.top:
        break
