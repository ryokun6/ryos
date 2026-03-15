import {
  getLogicalCloudSyncDomainForPhysical,
  getLogicalCloudSyncDomainPhysicalParts,
  LOGICAL_CLOUD_SYNC_DOMAINS,
  type LogicalCloudSyncDomain,
} from "@/utils/cloudSyncLogical";
import { type CloudSyncDomain } from "@/utils/cloudSyncShared";

const STORAGE_KEY = "ryos:cloud-sync:logical-dirty-parts";

type LogicalDirtyState = Partial<Record<LogicalCloudSyncDomain, CloudSyncDomain[]>>;

function normalizeDirtyState(value: unknown): LogicalDirtyState {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: LogicalDirtyState = {};

  for (const logicalDomain of LOGICAL_CLOUD_SYNC_DOMAINS) {
    const rawParts = (value as Record<string, unknown>)[logicalDomain];
    if (!Array.isArray(rawParts)) {
      continue;
    }

    const allowedParts = new Set(
      getLogicalCloudSyncDomainPhysicalParts(logicalDomain)
    );
    const uniqueParts = Array.from(
      new Set(
        rawParts.filter(
          (part): part is CloudSyncDomain =>
            typeof part === "string" && allowedParts.has(part as CloudSyncDomain)
        )
      )
    );

    if (uniqueParts.length > 0) {
      normalized[logicalDomain] = uniqueParts;
    }
  }

  return normalized;
}

function readDirtyState(): LogicalDirtyState {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return normalizeDirtyState(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeDirtyState(state: LogicalDirtyState): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getPersistedLogicalDirtyParts(
  logicalDomain: LogicalCloudSyncDomain
): CloudSyncDomain[] {
  return readDirtyState()[logicalDomain] || [];
}

export function markLogicalDirtyPart(partDomain: CloudSyncDomain): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  const logicalDomain = getLogicalCloudSyncDomainForPhysical(partDomain);
  const state = readDirtyState();
  const nextParts = Array.from(
    new Set([...(state[logicalDomain] || []), partDomain])
  );
  state[logicalDomain] = nextParts;
  writeDirtyState(state);
}

export function clearPersistedLogicalDirtyParts(
  logicalDomain: LogicalCloudSyncDomain,
  partDomains?: Iterable<CloudSyncDomain>
): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  const state = readDirtyState();

  if (!partDomains) {
    delete state[logicalDomain];
    writeDirtyState(state);
    return;
  }

  const partsToClear = new Set(partDomains);
  const remaining = (state[logicalDomain] || []).filter(
    (partDomain) => !partsToClear.has(partDomain)
  );

  if (remaining.length > 0) {
    state[logicalDomain] = remaining;
  } else {
    delete state[logicalDomain];
  }

  writeDirtyState(state);
}

