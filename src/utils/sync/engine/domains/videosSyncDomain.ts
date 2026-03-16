import { useVideoStore, type Video } from "@/stores/useVideoStore";
import { mergeItemsById } from "@/utils/sync/engine/domains/entityMerge";

export interface VideosSnapshotData {
  videos: Video[];
}

export function serializeVideosSyncSnapshot(): VideosSnapshotData {
  return {
    videos: useVideoStore.getState().videos,
  };
}

export function applyVideosSyncSnapshot(data: VideosSnapshotData): void {
  useVideoStore.setState({
    videos: data.videos,
  });
}

export function mergeVideosSyncSnapshots(
  local: VideosSnapshotData,
  remote: VideosSnapshotData
): VideosSnapshotData {
  return {
    videos: mergeItemsById(local.videos, remote.videos),
  };
}
