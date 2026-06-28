import type { DeletionMarkerMap } from "../../utils/cloudSyncDeletionMarkers";
import type { Contact } from "../../utils/contacts";

export interface ContactsSnapshotData {
  contacts: Contact[];
  myContactId: string | null;
  deletedContactIds?: DeletionMarkerMap;
}
