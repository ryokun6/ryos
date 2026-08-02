import { useEffect, useState } from "react";
import { stuffItemCoverSrc, type StuffItem } from "../types";
import {
  getStuffCoverObjectUrl,
  getStuffCoversRevision,
  subscribeStuffCoversRevision,
} from "../utils/stuffCoverBlobs";

/**
 * Resolve a Stuff item cover for `<img src>`, including IndexedDB cover blobs.
 */
export function useStuffItemCoverSrc(
  item: Pick<StuffItem, "imageDataUrl" | "imageUrl" | "coverBlobId">
): string | undefined {
  const coverBlobId = item.coverBlobId?.trim() || "";
  const [blobUrl, setBlobUrl] = useState<string | undefined>();
  const [revision, setRevision] = useState(getStuffCoversRevision);

  useEffect(() => {
    return subscribeStuffCoversRevision(() => {
      setRevision(getStuffCoversRevision());
    });
  }, []);

  useEffect(() => {
    if (!coverBlobId) {
      setBlobUrl(undefined);
      return;
    }
    let cancelled = false;
    void getStuffCoverObjectUrl(coverBlobId).then((url) => {
      if (!cancelled) setBlobUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [coverBlobId, revision]);

  return stuffItemCoverSrc(item, blobUrl);
}
