import { useContactsStore } from "@/stores/useContactsStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { Contact } from "@/utils/contacts";
import { normalizeContacts } from "@/utils/contacts";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { mergeItemsByIdPreferNewer } from "@/utils/sync/engine/domains/entityMerge";

export interface ContactsSnapshotData {
  contacts: Contact[];
  myContactId: string | null;
  deletedContactIds?: DeletionMarkerMap;
}

export function serializeContactsSyncSnapshot(): ContactsSnapshotData {
  const contactsState = useContactsStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    contacts: contactsState.contacts,
    myContactId: contactsState.myContactId,
    deletedContactIds: deletionMarkers.contactIds,
  };
}

export function applyContactsSyncSnapshot(data: ContactsSnapshotData): void {
  const remoteDeletedContactIds = normalizeDeletionMarkerMap(data.deletedContactIds);
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedContactIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.contactIds,
    remoteDeletedContactIds
  );

  cloudSyncState.mergeDeletedKeys("contactIds", remoteDeletedContactIds);

  useContactsStore
    .getState()
    .replaceContactsFromSync(
      filterDeletedIds(
        normalizeContacts(data.contacts),
        effectiveDeletedContactIds,
        (contact) => contact.id
      ),
      data.myContactId ?? null
    );
}

export function mergeContactsSyncSnapshots(
  local: ContactsSnapshotData,
  remote: ContactsSnapshotData
): ContactsSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedContactIds),
    normalizeDeletionMarkerMap(remote.deletedContactIds)
  );

  return {
    contacts: mergeItemsByIdPreferNewer(
      local.contacts,
      normalizeContacts(remote.contacts),
      mergedDeleted
    ),
    myContactId: local.myContactId ?? remote.myContactId,
    deletedContactIds: mergedDeleted,
  };
}
