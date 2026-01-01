import { buildLocalSnapshots } from "./registry";
import type { SnapshotEnvelope } from "./types";
import { pushSnapshots, pullSnapshots, deleteRemoteSnapshots } from "./client";
import { mergeSnapshots, snapshotArrayToMap } from "./utils";
import { useSyncSettingsStore } from "@/stores/useSyncSettingsStore";
import { getOrCreateDeviceId } from "./device";

// Snapshot filter helpers ----------------------------------------------------
const MEDIA_KEYS = new Set([
  "ryos:soundboard",
  "ryos:videos",
  "ryos:karaoke",
  "ryos:synth",
  "ryos:pc",
]);

const FILE_KEYS = new Set([
  "ryos:files",
  // Future filesystem content keys can be added here
]);

function filterSnapshotsBySettings(
  snapshots: unknown[],
  opts: { includeMedia: boolean; includeFiles: boolean }
): unknown[] {
  return (snapshots as any[]).filter((snap) => {
    const key = snap?.storeKey as string | undefined;
    if (!key) return false;
    if (!opts.includeMedia && MEDIA_KEYS.has(key)) return false;
    if (!opts.includeFiles && FILE_KEYS.has(key)) return false;
    return true;
  });
}

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

export async function syncOnce(
  deviceId: string,
  auth?: AuthHeaders
): Promise<{ ok: boolean; status: number; merged?: unknown[]; error?: string }> {
  try {
    const settings = useSyncSettingsStore.getState();
    const localEnvelope = await buildLocalSnapshotEnvelope(deviceId);

    // Pull remote first to avoid overwriting newer data when offline edits happen
    const remoteResp = await pullSnapshots(auth);

    // Respect sync scope flags
    const filteredLocal = filterSnapshotsBySettings(localEnvelope.snapshots, {
      includeMedia: settings.includeMedia,
      includeFiles: settings.includeFiles,
    });
    const filteredRemote = filterSnapshotsBySettings(remoteResp.snapshots, {
      includeMedia: settings.includeMedia,
      includeFiles: settings.includeFiles,
    });

    // Merge latest per key
    const merged = mergeSnapshots(filteredLocal as any, filteredRemote as any);
    const mergedEnvelope: SnapshotEnvelope = {
      deviceId,
      generatedAt: Date.now(),
      snapshots: merged,
    };
    const pushResp = await pushSnapshots(mergedEnvelope, auth);
    if (!pushResp.ok) {
      useSyncSettingsStore.getState().markSyncError?.(pushResp.statusText || "push_failed");
      return { ok: false, status: pushResp.status, error: pushResp.statusText || "push_failed" };
    }
    useSyncSettingsStore.getState().markSyncSuccess?.();
    return { ok: true, status: pushResp.status, merged };
  } catch (err) {
    useSyncSettingsStore.getState().markSyncError?.((err as Error).message);
    return { ok: false, status: 0, error: (err as Error).message };
  }
}

export async function syncWithSettings(
  auth?: AuthHeaders
): Promise<{ ok: boolean; status: number; merged?: unknown[]; error?: string }> {
  const settings = useSyncSettingsStore.getState();
  if (!settings.enabled) {
    return { ok: false, status: 0, error: "sync_disabled" };
  }
  const deviceId = getOrCreateDeviceId();
  return syncOnce(deviceId, auth);
}
