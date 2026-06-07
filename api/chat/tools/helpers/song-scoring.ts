/**
 * Pure helpers for song library search scoring and filtering
 */

import type { SongLibraryToolRecord } from "../types.js";

export function normalizeSongQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function scoreSongMatch(record: SongLibraryToolRecord, query: string): number {
  const normalizedQuery = normalizeSongQuery(query);
  if (!normalizedQuery) {
    return 1;
  }

  const fields = [
    record.id,
    record.title,
    record.artist,
    record.album,
    record.createdBy,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => normalizeSongQuery(value));

  let score = 0;

  if (record.id.toLowerCase() === normalizedQuery) {
    score += 2000;
  }

  for (const field of fields) {
    if (field === normalizedQuery) {
      score += 1200;
    } else if (field.startsWith(normalizedQuery)) {
      score += 700;
    } else if (field.includes(normalizedQuery)) {
      score += 350;
    }
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length > 1) {
    const combined = fields.join(" ");
    const matchingTokens = queryTokens.filter((token) => combined.includes(token)).length;
    score += matchingTokens * 120;
  }

  if (score <= 0) {
    return 0;
  }

  if (record.source === "combined") {
    score += 80;
  } else if (record.inUserLibrary) {
    score += 40;
  }

  return score;
}

export function filterAndLimitSongs(
  songs: SongLibraryToolRecord[],
  query: string | undefined,
  limit: number
): SongLibraryToolRecord[] {
  if (!query) {
    return songs.slice(0, limit);
  }

  return songs
    .map((song, index) => ({ song, score: scoreSongMatch(song, query), index }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const createdAtA = a.song.createdAt ?? 0;
      const createdAtB = b.song.createdAt ?? 0;
      if (createdAtB !== createdAtA) {
        return createdAtB - createdAtA;
      }
      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.song);
}
