export interface StoreSnapshot<Payload = unknown> {
  storeKey: string;
  version: number;
  updatedAt: number;
  hash: string;
  payload: Payload;
}

export interface SnapshotEnvelope<Payload = unknown> {
  deviceId: string;
  generatedAt: number;
  snapshots: StoreSnapshot<Payload>[];
}

export type HashAlgorithm = "SHA-256";
