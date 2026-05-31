import { Check } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { ToolInvocationStatusRow } from "./ToolInvocationStatusRow";
import type { ToolInvocationPart } from "./types";

export interface ToolInvocationMessageDefaultViewProps {
  partKey: string;
  toolName: string;
  state: ToolInvocationPart["state"];
  output?: unknown;
  displayCallMessage: string | null;
  displayResultMessage: string | null;
  formatToolName: (name: string) => string;
}

export function ToolInvocationMessageDefaultView({
  partKey,
  toolName,
  state,
  output,
  displayCallMessage,
  displayResultMessage,
  formatToolName,
}: ToolInvocationMessageDefaultViewProps) {
  const { t } = useTranslation();
  // Default rendering for other tools
  const toolAttemptedLabel = t("apps.chats.toolCalls.toolAttempted", {
    toolName: formatToolName(toolName),
  });

  return (
    <div key={partKey} className="mb-0 px-1 py-0.5 italic text-[12px]">
      {(state === "input-streaming" || state === "input-available") &&
        !output && (
          <ToolInvocationStatusRow
            icon={<ActivityIndicator size="xs" className="text-neutral-500 dark:text-neutral-400" />}
            className="text-neutral-700 dark:text-neutral-200"
          >
            {displayCallMessage ? (
              <span className="shimmer">{displayCallMessage}</span>
            ) : (
              <span>
                {t("apps.chats.toolCalls.calling", {
                  toolName: formatToolName(toolName),
                })}
              </span>
            )}
          </ToolInvocationStatusRow>
        )}
      {state === "output-available" && (
        <ToolInvocationStatusRow
          icon={<Check className="size-3 text-blue-600 dark:text-blue-400" weight="bold" />}
          className="text-neutral-700 dark:text-neutral-200"
          align="start"
        >
          {displayResultMessage ? (
            <span>{displayResultMessage}</span>
          ) : (
            <div className="flex flex-col">
              {typeof output === "string" && output.length > 0 ? (
                <span className="text-neutral-500 dark:text-neutral-400">{output}</span>
              ) : (
                <span>{formatToolName(toolName)}</span>
              )}
            </div>
          )}
        </ToolInvocationStatusRow>
      )}
      {state === "output-error" && (
        <ToolInvocationStatusRow
          icon={
            <Check
              className="size-3 shrink-0 text-neutral-400 dark:text-neutral-500"
              weight="bold"
              aria-hidden
            />
          }
          className="text-neutral-500 dark:text-neutral-400"
        >
          <span>{toolAttemptedLabel}</span>
        </ToolInvocationStatusRow>
      )}
    </div>
  );
}
