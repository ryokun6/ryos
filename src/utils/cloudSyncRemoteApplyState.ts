import type { CloudSyncDomain } from "@/utils/cloudSyncShared";

const activeRemoteApplyDomains = new Set<CloudSyncDomain>();

export function beginApplyingRemoteDomain(domain: CloudSyncDomain): void {
  activeRemoteApplyDomains.add(domain);
}

export function endApplyingRemoteDomain(domain: CloudSyncDomain): void {
  activeRemoteApplyDomains.delete(domain);
}

export function isApplyingRemoteDomain(domain: CloudSyncDomain): boolean {
  return activeRemoteApplyDomains.has(domain);
}
