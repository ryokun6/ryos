import type { CloudSyncDomain } from "@/utils/cloudSyncShared";

type CloudSyncDomainListener = (domain: CloudSyncDomain) => void;
type SyncCheckRequestListener = () => void;
type DomainSyncCheckRequestListener = (domain: CloudSyncDomain) => void;

const listeners = new Set<CloudSyncDomainListener>();
const syncCheckListeners = new Set<SyncCheckRequestListener>();
const domainSyncCheckListeners = new Set<DomainSyncCheckRequestListener>();

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

export function requestCloudSyncDomainCheck(domain: CloudSyncDomain): void {
  domainSyncCheckListeners.forEach((listener) => {
    try {
      listener(domain);
    } catch (error) {
      console.error("[CloudSyncEvents] Domain sync check listener failed:", error);
    }
  });
}

export function subscribeToCloudSyncDomainCheckRequests(
  listener: DomainSyncCheckRequestListener
): () => void {
  domainSyncCheckListeners.add(listener);
  return () => {
    domainSyncCheckListeners.delete(listener);
  };
}
