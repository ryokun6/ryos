import { motion, AnimatePresence } from "framer-motion";
import type { ChatInputViewModel } from "./useChatInput";

type Props = Pick<
  ChatInputViewModel,
  | "t"
  | "isTypingRyoMention"
  | "isInChatRoom"
  | "debugMode"
  | "modelDisplayName"
  | "transcriptionError"
  | "rateLimitError"
>;

export function ChatInputFooter({
  t,
  isTypingRyoMention,
  isInChatRoom,
  debugMode,
  modelDisplayName,
  transcriptionError,
  rateLimitError,
}: Props) {
  return (
    <>
      <AnimatePresence>
        {(isTypingRyoMention ||
          (!isInChatRoom && debugMode && modelDisplayName)) && (
          <motion.div
            key="model-info"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            className="mt-2 px-1 text-xs text-neutral-700 font-geneva-12"
          >
            {isTypingRyoMention
              ? t("apps.chats.status.ryoWillRespond") +
                (debugMode && modelDisplayName ? ` (${modelDisplayName})` : "")
              : t("apps.chats.status.usingModel", { model: modelDisplayName })}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {transcriptionError && (
          <motion.div
            key="transcription-error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            className="mt-1 text-red-600 text-xs font-geneva-12"
          >
            {transcriptionError}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rateLimitError && !isInChatRoom && (
          <motion.div
            key="rate-limit-error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            className="mt-1 text-red-600 text-xs font-geneva-12"
          >
            {rateLimitError.message}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
