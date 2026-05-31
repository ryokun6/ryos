import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Play, Pause, VinylRecord } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { AquaShineOverlay } from "./AquaShineOverlay";
import type { CoverFlowController } from "./useCoverFlowController";

type TrackInfoController = Pick<
  CoverFlowController,
  | "ipodMode"
  | "isModernIpodCoverFlow"
  | "currentItem"
  | "isPlaying"
  | "selectedIndex"
  | "currentCoverIndex"
  | "onTogglePlay"
  | "playItemInPlace"
  | "showCD"
  | "setShowCD"
  | "isMacTheme"
>;

interface CoverFlowTrackInfoBarProps {
  vm: TrackInfoController;
  /** Karaoke overlay uses motion entrance; inline host panel does not. */
  animated?: boolean;
}

export function CoverFlowTrackInfoBar({
  vm,
  animated = false,
}: CoverFlowTrackInfoBarProps) {
  const { t } = useTranslation();
  const {
    ipodMode,
    isModernIpodCoverFlow,
    currentItem,
    isPlaying,
    selectedIndex,
    currentCoverIndex,
    onTogglePlay,
    playItemInPlace,
    showCD,
    setShowCD,
    isMacTheme,
  } = vm;

  const content = (
    <>
      {!ipodMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (selectedIndex !== currentCoverIndex) {
              playItemInPlace(selectedIndex);
            } else {
              onTogglePlay?.();
            }
          }}
          className="relative flex-shrink-0 rounded-full transition-all text-white/80 hover:text-white hover:brightness-110 p-3"
          style={{
            width: "clamp(40px, 8cqmin, 48px)",
            height: "clamp(40px, 8cqmin, 48px)",
            ...(isMacTheme
              ? {
                  background:
                    "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                  boxShadow:
                    "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                }
              : {
                  background: "rgba(255, 255, 255, 0.08)",
                }),
          }}
          title={
            isPlaying && selectedIndex === currentCoverIndex
              ? t("apps.ipod.menu.pause")
              : t("apps.ipod.menu.play")
          }
        >
          {isMacTheme && <AquaShineOverlay />}
          {isPlaying && selectedIndex === currentCoverIndex ? (
            <Pause className="w-full h-full relative z-10" weight="fill" />
          ) : (
            <Play className="w-full h-full relative z-10" weight="fill" />
          )}
        </button>
      )}

      <div
        className={cn(
          "text-center min-w-0 flex-1",
          isModernIpodCoverFlow
            ? "[&>*]:leading-[1.15]"
            : "[&>*]:leading-tight",
        )}
      >
        <div
          className={cn(
            "truncate",
            isModernIpodCoverFlow
              ? "text-black text-[12px] font-semibold tracking-tight"
              : "text-white",
            ipodMode && !isModernIpodCoverFlow && "text-[10px]",
          )}
          style={ipodMode ? undefined : { fontSize: "clamp(14px, 5cqmin, 24px)" }}
        >
          {currentItem?.title || t("apps.ipod.coverFlow.noTrack")}
        </div>
        {currentItem?.artist && (
          <div
            className={cn(
              "truncate",
              isModernIpodCoverFlow
                ? "text-[10px] text-[rgb(99,101,103)] tracking-tight"
                : "text-white/60",
              ipodMode && !isModernIpodCoverFlow && "text-[8px]",
            )}
            style={
              ipodMode ? undefined : { fontSize: "clamp(12px, 4cqmin, 18px)" }
            }
          >
            {currentItem.artist}
          </div>
        )}
      </div>

      {!ipodMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCD(!showCD);
          }}
          className={`relative flex-shrink-0 rounded-full transition-all hover:brightness-110 p-3 ${
            showCD ? "text-white" : "text-white/80 hover:text-white"
          }`}
          style={{
            width: "clamp(40px, 8cqmin, 48px)",
            height: "clamp(40px, 8cqmin, 48px)",
            ...(isMacTheme
              ? {
                  background: showCD
                    ? "linear-gradient(to bottom, rgba(80, 80, 80, 0.7), rgba(50, 50, 50, 0.6))"
                    : "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                  boxShadow:
                    "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                }
              : {
                  background: showCD
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(255, 255, 255, 0.08)",
                }),
          }}
          title={
            showCD
              ? t("apps.ipod.coverFlow.hideMedia")
              : t("apps.ipod.coverFlow.showMedia")
          }
        >
          {isMacTheme && <AquaShineOverlay />}
          <VinylRecord className="w-full h-full relative z-10" weight="fill" />
        </button>
      )}
    </>
  );

  const className = cn(
    "absolute left-0 right-0 flex items-center justify-center gap-2",
    isModernIpodCoverFlow ? "font-ipod-modern-ui" : "font-geneva-12",
    ipodMode ? "px-2" : "px-6",
    !animated && "pointer-events-none",
  );

  const style = {
    bottom:
      ipodMode && isModernIpodCoverFlow
        ? "3px"
        : ipodMode
          ? "6px"
          : "5cqmin",
  };

  if (animated) {
    return (
      <motion.div
        className={className}
        style={style}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
