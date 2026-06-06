import { CaretDown } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { useThemeFlags } from "@/hooks/useThemeFlags";

export function ScrollToBottomButton() {
  const { t } = useTranslation();
  const { isMacOSTheme: isMacTheme, isDarkMode } = useThemeFlags();
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    <AnimatePresence>
      {!isAtBottom && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ type: "spring", duration: 0.2 }}
          className={`chat-scroll-to-bottom-btn absolute bottom-14 right-3 rounded-full z-20 flex items-center justify-center cursor-pointer select-none ${
            isMacTheme ? "relative overflow-hidden" : ""
          }`}
          style={{
            position: "absolute",
            bottom: "56px",
            right: `calc(12px + var(--sbw, 0px))`,
            width: 28,
            height: 28,
            background: isMacTheme
              ? "linear-gradient(rgba(160,160,160,0.625), rgba(255,255,255,0.625))"
              : "#ffffff",
            boxShadow: isMacTheme
              ? "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px #bbbbbb"
              : "0 1px 2px rgba(0,0,0,0.25)",
            border: isMacTheme ? undefined : "1px solid rgba(0,0,0,0.3)",
            backdropFilter: isMacTheme ? "blur(2px)" : undefined,
          }}
          onClick={() => scrollToBottom()}
          aria-label={t("apps.chats.status.scrollToBottom")}
        >
          {isMacTheme && (
            <>
              <div
                className="chat-scroll-to-bottom-gloss-top pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  top: "2px",
                  height: "30%",
                  width: "calc(100% - 12px)",
                  borderRadius: "12px 12px 4px 4px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.25))",
                  filter: "blur(0.2px)",
                  zIndex: 2,
                }}
              />
              <div
                className="chat-scroll-to-bottom-gloss-bottom pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: "1px",
                  height: "38%",
                  width: "calc(100% - 4px)",
                  borderRadius: "4px 4px 8px 8px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                  filter: "blur(0.3px)",
                  zIndex: 1,
                }}
              />
            </>
          )}
          <CaretDown
            className={`size-2.5 ${
              isMacTheme ? "relative z-10" : ""
            } ${
              isMacTheme && isDarkMode
                ? "text-white"
                : isMacTheme
                  ? "text-black/70"
                  : "text-neutral-800"
            }`}
            weight="bold"
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
