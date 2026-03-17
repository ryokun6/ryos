import type {
  CloudSyncBlobItemDownloadMetadata,
  CloudSyncDomain,
  CloudSyncDomainMetadata,
} from "@/utils/cloudSyncShared";

export interface DownloadCloudSyncResult {
  metadata: CloudSyncDomainMetadata;
  applied: boolean;
}

export interface PreparedCloudSyncDomainWrite {
  domain: CloudSyncDomain;
  payload: Record<string, unknown>;
  onCommitted?: (metadata: CloudSyncDomainMetadata) => Promise<void> | void;
  /** When true, do not include this part in PUT /api/sync — metadata unchanged on server */
  skipRemoteWrite?: boolean;
  committedMetadataFallback?: CloudSyncDomainMetadata;
}

export interface RedisStateDomainDownloadPayload {
  data: unknown;
  metadata: CloudSyncDomainMetadata;
}

export interface BlobMonolithicDomainDownloadPayload {
  metadata: CloudSyncDomainMetadata;
  downloadUrl?: string;
  blobUrl?: string;
}

export interface BlobIndividualDomainDownloadPayload {
  mode: "individual";
  items?: Record<string, CloudSyncBlobItemDownloadMetadata>;
  metadata: CloudSyncDomainMetadata;
  deletedItems?: Record<string, string>;
}

export type CloudSyncDomainDownloadPayload =
  | RedisStateDomainDownloadPayload
  | BlobMonolithicDomainDownloadPayload
  | BlobIndividualDomainDownloadPayload;
