import { buildLocalSnapshots } from "./registry";
import type { SnapshotEnvelope } from "./types";
import { pushSnapshots, pullSnapshots, deleteRemoteSnapshots } from "./client";

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

type AuthHeaders = { authToken?: string; username?: string };

export async function pushLocalSnapshots(
  deviceId: string,
  auth?: AuthHeaders
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const envelope = await buildLocalSnapshotEnvelope(deviceId);
    const resp = await pushSnapshots(envelope, auth);
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: resp.statusText || "push_failed" };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message };
  }
}

export async function pullRemoteSnapshots(
  auth?: AuthHeaders
): Promise<{ ok: boolean; status: number; snapshots?: unknown[]; error?: string }> {
  try {
    const resp = await pullSnapshots(auth);
    return { ok: true, status: 200, snapshots: resp.snapshots };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message };
  }
}

export async function deleteRemoteSyncData(
  auth?: AuthHeaders
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const resp = await deleteRemoteSnapshots(auth);
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: resp.statusText || "delete_failed" };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message };
  }
}
