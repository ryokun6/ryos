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
