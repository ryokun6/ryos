import { apiRequest } from "@/api/core";

export interface CursorRunStatusResponse {
  events?: unknown[];
  done?: boolean;
  meta?: {
    agentId?: unknown;
    agentTitle?: unknown;
    prUrl?: unknown;
    nextRunId?: unknown;
    activeRunId?: unknown;
    terminalStatus?: unknown;
  };
  terminal?: { prUrl?: unknown } | null;
}

export interface CursorRunFollowupResponse {
  runId?: string;
  agentId?: string;
  previousRunId?: string;
  message?: string;
}

export async function getCursorRunStatus(
  runId: string
): Promise<CursorRunStatusResponse> {
  return apiRequest<CursorRunStatusResponse>({
    path: "/api/ai/cursor-run-status",
    method: "GET",
    query: { runId },
    timeout: 25000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function sendCursorRunFollowup(params: {
  runId: string;
  prompt: string;
}): Promise<CursorRunFollowupResponse> {
  return apiRequest<CursorRunFollowupResponse, {
    runId: string;
    prompt: string;
  }>({
    path: "/api/ai/cursor-run-followup",
    method: "POST",
    body: params,
    timeout: 30000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
