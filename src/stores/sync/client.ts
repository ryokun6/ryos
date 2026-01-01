import { getApiUrl } from "@/utils/platform";
import type { SnapshotEnvelope, StoreSnapshot } from "./types";

type AuthHeaders = { authToken?: string; username?: string };

const SYNC_ENDPOINT = "/api/user-sync";

function buildHeaders(auth?: AuthHeaders): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (auth?.authToken) headers["Authorization"] = `Bearer ${auth.authToken}`;
  if (auth?.username) headers["X-Username"] = auth.username;
  return headers;
}

export async function pushSnapshots(
  envelope: SnapshotEnvelope,
  auth?: AuthHeaders
): Promise<Response> {
  const url = getApiUrl(`${SYNC_ENDPOINT}?action=push`);
  return fetch(url, {
    method: "POST",
    headers: buildHeaders(auth),
    body: JSON.stringify(envelope),
  });
}

export async function pullSnapshots(
  auth?: AuthHeaders
): Promise<{ snapshots: StoreSnapshot[] }> {
  const url = getApiUrl(`${SYNC_ENDPOINT}?action=pull`);
  const resp = await fetch(url, { headers: buildHeaders(auth) });
  if (!resp.ok) {
    const message = resp.statusText || "pull_failed";
    throw new Error(`Sync pull failed: ${resp.status} ${message}`);
  }
  return resp.json() as Promise<{ snapshots: StoreSnapshot[] }>;
}

export async function deleteRemoteSnapshots(auth?: AuthHeaders): Promise<Response> {
  const url = getApiUrl(`${SYNC_ENDPOINT}?action=delete`);
  return fetch(url, {
    method: "POST",
    headers: buildHeaders(auth),
    body: JSON.stringify({}),
  });
}
