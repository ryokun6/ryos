import { motion } from "framer-motion";
import {
  ToolInvocationMessage,
  type ToolInvocationPart,
} from "@/components/shared/ToolInvocationMessage";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import { getVisibleTextPartText } from "../../../utils/aiMessageText";
import {
  Streamdown,
  CHAT_STREAMDOWN_ANIMATED,
  CHAT_STREAMDOWN_PLUGINS,
  CHAT_STREAMDOWN_SHIKI_THEME,
  STREAMDOWN_DISALLOWED_ELEMENTS,
  chatStreamdownComponents,
  getChatMessageStyle,
} from "../streamdown";
import { getAppName, isEmojiOnly } from "../utils";
import type { ChatMessageItemViewModel } from "./useChatMessageItem";

function AssistantMarkdown({
  content,
  keyPrefix,
  isUrgent,
  isStreamingMessage,
}: {
  content: string;
  keyPrefix: string;
  isUrgent: boolean;
  isStreamingMessage: boolean;
}) {
  if (!content.trim()) return null;
  return (
    <Streamdown
      key={`${keyPrefix}-full`}
      className={`ryos-chat-streamdown ${
        isUrgent ? "ryos-chat-streamdown-urgent" : ""
      }`}
      components={chatStreamdownComponents}
      disallowedElements={STREAMDOWN_DISALLOWED_ELEMENTS}
      controls={false}
      lineNumbers={false}
      shikiTheme={CHAT_STREAMDOWN_SHIKI_THEME}
      plugins={CHAT_STREAMDOWN_PLUGINS}
      skipHtml
      unwrapDisallowed
      mode={isStreamingMessage ? "streaming" : "static"}
      animated={CHAT_STREAMDOWN_ANIMATED}
      isAnimating={isStreamingMessage}
      parseIncompleteMarkdown={isStreamingMessage}
    >
      {content}
    </Streamdown>
  );
}

export function ChatMessageItemAssistantParts({
  vm,
}: {
  vm: ChatMessageItemViewModel;
}) {
  const {
    t,
    message,
    messageKey,
    isStaticGreeting,
    isStreamingMessage,
    isLoading,
    isUrgent,
    fontSize,
    assistantContentRef,
    handleStreamdownAnimationStart,
    setIsInteractingWithPreview,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
  } = vm;

  return (
    <motion.div
      ref={assistantContentRef}
      className="select-text flex flex-col gap-1"
    >
      {message.parts?.map(
        (
          part: ToolInvocationPart | { type: string; text?: string },
          partIndex: number
        ) => {
          const partKey = `${messageKey}-part-${partIndex}`;
          switch (part.type) {
            case "text": {
              const partText =
                (part as { type: string; text?: string }).text ||
                (isStaticGreeting ? t("apps.chats.messages.greeting") : "");
              const hasXmlTags =
                /<textedit:(insert|replace|delete)/i.test(partText);
              if (hasXmlTags) {
                const openTags = (
                  partText.match(/<textedit:(insert|replace|delete)/g) || []
                ).length;
                const closeTags = (
                  partText.match(
                    /<\/textedit:(insert|replace)>|<textedit:delete[^>]*\/>/g
                  ) || []
                ).length;
                if (openTags !== closeTags) {
                  return (
                    <span key={partKey} className="select-text italic">
                      {t("apps.chats.status.editing")}
                    </span>
                  );
                }
              }
              const rawPartContent = getVisibleTextPartText(partText);
              const partDisplayContent = decodeHtmlEntities(rawPartContent);
              const textContent = partDisplayContent;
              const isEmojiMessage = isEmojiOnly(textContent);
              return (
                <div
                  key={partKey}
                  className="w-full"
                  style={getChatMessageStyle(fontSize, isEmojiMessage)}
                  onAnimationStart={
                    isStreamingMessage
                      ? handleStreamdownAnimationStart
                      : undefined
                  }
                >
                  <AssistantMarkdown
                    content={textContent}
                    keyPrefix={partKey}
                    isUrgent={isUrgent}
                    isStreamingMessage={isStreamingMessage}
                  />
                </div>
              );
            }
            default: {
              if (part.type.startsWith("tool-")) {
                const toolPart = part as ToolInvocationPart;
                const toolName = part.type.slice(5);
                if (toolName === "aquarium") return null;
                return (
                  <ToolInvocationMessage
                    key={partKey}
                    part={toolPart}
                    partKey={partKey}
                    isLoading={isLoading}
                    getAppName={getAppName}
                    formatToolName={formatToolName}
                    setIsInteractingWithPreview={setIsInteractingWithPreview}
                    playElevatorMusic={playElevatorMusic}
                    stopElevatorMusic={stopElevatorMusic}
                    playDingSound={playDingSound}
                  />
                );
              }
              return null;
            }
          }
        }
      )}
    </motion.div>
  );
}
