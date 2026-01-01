import { buildLocalSnapshots } from "./registry";
import type { SnapshotEnvelope } from "./types";

/**
 * Build a local snapshot envelope for sync.
 * Network upload is intentionally left to the caller.
 */
export async function buildLocalSnapshotEnvelope(
  deviceId: string
): Promise<SnapshotEnvelope> {
  const snapshots = await buildLocalSnapshots();
  return {
    deviceId,
    generatedAt: Date.now(),
    snapshots,
  };
}
