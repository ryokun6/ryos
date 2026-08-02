import { useEffect, useState, useSyncExternalStore } from "react";
import { stuffItemCoverSrc, type StuffItem } from "../types";
import {
  getStuffCoverObjectUrl,
  getStuffCoversRevision,
  subscribeStuffCoversRevision,
} from "../utils/stuffCoverBlobs";

/**
 * Resolve a Stuff item cover for `<img src>`, including IndexedDB cover blobs.
 *
 * Subscribes to the module cover revision via `useSyncExternalStore` (not
 * `useState` + manual `setState` in the listener). Calling `setState` from
 * every mounted cover when `bumpStuffCoversRevision` runs can nest updates
 * past React's limit ("Maximum update depth exceeded"), especially after
 * upload / remove-bg / sync invalidation when many shelf tiles are mounted.
 */
export function useStuffItemCoverSrc(
  item: Pick<StuffItem, "imageDataUrl" | "imageUrl" | "coverBlobId">
): string | undefined {
  const coverBlobId = item.coverBlobId?.trim() || "";
  const revision = useSyncExternalStore(
    subscribeStuffCoversRevision,
    getStuffCoversRevision,
    getStuffCoversRevision
  );
  const [blobUrl, setBlobUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!coverBlobId) {
      // Bail when already cleared — avoids a render→effect→setState loop.
      setBlobUrl((prev) => (prev === undefined ? prev : undefined));
      return;
    }
    let cancelled = false;
    void getStuffCoverObjectUrl(coverBlobId).then((url) => {
      if (cancelled) return;
      // Same cached object URL after an unrelated revision bump: no update.
      setBlobUrl((prev) => (prev === url ? prev : url));
    });
    return () => {
      cancelled = true;
    };
  }, [coverBlobId, revision]);

  return stuffItemCoverSrc(item, blobUrl);
}
