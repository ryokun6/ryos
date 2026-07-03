import type { LibrarySource } from "@/shared/media/library";

export function shouldEnableAppleMusicIntegration(
  librarySource: LibrarySource
): boolean {
  return librarySource === "appleMusic";
}
