import type { MenuHistoryEntry } from "../types";

export function getMenuMemoryKey(
  entry: Pick<MenuHistoryEntry, "kind" | "id" | "title">
): string {
  if (entry.kind) return `${entry.kind}:${entry.id ?? entry.title}`;
  return entry.title;
}

export function isNowPlayingSongMenu(
  entry: Pick<MenuHistoryEntry, "kind" | "title"> | undefined,
  legacyTitle: string
): boolean {
  return entry?.kind === "nowPlayingSong" || entry?.title === legacyTitle;
}
