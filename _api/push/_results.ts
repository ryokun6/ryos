import type { ApnsSendResult } from "../_utils/_push-apns.js";

export interface PushSendSummary {
  successCount: number;
  failureCount: number;
  failureReasons: Record<string, number>;
}

export function getFailureReason(result: ApnsSendResult): string | null {
  if (result.ok) return null;
  if (typeof result.reason === "string" && result.reason.length > 0) {
    return result.reason;
  }
  return `HTTP_${result.status}`;
}

export function summarizePushSendResults(results: ApnsSendResult[]): PushSendSummary {
  let successCount = 0;
  let failureCount = 0;
  const failureReasons: Record<string, number> = {};

  for (const result of results) {
    if (result.ok) {
      successCount += 1;
      continue;
    }

    failureCount += 1;
    const reason = getFailureReason(result) || "UNKNOWN";
    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
  }

  return {
    successCount,
    failureCount,
    failureReasons,
  };
}
