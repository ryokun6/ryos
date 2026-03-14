export interface CloudSyncRevision {
  clientId: string;
  counter: number;
}

const SYNC_CLIENT_ID_KEY = "ryos:cloud-sync:client-id";
const SYNC_REVISION_COUNTERS_KEY = "ryos:cloud-sync:revision-counters";

type RevisionCounterMap = Record<string, number>;

function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRevisionCounters(): RevisionCounterMap {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(SYNC_REVISION_COUNTERS_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([scope, counter]) =>
          typeof scope === "string" &&
          scope.length > 0 &&
          typeof counter === "number" &&
          Number.isFinite(counter) &&
          counter >= 0
      )
    ) as RevisionCounterMap;
  } catch {
    return {};
  }
}

function writeRevisionCounters(counters: RevisionCounterMap): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(SYNC_REVISION_COUNTERS_KEY, JSON.stringify(counters));
}

export function getSyncClientId(): string {
  if (typeof localStorage === "undefined") {
    return createClientId();
  }

  const existing = localStorage.getItem(SYNC_CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = createClientId();
  localStorage.setItem(SYNC_CLIENT_ID_KEY, next);
  return next;
}

export function isCloudSyncRevision(value: unknown): value is CloudSyncRevision {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as CloudSyncRevision).clientId === "string" &&
    (value as CloudSyncRevision).clientId.length > 0 &&
    typeof (value as CloudSyncRevision).counter === "number" &&
    Number.isFinite((value as CloudSyncRevision).counter)
  );
}

export function normalizeCloudSyncRevision(
  value: unknown
): CloudSyncRevision | undefined {
  if (!isCloudSyncRevision(value)) {
    return undefined;
  }

  return {
    clientId: value.clientId,
    counter: value.counter,
  };
}

export function getNextSyncRevision(scope: string): CloudSyncRevision {
  const clientId = getSyncClientId();
  const counters = readRevisionCounters();
  const nextCounter = (counters[scope] || 0) + 1;
  counters[scope] = nextCounter;
  writeRevisionCounters(counters);

  return {
    clientId,
    counter: nextCounter,
  };
}

export function compareCloudSyncRevisions(
  left: CloudSyncRevision | null | undefined,
  right: CloudSyncRevision | null | undefined
): 1 | 0 | -1 | null {
  const normalizedLeft = normalizeCloudSyncRevision(left);
  const normalizedRight = normalizeCloudSyncRevision(right);

  if (!normalizedLeft && !normalizedRight) {
    return 0;
  }

  if (!normalizedLeft || !normalizedRight) {
    return null;
  }

  if (normalizedLeft.clientId !== normalizedRight.clientId) {
    return null;
  }

  if (normalizedLeft.counter === normalizedRight.counter) {
    return 0;
  }

  return normalizedLeft.counter > normalizedRight.counter ? 1 : -1;
}
