import { motion } from "framer-motion";
import type { ChatInputViewModel } from "./useChatInput";

type Props = Pick<
  ChatInputViewModel,
  | "t"
  | "isMacTheme"
  | "isXpTheme"
  | "waveformBars"
  | "waveformIsSilent"
>;

export function ChatInputRecordingUI({
  t,
  isMacTheme,
  isXpTheme,
  waveformBars,
  waveformIsSilent,
}: Props) {
  return (
    <motion.div
      key="recording-ui"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={`flex-1 relative h-9 flex items-center px-3 gap-2 ${
        isMacTheme ? "rounded-full" : isXpTheme ? "rounded-none" : "rounded-md"
      }`}
      style={
        isMacTheme
          ? {
              border: "1px solid rgba(0, 0, 0, 0.2)",
              backgroundColor: "rgba(255, 255, 255, 1)",
              boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.1)",
            }
          : isXpTheme
            ? {
                border: "1px solid #7f9db9",
                backgroundColor: "white",
              }
            : {
                border: "1px solid #000",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
              }
      }
    >
      <div className="flex items-center shrink-0">
        <span className="text-muted-foreground text-xs font-geneva-12">
          {t("apps.chats.status.listening")}
        </span>
      </div>
      <div className="flex-1 flex items-center h-full overflow-hidden">
        <div
          className="flex gap-[2px] items-center justify-between w-full"
          style={{ opacity: waveformIsSilent ? 0.4 : 1 }}
        >
          {waveformBars.map((bar) => (
            <motion.div
              key={bar.barKey}
              className="flex-1 max-w-[2px] rounded-full origin-center bg-neutral-300"
              initial={{ scaleY: 0.3 }}
              animate={{
                scaleY: waveformIsSilent
                  ? 0.3
                  : Math.max(0.3, Math.min(bar.freq * 2, 1)),
              }}
              style={{
                height: 20,
              }}
              transition={{
                type: "spring",
                bounce: 0.5,
                duration: 0.12,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
