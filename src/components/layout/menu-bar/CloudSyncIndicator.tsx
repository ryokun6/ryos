import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";

export function CloudSyncIndicator() {
  const { t } = useTranslation();
  const {
    isWindowsTheme: isXpTheme,
    isMacOSTheme,
    isSystem7Theme,
  } = useThemeFlags();
  const isPhone = useIsPhone();
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCloudSyncActive = useCloudSyncStore(
    (state) =>
      state.isCheckingRemote ||
      Object.values(state.domainStatus).some(
        (status) => status.isUploading || status.isDownloading
      )
  );

  const syncLabel = t("apps.control-panels.autoSync.title");

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
        tooltipTimeoutRef.current = null;
      }
    };
  }, []);

  const showTapTooltip = useCallback(() => {
    if (!isPhone) return;
    setIsTooltipVisible(true);
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = setTimeout(() => {
      setIsTooltipVisible(false);
      tooltipTimeoutRef.current = null;
    }, 1600);
  }, [isPhone]);

  if (isXpTheme || !isCloudSyncActive) return null;

  return (
    <AnimatePresence initial={false}>
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="relative flex items-center justify-center px-1 py-0.5"
        style={{ marginRight: "2px" }}
        title={syncLabel}
        aria-label={syncLabel}
        role="status"
        aria-live="polite"
        onClick={showTapTooltip}
      >
        <AnimatePresence>
          {isTooltipVisible && (
            <motion.span
              initial={{ opacity: 0, y: 4, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 2, x: "-50%" }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="pointer-events-none absolute left-1/2 -top-8 z-50 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-xs text-white shadow-md"
            >
              {syncLabel}
            </motion.span>
          )}
        </AnimatePresence>
        <ArrowsClockwise
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin"
          weight="bold"
          style={{
            opacity: isSystem7Theme ? 1 : 0.82,
            textShadow: isMacOSTheme
              ? "0 2px 3px rgba(0, 0, 0, 0.25)"
              : undefined,
          }}
        />
      </motion.button>
    </AnimatePresence>
  );
}
