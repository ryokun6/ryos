import type { SyncNamespace } from "@/shared/sync2/namespaces";
import type { SyncCodec } from "@/sync/codecs";

export type SyncCodecRegistry = Readonly<Record<SyncNamespace, SyncCodec>>;

export function createSyncCodecRegistry(
  codecs: Record<SyncNamespace, SyncCodec>
): SyncCodecRegistry {
  for (const [namespace, codec] of Object.entries(codecs)) {
    if (codec.namespace !== namespace) {
      throw new Error(
        `Sync codec registry mismatch: "${namespace}" registered "${codec.namespace}"`
      );
    }
  }
  return Object.freeze({ ...codecs });
}

export const NAMESPACE_APPLY_ORDER: readonly SyncNamespace[] = [
  "wallpapers",
  "images",
  "books",
  "trash",
  "applets",
  "settings",
  "files",
  "bookshelf",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
];
