export interface CloudSyncClientVersionMap {
  [clientId: string]: number;
}

export interface CloudSyncVersionState {
  serverVersion: number;
  latestClientId: string;
  latestClientVersion: number;
  clientVersions: CloudSyncClientVersionMap;
}

export interface CloudSyncWriteVersion {
  clientId: string;
  clientVersion: number;
  baseServerVersion?: number | null;
  knownClientVersions?: CloudSyncClientVersionMap;
}

export interface CloudSyncWriteAssessment {
  duplicate: boolean;
  canFastForward: boolean;
  hasConflict: boolean;
}

export const SYNTHETIC_LEGACY_SYNC_CLIENT_ID = "__legacy__";

function normalizeFiniteVersion(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

export function normalizeCloudSyncClientVersionMap(
  value: unknown
): CloudSyncClientVersionMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: CloudSyncClientVersionMap = {};
  for (const [clientId, version] of Object.entries(value as Record<string, unknown>)) {
    const normalizedVersion = normalizeFiniteVersion(version);
    if (typeof clientId === "string" && clientId.length > 0 && normalizedVersion !== null) {
      normalized[clientId] = normalizedVersion;
    }
  }

  return normalized;
}

export function normalizeCloudSyncVersionState(
  value: unknown
): CloudSyncVersionState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<CloudSyncVersionState>;
  const serverVersion = normalizeFiniteVersion(candidate.serverVersion);
  const latestClientVersion = normalizeFiniteVersion(candidate.latestClientVersion);
  if (
    serverVersion === null ||
    latestClientVersion === null ||
    typeof candidate.latestClientId !== "string" ||
    candidate.latestClientId.length === 0
  ) {
    return null;
  }

  return {
    serverVersion,
    latestClientId: candidate.latestClientId,
    latestClientVersion,
    clientVersions: normalizeCloudSyncClientVersionMap(candidate.clientVersions),
  };
}

export function normalizeCloudSyncWriteVersion(
  value: unknown
): CloudSyncWriteVersion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<CloudSyncWriteVersion>;
  const clientVersion = normalizeFiniteVersion(candidate.clientVersion);
  if (
    typeof candidate.clientId !== "string" ||
    candidate.clientId.length === 0 ||
    clientVersion === null
  ) {
    return null;
  }

  return {
    clientId: candidate.clientId,
    clientVersion,
    baseServerVersion: normalizeFiniteVersion(candidate.baseServerVersion) ?? null,
    knownClientVersions: normalizeCloudSyncClientVersionMap(
      candidate.knownClientVersions
    ),
  };
}

export function createSyntheticLegacySyncVersion(): CloudSyncVersionState {
  return {
    serverVersion: 1,
    latestClientId: SYNTHETIC_LEGACY_SYNC_CLIENT_ID,
    latestClientVersion: 1,
    clientVersions: {},
  };
}

function doesVersionVectorCover(
  knownClientVersions: CloudSyncClientVersionMap,
  currentClientVersions: CloudSyncClientVersionMap
): boolean {
  for (const [clientId, version] of Object.entries(currentClientVersions)) {
    if ((knownClientVersions[clientId] || 0) < version) {
      return false;
    }
  }

  return true;
}

export function assessCloudSyncWrite(
  existingVersion: CloudSyncVersionState | null | undefined,
  writeVersion: CloudSyncWriteVersion
): CloudSyncWriteAssessment {
  if (!existingVersion) {
    return {
      duplicate: false,
      canFastForward: true,
      hasConflict: false,
    };
  }

  const previousClientVersion =
    existingVersion.clientVersions[writeVersion.clientId] || 0;
  if (writeVersion.clientVersion <= previousClientVersion) {
    return {
      duplicate: true,
      canFastForward: false,
      hasConflict: false,
    };
  }

  const baseServerMatches =
    typeof writeVersion.baseServerVersion === "number" &&
    writeVersion.baseServerVersion === existingVersion.serverVersion;
  const canUseVectorCoverage =
    Object.keys(existingVersion.clientVersions).length > 0 &&
    doesVersionVectorCover(
      writeVersion.knownClientVersions || {},
      existingVersion.clientVersions
    );
  const canFastForward = baseServerMatches || canUseVectorCoverage;

  return {
    duplicate: false,
    canFastForward,
    hasConflict: !canFastForward,
  };
}

export function advanceCloudSyncVersion(
  existingVersion: CloudSyncVersionState | null | undefined,
  writeVersion: CloudSyncWriteVersion
): CloudSyncVersionState {
  const nextClientVersions: CloudSyncClientVersionMap = {
    ...(existingVersion?.clientVersions || {}),
  };

  for (const [clientId, version] of Object.entries(
    writeVersion.knownClientVersions || {}
  )) {
    nextClientVersions[clientId] = Math.max(nextClientVersions[clientId] || 0, version);
  }

  nextClientVersions[writeVersion.clientId] = Math.max(
    nextClientVersions[writeVersion.clientId] || 0,
    writeVersion.clientVersion
  );

  return {
    serverVersion: (existingVersion?.serverVersion || 0) + 1,
    latestClientId: writeVersion.clientId,
    latestClientVersion: writeVersion.clientVersion,
    clientVersions: nextClientVersions,
  };
}

export function getCloudSyncServerVersion(
  versionState: CloudSyncVersionState | null | undefined
): number {
  return versionState?.serverVersion || 0;
}
