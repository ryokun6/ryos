import type { LyricLine } from "@/types/lyrics";

export const KARAOKE_TITLE_CARD_MIN_LEAD_MS = 3000;
export const KARAOKE_TITLE_CARD_DURATION_MS = 3000;

export function getFirstLyricStartMs(lines: LyricLine[]): number | null {
  for (const line of lines) {
    if (!line.words.trim()) continue;

    const startMs = Number.parseInt(line.startTimeMs, 10);
    if (Number.isFinite(startMs)) {
      return startMs;
    }
  }

  return null;
}

export function shouldShowKaraokeTitleCard({
  lines,
  currentTimeMs,
  lyricOffsetMs = 0,
  minLeadMs = KARAOKE_TITLE_CARD_MIN_LEAD_MS,
  durationMs = KARAOKE_TITLE_CARD_DURATION_MS,
}: {
  lines: LyricLine[];
  currentTimeMs: number | undefined;
  lyricOffsetMs?: number;
  minLeadMs?: number;
  durationMs?: number;
}): boolean {
  if (currentTimeMs === undefined) return false;

  const firstLyricStartMs = getFirstLyricStartMs(lines);
  if (firstLyricStartMs === null) return false;

  const titleCardStartMs = Math.max(0, lyricOffsetMs);
  const titleCardEndMs = titleCardStartMs + durationMs;
  const titleCardTimeMs = Math.max(currentTimeMs, titleCardStartMs);

  return (
    firstLyricStartMs >= titleCardStartMs + minLeadMs &&
    titleCardTimeMs < titleCardEndMs &&
    titleCardTimeMs < firstLyricStartMs
  );
}
