import type { CloudSyncDomain } from "@/utils/cloudSyncShared";

const CLIENT_ID_STORAGE_KEY = "ryos:cloud-sync:client-id";
const CLIENT_VERSION_STORAGE_KEY = "ryos:cloud-sync:client-versions";

let inMemoryClientId: string | null = null;

function createClientId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readClientVersions(): Partial<Record<CloudSyncDomain, number>> {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(CLIENT_VERSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<Record<CloudSyncDomain, unknown>>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([domain, value]) =>
          typeof domain === "string" &&
          typeof value === "number" &&
          Number.isFinite(value) &&
          Number.isInteger(value) &&
          value >= 0
      )
    ) as Partial<Record<CloudSyncDomain, number>>;
  } catch {
    return {};
  }
}

function writeClientVersions(
  versions: Partial<Record<CloudSyncDomain, number>>
): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(CLIENT_VERSION_STORAGE_KEY, JSON.stringify(versions));
}

export function getSyncClientId(): string {
  if (inMemoryClientId) {
    return inMemoryClientId;
  }

  if (typeof localStorage === "undefined") {
    inMemoryClientId = createClientId();
    return inMemoryClientId;
  }

  const persistedClientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (persistedClientId) {
    inMemoryClientId = persistedClientId;
    return inMemoryClientId;
  }

  inMemoryClientId = createClientId();
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, inMemoryClientId);
  return inMemoryClientId;
}

export function getNextSyncClientVersion(domain: CloudSyncDomain): number {
  const versions = readClientVersions();
  const nextVersion = (versions[domain] || 0) + 1;
  versions[domain] = nextVersion;
  writeClientVersions(versions);
  return nextVersion;
}
