import type { DeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";

export type IndividualBlobApplyMode = "incremental" | "replace";
export type IndividualBlobDownloadApplyMode =
  | "auto"
  | IndividualBlobApplyMode;

interface ResolveIndividualBlobApplyModeParams {
  requestedMode?: IndividualBlobDownloadApplyMode;
  localItemCount: number;
  hasSyncHistory: boolean;
}

interface PlanIndividualBlobDomainApplyParams {
  mode: IndividualBlobApplyMode;
  existingKeys: Iterable<string>;
  remoteKeys: Iterable<string>;
  changedItemKeys: Iterable<string>;
  deletedKeys?: DeletionMarkerMap;
}

export interface IndividualBlobApplyPlan {
  keysToDelete: string[];
  keysToUpsert: string[];
  finalKeys: string[];
}

export function resolveIndividualBlobApplyMode({
  requestedMode = "auto",
  localItemCount,
  hasSyncHistory,
}: ResolveIndividualBlobApplyModeParams): IndividualBlobApplyMode {
  if (requestedMode === "incremental" || requestedMode === "replace") {
    return requestedMode;
  }

  if (!hasSyncHistory && localItemCount === 0) {
    return "replace";
  }

  return "incremental";
}

export function planIndividualBlobDomainApply({
  mode,
  existingKeys,
  remoteKeys,
  changedItemKeys,
  deletedKeys = {},
}: PlanIndividualBlobDomainApplyParams): IndividualBlobApplyPlan {
  const existingKeySet = new Set(existingKeys);
  const filteredRemoteKeySet = new Set(
    Array.from(remoteKeys).filter((key) => !deletedKeys[key])
  );
  const changedKeySet = new Set(
    Array.from(changedItemKeys).filter((key) => !deletedKeys[key])
  );

  if (mode === "replace") {
    return {
      keysToDelete: Array.from(existingKeySet).filter(
        (key) => !filteredRemoteKeySet.has(key)
      ),
      keysToUpsert: Array.from(changedKeySet),
      finalKeys: Array.from(filteredRemoteKeySet),
    };
  }

  const deletedKeySet = new Set(
    Object.keys(deletedKeys).filter((key) => existingKeySet.has(key))
  );
  const finalKeySet = new Set(existingKeySet);

  for (const key of deletedKeySet) {
    finalKeySet.delete(key);
  }

  for (const key of changedKeySet) {
    finalKeySet.add(key);
  }

  return {
    keysToDelete: Array.from(deletedKeySet),
    keysToUpsert: Array.from(changedKeySet),
    finalKeys: Array.from(finalKeySet),
  };
}
