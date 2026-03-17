import { useVideoStore, type Video } from "@/stores/useVideoStore";
import { mergeItemsById } from "@/sync/domains/shared";

export interface VideosSnapshotData {
  videos: Video[];
}

export function serializeVideosSnapshot(): VideosSnapshotData {
  return {
    videos: useVideoStore.getState().videos,
  };
}

export function applyVideosSnapshot(data: VideosSnapshotData): void {
  useVideoStore.setState({
    videos: data.videos,
  });
}

export function mergeVideosSnapshots(
  local: VideosSnapshotData,
  remote: VideosSnapshotData
): VideosSnapshotData {
  return {
    videos: mergeItemsById(local.videos, remote.videos),
  };
}
