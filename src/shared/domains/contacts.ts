import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "../../utils/cloudSyncDeletionMarkers";
import {
  isSerializedContact,
  normalizeContacts,
  type Contact,
} from "../../utils/contacts";
import { mergeItemsByIdPreferNewer } from "../sync/itemMerge";

export interface ContactsSnapshotData {
  contacts: Contact[];
  myContactId: string | null;
  deletedContactIds?: DeletionMarkerMap;
}

export function normalizeContactsSnapshotData(
  data: unknown
): ContactsSnapshotData {
  if (!data || typeof data !== "object") {
    return { contacts: [], myContactId: null, deletedContactIds: {} };
  }

  const snapshot = data as Partial<ContactsSnapshotData>;
  return {
    contacts: normalizeContacts(
      Array.isArray(snapshot.contacts)
        ? snapshot.contacts.filter(isSerializedContact)
        : []
    ),
    myContactId:
      typeof snapshot.myContactId === "string" ? snapshot.myContactId : null,
    deletedContactIds: normalizeDeletionMarkerMap(snapshot.deletedContactIds),
  };
}

export function isContactsSnapshotData(
  value: unknown
): value is ContactsSnapshotData {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as { contacts?: unknown[] }).contacts) &&
    (value as { contacts: unknown[] }).contacts.every(isSerializedContact)
  );
}

export function mergeContactsSnapshots(
  local: ContactsSnapshotData,
  remote: ContactsSnapshotData
): ContactsSnapshotData {
  const localSnapshot = normalizeContactsSnapshotData(local);
  const remoteSnapshot = normalizeContactsSnapshotData(remote);
  const mergedDeleted = mergeDeletionMarkerMaps(
    localSnapshot.deletedContactIds,
    remoteSnapshot.deletedContactIds
  );

  return {
    contacts: mergeItemsByIdPreferNewer(
      localSnapshot.contacts,
      remoteSnapshot.contacts,
      mergedDeleted
    ),
    myContactId: localSnapshot.myContactId ?? remoteSnapshot.myContactId,
    deletedContactIds: mergedDeleted,
  };
}
