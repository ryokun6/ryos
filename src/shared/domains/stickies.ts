import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "../../utils/cloudSyncDeletionMarkers";
import { mergeItemsByIdPreferNewer } from "../sync/itemMerge";

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    isFiniteNumber((value as { x?: unknown }).x) &&
    isFiniteNumber((value as { y?: unknown }).y)
  );
}

function isSize(value: unknown): value is { width: number; height: number } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    isFiniteNumber((value as { width?: unknown }).width) &&
    isFiniteNumber((value as { height?: unknown }).height)
  );
}

export function isStickiesNoteDto(value: unknown): value is StickiesNoteDto {
  if (!value || typeof value !== "object") {
    return false;
  }

  const note = value as Partial<StickiesNoteDto>;
  return (
    typeof note.id === "string" &&
    note.id.length > 0 &&
    typeof note.content === "string" &&
    typeof note.color === "string" &&
    isPoint(note.position) &&
    isSize(note.size) &&
    isFiniteNumber(note.createdAt) &&
    isFiniteNumber(note.updatedAt)
  );
}

export function normalizeStickiesSnapshotData(
  data: unknown
): StickiesSnapshotData {
  if (!data || typeof data !== "object") {
    return { notes: [], deletedNoteIds: {} };
  }

  const snapshot = data as { notes?: unknown; deletedNoteIds?: unknown };
  return {
    notes: Array.isArray(snapshot.notes)
      ? snapshot.notes.filter(isStickiesNoteDto)
      : [],
    deletedNoteIds: normalizeDeletionMarkerMap(snapshot.deletedNoteIds),
  };
}

export function isStickiesSnapshotData(
  value: unknown
): value is StickiesSnapshotData {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as { notes?: unknown }).notes) &&
    (value as { notes: unknown[] }).notes.every(isStickiesNoteDto)
  );
}

export function mergeStickiesSnapshots(
  local: StickiesSnapshotData,
  remote: StickiesSnapshotData
): StickiesSnapshotData {
  const localSnapshot = normalizeStickiesSnapshotData(local);
  const remoteSnapshot = normalizeStickiesSnapshotData(remote);
  const mergedDeleted = mergeDeletionMarkerMaps(
    localSnapshot.deletedNoteIds,
    remoteSnapshot.deletedNoteIds
  );
  return {
    notes: mergeItemsByIdPreferNewer(
      localSnapshot.notes,
      remoteSnapshot.notes,
      mergedDeleted
    ),
    deletedNoteIds: mergedDeleted,
  };
}
