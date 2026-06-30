import type { LibrarySource } from "@/stores/useIpodStore";

export function shouldEnableAppleMusicIntegration(
  librarySource: LibrarySource
): boolean {
  return librarySource === "appleMusic";
}
