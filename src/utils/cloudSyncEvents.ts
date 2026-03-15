import type { CloudSyncDomain } from "@/utils/cloudSyncShared";

type CloudSyncDomainListener = (domain: CloudSyncDomain) => void;
type SyncCheckRequestListener = () => void;

const listeners = new Set<CloudSyncDomainListener>();
const syncCheckListeners = new Set<SyncCheckRequestListener>();

export function emitCloudSyncDomainChange(domain: CloudSyncDomain): void {
  listeners.forEach((listener) => {
    try {
      listener(domain);
    } catch (error) {
      console.error("[CloudSyncEvents] Listener failed:", error);
    }
  });
}

export function emitCloudSyncDomainChanges(
  domains: Iterable<CloudSyncDomain>
): void {
  const uniqueDomains = new Set(domains);
  uniqueDomains.forEach((domain) => {
    emitCloudSyncDomainChange(domain);
  });
}

export function subscribeToCloudSyncDomainChanges(
  listener: CloudSyncDomainListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let _syncCheckTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Request a cloud sync check. Multiple calls within the same event-loop tick
 * are coalesced into a single listener notification (e.g. several components
 * mounting simultaneously each call this).
 */
export function requestCloudSyncCheck(): void {
  if (_syncCheckTimer !== null) return;
  _syncCheckTimer = setTimeout(() => {
    _syncCheckTimer = null;
    syncCheckListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("[CloudSyncEvents] Sync check listener failed:", error);
      }
    });
  }, 0);
}

export function subscribeToCloudSyncCheckRequests(
  listener: SyncCheckRequestListener
): () => void {
  syncCheckListeners.add(listener);
  return () => {
    syncCheckListeners.delete(listener);
  };
}
