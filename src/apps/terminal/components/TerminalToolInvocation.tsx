import { Check } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { getToolInvocationCallMessage } from "@/components/shared/tool-invocation-message/getToolInvocationCallMessage";
import { getToolInvocationResultMessage } from "@/components/shared/tool-invocation-message/getToolInvocationResultMessage";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import { getTranslatedAppName, type AppId } from "@/utils/i18n";
import type { ToolInvocationData } from "../types";

function getAppName(id?: string): string {
  if (!id) return "app";
  return getTranslatedAppName(id as AppId);
}

interface TerminalToolInvocationProps {
  invocation: ToolInvocationData;
  fontSize?: number;
}

export function TerminalToolInvocation({
  invocation,
  fontSize,
}: TerminalToolInvocationProps) {
  const { t } = useTranslation();
  const { toolName, input, output } = invocation;
  const state = invocation.state ?? "input-streaming";

  if (toolName === "aquarium") return null;

  const displayCallMessage = getToolInvocationCallMessage({
    toolName,
    state,
    input,
    output,
    t,
    getAppName,
    formatToolName,
  });
  const displayResultMessage =
    state === "output-error"
      ? t("apps.chats.toolCalls.toolAttempted", {
          toolName: formatToolName(toolName),
        })
      : getToolInvocationResultMessage({
          toolName,
          state,
          input,
          output,
          t,
          getAppName,
          formatToolName,
        });

  if (!displayCallMessage && !displayResultMessage) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-neutral-400 py-0.5 select-text terminal-tool-invocation"
      style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
    >
      {state === "output-available" && displayResultMessage ? (
        <>
          <Check
            className="size-3 flex-shrink-0"
            style={{
              color: "var(--os-accent-color, var(--os-color-selection-bg))",
            }}
            weight="bold"
          />
          <span className="italic">{displayResultMessage}</span>
        </>
      ) : state === "output-error" ? (
        <>
          <Check
            className="size-3 shrink-0 text-neutral-500 flex-shrink-0"
            weight="bold"
            aria-hidden
          />
          <span className="italic text-neutral-500">
            {displayResultMessage}
          </span>
        </>
      ) : displayCallMessage ? (
        <>
          <ActivityIndicator
            size="xs"
            className="text-purple-400 flex-shrink-0"
          />
          <span className="italic shimmer">{displayCallMessage}</span>
        </>
      ) : null}
    </div>
  );
}
