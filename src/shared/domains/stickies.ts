import type { DeletionMarkerMap } from "../../utils/cloudSyncDeletionMarkers";

export interface StickiesNoteDto {
  id: string;
  content: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  createdAt: number;
  updatedAt: number;
}

export interface StickiesSnapshotData {
  notes: StickiesNoteDto[];
  deletedNoteIds?: DeletionMarkerMap;
}
