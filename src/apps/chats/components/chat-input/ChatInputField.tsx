import { motion, AnimatePresence } from "motion/react";
import { Input } from "@/components/ui/input";
import { Hand, At, ImageSquare, Microphone } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatedEllipsis } from "./AnimatedEllipsis";
import type { ChatInputViewModel } from "./useChatInput";

type Props = Pick<
  ChatInputViewModel,
  | "t"
  | "input"
  | "inputRef"
  | "imageInputRef"
  | "audioButtonRef"
  | "isMacTheme"
  | "isAquaGlass"
  | "isLoading"
  | "isTranscribing"
  | "needsUsername"
  | "isInChatRoom"
  | "isOffline"
  | "isFocused"
  | "setIsFocused"
  | "isTouchDevice"
  | "isTypingRyoMention"
  | "showNudgeButton"
  | "isProcessingImage"
  | "handleInputChangeWithSound"
  | "handleNudgeClick"
  | "handleMentionClick"
>;

export function ChatInputField({
  t,
  input,
  inputRef,
  imageInputRef,
  audioButtonRef,
  isMacTheme,
  isAquaGlass,
  isLoading,
  isTranscribing,
  needsUsername,
  isInChatRoom,
  isOffline,
  isFocused,
  setIsFocused,
  isTouchDevice,
  isTypingRyoMention,
  showNudgeButton,
  isProcessingImage,
  handleInputChangeWithSound,
  handleNudgeClick,
  handleMentionClick,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="flex-1 relative"
    >
      <Input
        ref={inputRef}
        value={input}
        onChange={handleInputChangeWithSound}
        placeholder={
          isLoading
            ? ""
            : isTranscribing
              ? t("apps.chats.status.transcribing")
              : needsUsername && !isInChatRoom
                ? t("apps.chats.status.createAccountToContinue")
                : isFocused || isTouchDevice
                  ? t("apps.chats.status.typeMessage")
                  : t("apps.chats.status.typeOrPushSpace")
        }
        className={`w-full border-1 border-neutral-800 text-xs font-geneva-12 h-9 ${
          isMacTheme ? "pl-3 pr-[88px] rounded-full" : "pl-2 pr-[88px]"
        } backdrop-blur-lg ${
          isAquaGlass ? "bg-white/40" : "bg-white/80"
        } ${isFocused ? "input--focused" : ""} ${
          isTypingRyoMention ? "border-blue-600 bg-blue-50" : ""
        } ${
          needsUsername && !isInChatRoom
            ? "border-orange-600 bg-orange-50"
            : ""
        }`}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onTouchStart={(e) => {
          e.preventDefault();
        }}
        disabled={(needsUsername && !isInChatRoom) || isOffline}
      />
      <AnimatePresence>
        {isLoading && input.trim() === "" && (
          <motion.div
            key="thinking-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute top-0 left-0 size-full pointer-events-none flex items-center pl-3"
          >
            <span className="text-neutral-500 opacity-70 shimmer-gray text-[13px] font-geneva-12">
              {t("apps.chats.status.thinking")}
              <AnimatedEllipsis />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {showNudgeButton && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleNudgeClick}
                    className={`size-[22px] flex items-center justify-center ${
                      isMacTheme
                        ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                        : ""
                    }`}
                    disabled={isLoading}
                    aria-label={t("apps.chats.ariaLabels.sendNudge")}
                  >
                    <Hand className="size-4 -rotate-40" weight="bold" />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("apps.chats.ariaLabels.sendNudge")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isInChatRoom && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleMentionClick}
                    className={`size-[22px] flex items-center justify-center ${
                      isMacTheme
                        ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                        : ""
                    }`}
                    disabled={isLoading}
                    aria-label={t("apps.chats.ariaLabels.mentionRyo")}
                  >
                    <At className="size-4" weight="bold" />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("apps.chats.ariaLabels.mentionRyo")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {!isInChatRoom && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className={`size-[22px] flex items-center justify-center ${
                    isMacTheme
                      ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                      : ""
                  } ${isProcessingImage ? "animate-pulse" : ""}`}
                  disabled={isLoading || isProcessingImage}
                  aria-label={
                    t("apps.chats.ariaLabels.attachImage") || "Attach image"
                  }
                >
                  <ImageSquare className="size-4" weight="bold" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isProcessingImage
                    ? t("apps.chats.status.processingImage") ||
                      "Processing image..."
                    : t("apps.chats.ariaLabels.attachImage") || "Attach image"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => audioButtonRef.current?.click()}
                className={`size-[22px] flex items-center justify-center ${
                  isMacTheme
                    ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                    : ""
                }`}
                disabled={isTranscribing}
                aria-label={t("apps.chats.ariaLabels.pushToTalk")}
              >
                <Microphone className="size-4" weight="bold" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("apps.chats.ariaLabels.pushToTalk")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </motion.div>
  );
}
