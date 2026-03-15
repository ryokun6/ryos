import {
  CLOUD_SYNC_DOMAINS,
  type CloudSyncDomain,
} from "@/utils/cloudSyncShared";

const STORAGE_KEY = "ryos:cloud-sync:last-local-change-at";

type LocalChangeTimestampMap = Partial<Record<CloudSyncDomain, string>>;

function readLocalChangeState(): LocalChangeTimestampMap {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      CLOUD_SYNC_DOMAINS.map((domain) => {
        const value = parsed[domain];
        return [domain, typeof value === "string" ? value : undefined];
      }).filter((entry): entry is [CloudSyncDomain, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

function writeLocalChangeState(state: LocalChangeTimestampMap): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getPersistedLocalChangeAt(domain: CloudSyncDomain): string | null {
  return readLocalChangeState()[domain] || null;
}

export function setPersistedLocalChangeAt(
  domain: CloudSyncDomain,
  timestamp: string
): void {
  if (!timestamp) {
    return;
  }

  const state = readLocalChangeState();
  state[domain] = timestamp;
  writeLocalChangeState(state);
}
