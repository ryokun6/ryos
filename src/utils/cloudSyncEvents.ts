import {
  isSyncBlobNamespace,
  isSyncNamespace,
  type SyncNamespace,
} from "@/shared/sync2/namespaces";

/**
 * Lightweight event bus connecting app code to the cloud sync engine:
 * - namespace change events mark a namespace dirty (upload path)
 * - check requests trigger a cursor pull (download path)
 */

export type CloudSyncChangeSource = SyncNamespace;

export function normalizeSyncNamespace(
  value: CloudSyncChangeSource
): SyncNamespace | null {
  if (isSyncNamespace(value)) return value;
  return null;
}

export function getCloudSyncContentKey(
  namespace: SyncNamespace,
  localKey: string
): string | null {
  if (!localKey) return null;
  if (namespace === "files") return `files/doc:${localKey}`;
  if (isSyncBlobNamespace(namespace)) {
    return `${namespace}/item:${localKey}`;
  }
  return null;
}

type NamespaceListener = (
  namespace: SyncNamespace,
  keys?: ReadonlySet<string>
) => void;
type SyncCheckRequestListener = () => void;

const changeListeners = new Set<NamespaceListener>();
const syncCheckListeners = new Set<SyncCheckRequestListener>();

export function emitCloudSyncDomainChange(
  domain: CloudSyncChangeSource,
  keys?: Iterable<string>
): void {
  const namespace = normalizeSyncNamespace(domain);
  if (!namespace) return;
  const normalizedKeys = keys
    ? new Set(Array.from(keys).filter((key) => typeof key === "string" && key))
    : undefined;
  changeListeners.forEach((listener) => {
    try {
      listener(namespace, normalizedKeys);
    } catch (error) {
      console.error("[CloudSyncEvents] Listener failed:", error);
    }
  });
}

export function emitCloudSyncDomainChanges(
  domains: Iterable<CloudSyncChangeSource>
): void {
  const namespaces = new Set<SyncNamespace>();
  for (const domain of domains) {
    const namespace = normalizeSyncNamespace(domain);
    if (namespace) namespaces.add(namespace);
  }
  namespaces.forEach((namespace) => {
    changeListeners.forEach((listener) => {
      try {
        listener(namespace);
      } catch (error) {
        console.error("[CloudSyncEvents] Listener failed:", error);
      }
    });
  });
}

export function subscribeToCloudSyncDomainChanges(
  listener: NamespaceListener
): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export function requestCloudSyncCheck(): void {
  syncCheckListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("[CloudSyncEvents] Sync check listener failed:", error);
    }
  });
}

export function subscribeToCloudSyncCheckRequests(
  listener: SyncCheckRequestListener
): () => void {
  syncCheckListeners.add(listener);
  return () => {
    syncCheckListeners.delete(listener);
  };
}

/**
 * With a single cursor there is no cheaper per-domain check; a domain check
 * is just a global check. Kept as a named API for call-site clarity.
 */
export function requestCloudSyncDomainCheck(_domain?: CloudSyncChangeSource): void {
  requestCloudSyncCheck();
}
