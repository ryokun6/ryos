import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { IndividualBlobSyncDomain } from "@/utils/cloudSyncShared";
import {
  createEmptyIndividualBlobKnownState,
  type IndividualBlobKnownItem,
  type IndividualBlobKnownItemMap,
} from "@/utils/sync/engine/state/syncStateSchema";

export function getIndividualBlobKnownItems(
  domain: IndividualBlobSyncDomain
): IndividualBlobKnownItemMap {
  return (
    useCloudSyncStore.getState().persistedMetadata.individualBlobKnownItems[domain] ||
    createEmptyIndividualBlobKnownState()[domain]
  );
}

export function setIndividualBlobKnownItems(
  domain: IndividualBlobSyncDomain,
  items: IndividualBlobKnownItemMap
): void {
  useCloudSyncStore.getState().updatePersistedMetadata((current) => ({
    ...current,
    individualBlobKnownItems: {
      ...current.individualBlobKnownItems,
      [domain]: items,
    },
  }));
}
