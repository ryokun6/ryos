import {
  getLogicalCloudSyncDomainForPhysical,
  getLogicalCloudSyncDomainPhysicalParts,
  type LogicalCloudSyncDomain,
} from "@/utils/syncLogicalDomains";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { type CloudSyncDomain } from "@/utils/cloudSyncShared";

export function getPersistedLogicalDirtyParts(
  logicalDomain: LogicalCloudSyncDomain
): CloudSyncDomain[] {
  return useCloudSyncStore.getState().persistedMetadata.logicalDirtyParts[logicalDomain] || [];
}

export function markLogicalDirtyPart(partDomain: CloudSyncDomain): void {
  const logicalDomain = getLogicalCloudSyncDomainForPhysical(partDomain);
  useCloudSyncStore.getState().updatePersistedMetadata((current) => ({
    ...current,
    logicalDirtyParts: {
      ...current.logicalDirtyParts,
      [logicalDomain]: Array.from(
        new Set([...(current.logicalDirtyParts[logicalDomain] || []), partDomain])
      ),
    },
  }));
}

export function clearPersistedLogicalDirtyParts(
  logicalDomain: LogicalCloudSyncDomain,
  partDomains?: Iterable<CloudSyncDomain>
): void {
  useCloudSyncStore.getState().updatePersistedMetadata((current) => {
    const nextLogicalDirtyParts = {
      ...current.logicalDirtyParts,
    };

    if (!partDomains) {
      delete nextLogicalDirtyParts[logicalDomain];
      return {
        ...current,
        logicalDirtyParts: nextLogicalDirtyParts,
      };
    }

    const allowedParts = new Set(
      getLogicalCloudSyncDomainPhysicalParts(logicalDomain)
    );
    const partsToClear = new Set(
      Array.from(partDomains).filter((partDomain) => allowedParts.has(partDomain))
    );
    const remaining = (current.logicalDirtyParts[logicalDomain] || []).filter(
      (partDomain) => !partsToClear.has(partDomain)
    );

    if (remaining.length > 0) {
      nextLogicalDirtyParts[logicalDomain] = remaining;
    } else {
      delete nextLogicalDirtyParts[logicalDomain];
    }

    return {
      ...current,
      logicalDirtyParts: nextLogicalDirtyParts,
    };
  });
}

