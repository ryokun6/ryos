import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  BatteryIndicator,
  IpodModernPlayPauseIcon,
  ScrollingText,
} from "../screen";
import { MODERN_TITLEBAR_HEIGHT } from "./constants";

interface CoverFlowModernTitlebarProps {
  isPlaying: boolean;
}

export function CoverFlowModernTitlebar({ isPlaying }: CoverFlowModernTitlebarProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "absolute top-0 left-0 right-0 z-20",
        "ipod-modern-titlebar font-ipod-modern-ui font-semibold text-black",
        "flex items-center pl-1.5 pr-1.5 gap-1.5",
      )}
      style={{
        height: MODERN_TITLEBAR_HEIGHT,
        minHeight: MODERN_TITLEBAR_HEIGHT,
      }}
    >
      <ScrollingText
        text={t("apps.ipod.menu.coverFlow")}
        isPlaying
        scrollStartDelaySec={1}
        fadeEdges
        align="left"
        className={cn(
          "flex-1 min-w-0 leading-none text-[12px] font-semibold",
          "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]",
        )}
      />
      <div className="flex shrink-0 items-center gap-1">
        <div
          className={cn(
            "flex items-center justify-center w-[14px] h-[14px] [transform:translateY(-0.5px)]",
            "[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]",
          )}
        >
          <IpodModernPlayPauseIcon playing={isPlaying} size={14} />
        </div>
        <BatteryIndicator backlightOn variant="modern" />
      </div>
    </div>
  );
}
