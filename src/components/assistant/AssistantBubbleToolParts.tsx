import { useTranslation } from "react-i18next";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import { tryRenderToolInvocationSpecialContent } from "@/components/shared/tool-invocation-message/tryRenderToolInvocationSpecialContent";
import {
  getToolName,
  type ToolInvocationPart,
} from "@/components/shared/tool-invocation-message/types";

/**
 * Renders map/HTML-preview/Cursor tool calls inside the assistant bubble by
 * reusing the Chats app's special tool renderers in compact mode. Parts whose
 * state has nothing to show yet (e.g. a map search still running) render
 * nothing — the bubble's thinking ticker already covers running states.
 */
export function AssistantBubbleToolParts({
  parts,
  onInteractionChange,
}: {
  parts: ToolInvocationPart[];
  onInteractionChange: (isInteracting: boolean) => void;
}) {
  const { t } = useTranslation();
  const { playElevatorMusic, stopElevatorMusic, playDingSound } =
    useTerminalSounds();

  const rendered = parts
    .map((part, index) =>
      tryRenderToolInvocationSpecialContent({
        toolName: getToolName(part),
        state: part.state,
        input: part.input,
        output: part.output,
        partKey: `assistant-bubble-tool-${part.toolCallId ?? index}`,
        t,
        formatToolName,
        setIsInteractingWithPreview: onInteractionChange,
        playElevatorMusic,
        stopElevatorMusic,
        playDingSound,
        compact: true,
      })
    )
    .filter((node) => node !== null);

  if (rendered.length === 0) return null;

  return (
    // The HTML preview draws its 1px outline as an outset box-shadow, which
    // an overflow-clipping ancestor shaves off at the padding-box edge.
    // The horizontal padding keeps the outline (and rounded corners) fully
    // visible; the preview's own vertical margins cover the top/bottom.
    <div className="max-h-56 overflow-y-auto overflow-x-hidden px-0.5 pb-1">
      {rendered}
    </div>
  );
}
