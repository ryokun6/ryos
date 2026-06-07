import { useContactsStore } from "@/stores/useContactsStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { Contact } from "@/utils/contacts";
import { normalizeContacts } from "@/utils/contacts";
import type { ContactsSnapshotData } from "@ryos/shared/contracts/sync-snapshots";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  mergeItemsByIdPreferNewer,
  type AnySnapshotData,
} from "./_shared";

export function serializeContactsSnapshot(): ContactsSnapshotData {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    contacts: useContactsStore.getState().contacts,
    myContactId: useContactsStore.getState().myContactId,
    deletedContactIds: deletionMarkers.contactIds,
  };
}

export function applyContactsSnapshot(data: ContactsSnapshotData): void {
  const remoteDeletedContactIds = normalizeDeletionMarkerMap(
    data.deletedContactIds
  );
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
        normalizeContacts(data?.contacts),
        effectiveDeletedContactIds,
        (contact) => contact.id
      ),
      data?.myContactId ?? null
    );
}

export function mergeContactsSnapshots(
  local: ContactsSnapshotData,
  remote: ContactsSnapshotData
): ContactsSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedContactIds),
    normalizeDeletionMarkerMap(remote.deletedContactIds)
  );
  return {
    contacts: mergeItemsByIdPreferNewer(
      local.contacts as Contact[],
      normalizeContacts(remote.contacts),
      mergedDeleted
    ),
    myContactId: local.myContactId ?? remote.myContactId,
    deletedContactIds: mergedDeleted,
  };
}

export function mergeContactsConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): ContactsSnapshotData {
  return mergeContactsSnapshots(
    localData as ContactsSnapshotData,
    remoteData as ContactsSnapshotData
  );
}
