import type { ToolContext, ToolOutputPayload } from "./types";

export type DispatchToolCallResult =
  | { kind: "none" }
  | {
      kind: "opened-app";
      toolName: string;
      toolCallId: string;
      instanceId: string;
    };

interface CreateToolOpenResultTrackerOptions {
  toolName: string;
  toolCallId: string;
  context: ToolContext;
  onOpenAttempt?: (instanceId: string) => void;
}

export interface ToolOpenResultTracker {
  context: ToolContext;
  recordOpenedInstance: (instanceId: string) => void;
  getResult: () => DispatchToolCallResult;
}

/**
 * Captures app instances opened by a client-side tool without changing the
 * tool handlers' output contract. A launch only becomes an open result when
 * the tool completes without reporting an output error.
 */
export function createToolOpenResultTracker({
  toolName,
  toolCallId,
  context,
  onOpenAttempt,
}: CreateToolOpenResultTrackerOptions): ToolOpenResultTracker {
  let openedInstanceId: string | null = null;
  let failed = false;

  const recordOpenedInstance = (instanceId: string) => {
    if (!instanceId) return;
    openedInstanceId = instanceId;
    onOpenAttempt?.(instanceId);
  };

  const trackedContext: ToolContext = {
    launchApp: (appId, options) => {
      const instanceId = context.launchApp(appId, options);
      recordOpenedInstance(instanceId);
      return instanceId;
    },
    addToolOutput: (payload: ToolOutputPayload) => {
      if (payload.state === "output-error") failed = true;
      context.addToolOutput(payload);
    },
  };

  return {
    context: trackedContext,
    recordOpenedInstance,
    getResult: () =>
      openedInstanceId && !failed
        ? {
            kind: "opened-app",
            toolName,
            toolCallId,
            instanceId: openedInstanceId,
          }
        : { kind: "none" },
  };
}
