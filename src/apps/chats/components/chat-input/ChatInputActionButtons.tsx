import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "@phosphor-icons/react";
import type { ChatInputViewModel } from "./useChatInput";

type Props = Pick<
  ChatInputViewModel,
  | "input"
  | "selectedImage"
  | "isMacTheme"
  | "isXpTheme"
  | "isLoading"
  | "isOffline"
  | "isRecording"
  | "isSpeechPlaying"
  | "handleStopClick"
>;

export function ChatInputStopButton({
  isMacTheme,
  isXpTheme,
  handleStopClick,
}: Pick<Props, "isMacTheme" | "isXpTheme" | "handleStopClick">) {
  return (
    <motion.div
      key="stop"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Button
        type="button"
        onClick={handleStopClick}
        className={`chat-stop-btn text-xs size-9 p-0 flex items-center justify-center ${
          isMacTheme ? "rounded-full" : "rounded-none"
        } ${
          isMacTheme
            ? "relative overflow-hidden transition-transform hover:scale-105"
            : isXpTheme
              ? "text-black"
              : "bg-black hover:bg-black/80 text-white border-2 border-neutral-800"
        }`}
        style={
          isMacTheme
            ? {
                background:
                  "linear-gradient(rgba(254, 205, 211, 0.9), rgba(252, 165, 165, 0.9))",
                boxShadow:
                  "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(254, 205, 211, 0.5)",
                backdropFilter: "blur(2px)",
              }
            : {}
        }
      >
        {isMacTheme && (
          <>
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{
                top: "2px",
                height: "30%",
                width: "calc(100% - 18px)",
                borderRadius: "8px 8px 4px 4px",
                background:
                  "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.25))",
                filter: "blur(0.2px)",
                zIndex: 2,
              }}
            />
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{
                bottom: "1px",
                height: "38%",
                width: "calc(100% - 4px)",
                borderRadius: "4px 4px 100% 100%",
                background:
                  "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                filter: "blur(0.3px)",
                zIndex: 1,
              }}
            />
          </>
        )}
        <Square
          className={`chat-stop-glyph size-4 ${
            isMacTheme
              ? "text-black/70 relative z-10"
              : isXpTheme
                ? "text-black"
                : ""
          }`}
          weight="fill"
        />
      </Button>
    </motion.div>
  );
}

export function ChatInputSendButton({
  isMacTheme,
  isXpTheme,
  isLoading,
  isOffline,
}: Pick<Props, "isMacTheme" | "isXpTheme" | "isLoading" | "isOffline">) {
  return (
    <motion.div
      key="send"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Button
        type="submit"
        className={`text-xs size-9 p-0 flex items-center justify-center ${
          isMacTheme ? "rounded-full" : "rounded-none"
        } ${
          isMacTheme
            ? "relative overflow-hidden transition-transform hover:scale-105"
            : isXpTheme
              ? "text-black"
              : "bg-black hover:bg-black/80 text-white border-2 border-neutral-800"
        }`}
        style={
          isMacTheme
            ? {
                background:
                  "linear-gradient(rgba(217, 249, 157, 0.9), rgba(190, 227, 120, 0.9))",
                boxShadow:
                  "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(217, 249, 157, 0.5)",
                backdropFilter: "blur(2px)",
              }
            : {}
        }
        disabled={isLoading || isOffline}
      >
        {isMacTheme && (
          <>
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{
                top: "2px",
                height: "30%",
                width: "calc(100% - 16px)",
                borderRadius: "12px 12px 4px 4px",
                background:
                  "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.25))",
                filter: "blur(0.2px)",
                zIndex: 2,
              }}
            />
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{
                bottom: "1px",
                height: "38%",
                width: "calc(100% - 4px)",
                borderRadius: "4px 4px 100% 100%",
                background:
                  "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                filter: "blur(0.3px)",
                zIndex: 1,
              }}
            />
          </>
        )}
        <ArrowUp
          className={`chat-submit-glyph size-4 ${
            isMacTheme
              ? "text-black/70 relative z-10"
              : isXpTheme
                ? "text-black"
                : ""
          }`}
          weight="bold"
        />
      </Button>
    </motion.div>
  );
}

export function ChatInputActionButtons(props: Props) {
  const {
    input,
    selectedImage,
    isLoading,
    isSpeechPlaying,
    isRecording,
    isOffline,
    isMacTheme,
    isXpTheme,
    handleStopClick,
  } = props;

  if (isLoading || isSpeechPlaying || isRecording) {
    return (
      <ChatInputStopButton
        isMacTheme={isMacTheme}
        isXpTheme={isXpTheme}
        handleStopClick={handleStopClick}
      />
    );
  }

  if (input.trim() !== "" || selectedImage) {
    return (
      <ChatInputSendButton
        isMacTheme={isMacTheme}
        isXpTheme={isXpTheme}
        isLoading={isLoading}
        isOffline={isOffline}
      />
    );
  }

  return null;
}
