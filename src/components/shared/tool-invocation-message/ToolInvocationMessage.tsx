import { useTranslation } from "react-i18next";
import { getToolInvocationCallMessage } from "./getToolInvocationCallMessage";
import { getToolInvocationResultMessage } from "./getToolInvocationResultMessage";
import { tryRenderToolInvocationSpecialContent } from "./tryRenderToolInvocationSpecialContent";
import { ToolInvocationMessageDefaultView } from "./ToolInvocationMessageDefaultView";
import type { ToolInvocationMessageProps } from "./types";
import { getToolName } from "./types";

export function ToolInvocationMessage({
  part,
  partKey,
  getAppName,
  formatToolName,
  setIsInteractingWithPreview,
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
}: ToolInvocationMessageProps) {
  const { t } = useTranslation();
  const toolName = getToolName(part);
  const { state, input, output, toolCallId, approval } = part;

  const displayCallMessage = getToolInvocationCallMessage({
    toolName,
    state,
    input,
    output,
    t,
    getAppName,
    formatToolName,
  });

  const displayResultMessage = getToolInvocationResultMessage({
    toolName,
    state,
    input,
    output,
    t,
    getAppName,
    formatToolName,
  });

  const specialContent = tryRenderToolInvocationSpecialContent({
    toolName,
    toolCallId,
    state,
    input,
    output,
    approval,
    partKey,
    t,
    formatToolName,
    setIsInteractingWithPreview,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
  });
  if (specialContent !== null) {
    return specialContent;
  }

  return (
    <ToolInvocationMessageDefaultView
      partKey={partKey}
      toolName={toolName}
      state={state}
      output={output}
      displayCallMessage={displayCallMessage}
      displayResultMessage={displayResultMessage}
      formatToolName={formatToolName}
    />
  );
}
