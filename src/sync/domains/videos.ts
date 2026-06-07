import { useVideoStore, type Video } from "@/stores/useVideoStore";
import type { VideosSnapshotData } from "@ryos/shared/contracts/sync-snapshots";
import { mergeItemsById, type AnySnapshotData } from "./_shared";

export function serializeVideosSnapshot(): VideosSnapshotData {
  return {
    videos: useVideoStore.getState().videos,
  };
}

export function applyVideosSnapshot(data: VideosSnapshotData): void {
  useVideoStore.setState({
    videos: data.videos as Video[],
  });
}

export function mergeVideosSnapshots(
  local: VideosSnapshotData,
  remote: VideosSnapshotData
): VideosSnapshotData {
  return {
    videos: mergeItemsById(local.videos as Video[], remote.videos as Video[]),
  };
}

export function mergeVideosConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): VideosSnapshotData {
  return mergeVideosSnapshots(
    localData as VideosSnapshotData,
    remoteData as VideosSnapshotData
  );
}
