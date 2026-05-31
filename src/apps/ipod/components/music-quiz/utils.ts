import type { Track } from "@/stores/useIpodStore";
import { NUM_OPTIONS } from "./constants";

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRound(
  tracks: Track[]
): { options: Track[]; correctIndex: number; correct: Track } | null {
  if (tracks.length < 1) return null;
  const optionCount = Math.min(NUM_OPTIONS, tracks.length);
  const shuffled = shuffle(tracks);
  const options = shuffled.slice(0, optionCount);
  const correctIndex = Math.floor(Math.random() * options.length);
  return { options, correctIndex, correct: options[correctIndex] };
}

export function formatOption(track: Track): string {
  const artist = track.artist ? ` — ${track.artist}` : "";
  return `${track.title}${artist}`;
}

export function scoreMessageKey(score: number, maxScore: number): string {
  const ratio = maxScore === 0 ? 0 : score / maxScore;
  if (ratio === 1) return "apps.ipod.musicQuiz.perfect";
  if (ratio >= 0.6) return "apps.ipod.musicQuiz.greatJob";
  if (ratio >= 0.3) return "apps.ipod.musicQuiz.notBad";
  return "apps.ipod.musicQuiz.keepPracticing";
}
