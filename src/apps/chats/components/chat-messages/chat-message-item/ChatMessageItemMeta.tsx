import {
  Copy,
  Check,
  Trash,
  SpeakerHigh,
  Pause,
  PaperPlaneRight,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffectiveTimezone } from "@/hooks/useEffectiveTimezone";
import { formatChatMessageTimestamp } from "../../../utils/formatMessageTimestamp";
import { MOTION_BTN_INITIAL } from "../constants";
import type { ChatMessageItemViewModel } from "./useChatMessageItem";

export function ChatMessageItemMeta({ vm }: { vm: ChatMessageItemViewModel }) {
  const timeZone = useEffectiveTimezone();
  const {
    t,
    message,
    messageKey,
    isRoomView,
    isMacOSTheme,
    isAdmin,
    isHovered,
    isCopied,
    isPlaying,
    isSpeechLoading,
    speechEnabled,
    fullAssistantSource,
    displayContent,
    onCopyMessage,
    onDeleteMessage,
    onSendMessage,
    setPlayingMessageId,
    setSpeechLoadingId,
    speakAssistantMessageManually,
    stopSpeech,
  } = vm;

  return (
    <div
      className={`${
        isMacOSTheme ? "text-[10px]" : "text-[16px]"
      } chat-messages-meta text-neutral-500 mb-0.5 font-['Geneva-9'] mb-[-2px] flex items-center gap-2`}
    >
      {message.role === "user" && (
        <>
          {isAdmin && isRoomView && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    initial={MOTION_BTN_INITIAL}
                    animate={{
                      opacity: isHovered ? 1 : 0,
                      scale: 1,
                    }}
                    className="size-3 text-neutral-400 hover:text-red-600 transition-colors select-none"
                    onClick={() => onDeleteMessage(message)}
                    aria-label={t("apps.chats.ariaLabels.deleteMessage")}
                  >
                    <Trash className="size-3" weight="bold" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("apps.chats.messages.delete")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <motion.button
            initial={MOTION_BTN_INITIAL}
            animate={{
              opacity: isHovered ? 1 : 0,
              scale: 1,
            }}
            className="size-3 text-neutral-400 hover:text-neutral-600 transition-colors select-none"
            onClick={() => onCopyMessage(message)}
            aria-label={t("apps.chats.ariaLabels.copyMessage")}
          >
            {isCopied ? (
              <Check className="size-3" weight="bold" />
            ) : (
              <Copy className="size-3" weight="bold" />
            )}
          </motion.button>
        </>
      )}
      <span
        className="max-w-[120px] inline-block overflow-hidden text-ellipsis whitespace-nowrap select-text"
        title={
          message.username ||
          (message.role === "user"
            ? t("apps.chats.messages.you")
            : t("apps.chats.messages.ryo"))
        }
      >
        {message.username ||
          (message.role === "user"
            ? t("apps.chats.messages.you")
            : t("apps.chats.messages.ryo"))}
      </span>{" "}
      <span className="text-neutral-400 select-text">
        {message.metadata?.createdAt ? (
          formatChatMessageTimestamp(
            new Date(message.metadata.createdAt),
            timeZone
          )
        ) : (
          <ActivityIndicator size="xs" />
        )}
      </span>
      {message.role === "assistant" && (
        <>
          <motion.button
            initial={MOTION_BTN_INITIAL}
            animate={{
              opacity: isHovered ? 1 : 0,
              scale: 1,
            }}
            className="size-3 text-neutral-400 hover:text-neutral-600 transition-colors select-none"
            onClick={() => onCopyMessage(message)}
            aria-label={t("apps.chats.ariaLabels.copyMessage")}
          >
            {isCopied ? (
              <Check className="size-3" weight="bold" />
            ) : (
              <Copy className="size-3" weight="bold" />
            )}
          </motion.button>
          {speechEnabled && (
            <motion.button
              initial={MOTION_BTN_INITIAL}
              animate={{
                opacity: isHovered ? 1 : 0,
                scale: 1,
              }}
              className="size-3 text-neutral-400 hover:text-neutral-600 transition-colors select-none"
              onClick={() => {
                if (isPlaying) {
                  stopSpeech();
                  setPlayingMessageId(null);
                  setSpeechLoadingId(null);
                } else {
                  const sourceForHighlight =
                    message.role === "assistant" && fullAssistantSource
                      ? fullAssistantSource
                      : displayContent.trim();
                  if (!sourceForHighlight) {
                    setPlayingMessageId(null);
                    setSpeechLoadingId(null);
                    return;
                  }
                  setSpeechLoadingId(messageKey);
                  setPlayingMessageId(messageKey);
                  speakAssistantMessageManually(
                    messageKey,
                    sourceForHighlight,
                    () => {
                      setPlayingMessageId(null);
                      setSpeechLoadingId(null);
                    }
                  );
                }
              }}
              aria-label={
                isPlaying
                  ? t("apps.chats.ariaLabels.stopSpeech")
                  : t("apps.chats.ariaLabels.speakMessage")
              }
            >
              {isPlaying ? (
                isSpeechLoading ? (
                  <ActivityIndicator size="xs" />
                ) : (
                  <Pause className="size-3" weight="bold" />
                )
              ) : (
                <SpeakerHigh className="size-3" weight="bold" />
              )}
            </motion.button>
          )}
        </>
      )}
      {isRoomView &&
        message.role === "human" &&
        onSendMessage &&
        message.username && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  initial={MOTION_BTN_INITIAL}
                  animate={{
                    opacity: isHovered ? 1 : 0,
                    scale: 1,
                  }}
                  className="size-3 text-neutral-400 hover:text-os-link transition-colors select-none"
                  onClick={() => onSendMessage(message.username!)}
                  aria-label={t("apps.chats.ariaLabels.messageUser", {
                    username: message.username,
                  })}
                >
                  <PaperPlaneRight className="size-3" weight="bold" />
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {t("apps.chats.ariaLabels.messageUser", {
                    username: message.username,
                  })}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      {isAdmin && isRoomView && message.role !== "user" && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                initial={MOTION_BTN_INITIAL}
                animate={{
                  opacity: isHovered ? 1 : 0,
                  scale: 1,
                }}
                className="size-3 text-neutral-400 hover:text-red-600 transition-colors select-none"
                onClick={() => onDeleteMessage(message)}
                aria-label={t("apps.chats.ariaLabels.deleteMessage")}
              >
                <Trash className="size-3" weight="bold" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("apps.chats.messages.delete")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
