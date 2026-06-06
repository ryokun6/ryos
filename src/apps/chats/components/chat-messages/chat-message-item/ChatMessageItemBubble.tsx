import { motion } from "framer-motion";
import { TypingDots } from "../../TypingBubble";
import {
  Streamdown,
  CHAT_STREAMDOWN_PLUGINS,
  CHAT_STREAMDOWN_SHIKI_THEME,
  STREAMDOWN_DISALLOWED_ELEMENTS,
  chatStreamdownComponents,
  getChatMessageStyle,
} from "../streamdown";
import { isEmojiOnly } from "../utils";
import { ChatMessageItemAssistantParts } from "./ChatMessageItemAssistantParts";
import type { ChatMessageItemViewModel } from "./useChatMessageItem";

export function ChatMessageItemBubble({
  vm,
}: {
  vm: ChatMessageItemViewModel;
}) {
  const {
    message,
    showTypingDots,
    isUrgent,
    bgColorClass,
    displayContent,
    fontSize,
  } = vm;

  return (
    <motion.div
      initial={
        isUrgent
          ? {
              opacity: 0,
              backgroundColor: "#bfdbfe",
              color: "#111827",
            }
          : { opacity: 0 }
      }
      animate={
        isUrgent
          ? {
              opacity: 1,
              backgroundColor: ["#bfdbfe", "#fecaca", "#fee2e2"],
              color: ["#111827", "#b91c1c", "#b91c1c"],
            }
          : { opacity: 1 }
      }
      transition={
        isUrgent
          ? {
              opacity: { duration: 0.12, ease: "easeOut" },
              backgroundColor: {
                duration: 0.9,
                ease: "easeInOut",
                times: [0, 0.5, 1],
              },
              color: {
                duration: 0.9,
                ease: "easeInOut",
                times: [0, 0.5, 1],
              },
            }
          : undefined
      }
      className={`p-1.5 px-2 chat-bubble ${
        showTypingDots
          ? "bg-neutral-200 text-neutral-400"
          : bgColorClass ||
            (message.role === "user"
              ? "bg-yellow-100 text-black"
              : "chat-bubble-assistant")
      } w-fit max-w-[90%] min-h-[12px] rounded leading-snug font-geneva-12 break-words select-text`}
      style={getChatMessageStyle(fontSize)}
    >
      {showTypingDots ? (
        <TypingDots />
      ) : message.role === "assistant" ? (
        <ChatMessageItemAssistantParts vm={vm} />
      ) : (
        displayContent && (
          <div
            className="select-text"
            style={getChatMessageStyle(fontSize, isEmojiOnly(displayContent))}
          >
            <Streamdown
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
              mode="static"
            >
              {displayContent}
            </Streamdown>
          </div>
        )
      )}
    </motion.div>
  );
}
