import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../_utils/_validation.js";
import {
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../listen/_helpers/_redis.js";
import type { SyncSessionRequest } from "../listen/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ListenSyncCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  sessionId: string | undefined;
  body: unknown;
  onDjChanged?: (
    sessionId: string,
    payload: { previousDj: string; newDj: string }
  ) => Promise<void>;
  onSync?: (
    sessionId: string,
    payload: {
      currentTrackId: string | null;
      currentTrackMeta: { title: string; artist?: string; cover?: string } | null;
      isPlaying: boolean;
      positionMs: number;
      timestamp: number;
      djUsername: string;
      listenerCount: number;
    }
  ) => Promise<void>;
}

export async function executeListenSyncCore(
  input: ListenSyncCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (input.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  if (!input.sessionId) {
    return { status: 400, body: { error: "Session ID is required" } };
  }

  const body = input.body as SyncSessionRequest;
  const username = body?.username?.toLowerCase();
  const state = body?.state;

  if (!username) {
    return { status: 400, body: { error: "Username is required" } };
  }

  if (!state) {
    return { status: 400, body: { error: "Sync state is required" } };
  }

  try {
    assertValidUsername(username, "listen-sync");
    assertValidRoomId(input.sessionId, "listen-sync");
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Validation error" },
    };
  }

  if (isProfaneUsername(username)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (typeof state.isPlaying !== "boolean" || typeof state.positionMs !== "number") {
    return { status: 400, body: { error: "Invalid sync payload" } };
  }

  try {
    const session = await getSession(input.sessionId);
    if (!session) {
      return { status: 404, body: { error: "Session not found" } };
    }

    if (!session.users.some((user) => user.username === username)) {
      return { status: 403, body: { error: "User not in session" } };
    }

    if (session.djUsername !== username) {
      return { status: 403, body: { error: "Only the DJ can sync playback" } };
    }

    const now = getCurrentTimestamp();
    const nextTrackId = state.currentTrackId ?? null;
    const nextTrackMeta = state.currentTrackMeta ?? null;

    session.currentTrackId = nextTrackId;
    session.currentTrackMeta = nextTrackMeta;
    session.isPlaying = state.isPlaying;
    session.positionMs = Math.max(0, Math.floor(state.positionMs));
    session.lastSyncAt = now;

    if (state.djUsername && state.djUsername.toLowerCase() !== session.djUsername) {
      const nextDj = state.djUsername.toLowerCase();
      const isValidDj = session.users.some((user) => user.username === nextDj);
      if (!isValidDj) {
        return { status: 400, body: { error: "DJ must be an active session member" } };
      }

      const previousDj = session.djUsername;
      session.djUsername = nextDj;
      if (input.onDjChanged) {
        await input.onDjChanged(input.sessionId, { previousDj, newDj: nextDj });
      }
    }

    await setSession(input.sessionId, session);

    const listenerCount =
      session.users.length + (session.anonymousListeners?.length ?? 0);

    if (input.onSync) {
      await input.onSync(input.sessionId, {
        currentTrackId: session.currentTrackId,
        currentTrackMeta: session.currentTrackMeta,
        isPlaying: session.isPlaying,
        positionMs: session.positionMs,
        timestamp: now,
        djUsername: session.djUsername,
        listenerCount,
      });
    }

    return { status: 200, body: { success: true } };
  } catch {
    return { status: 500, body: { error: "Failed to sync session" } };
  }
}
