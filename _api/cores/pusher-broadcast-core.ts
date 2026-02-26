import type { CoreResponse } from "../_runtime/core-types.js";

interface BroadcastRequest {
  channel: string;
  event: string;
  data: unknown;
}

interface PusherBroadcastCoreInput {
  method: string | undefined;
  providedInternalSecret: string | string[] | undefined;
  expectedInternalSecret: string | undefined;
  body: unknown;
  trigger: (channel: string, event: string, data: unknown) => Promise<void>;
}

export async function executePusherBroadcastCore(
  input: PusherBroadcastCoreInput
): Promise<CoreResponse> {
  if (input.providedInternalSecret !== input.expectedInternalSecret) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  if (input.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  const { channel, event, data } = (input.body || {}) as BroadcastRequest;
  if (!channel || !event) {
    return { status: 400, body: { error: "Channel and event are required" } };
  }

  try {
    await input.trigger(channel, event, data);
    return { status: 200, body: { success: true } };
  } catch {
    return { status: 500, body: { error: "Failed to broadcast" } };
  }
}
