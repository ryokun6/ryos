import React from "react";
import { CaretUp, CaretDown, CaretLeft, CaretRight, Circle } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface TimeNavigationControlsProps {
  onOlder: () => void;
  onNewer: () => void;
  onNow: () => void;
  isOlderDisabled: boolean;
  isNewerDisabled: boolean;
  isNowDisabled: boolean;
  olderLabel: string;
  newerLabel: string;
  nowLabel?: string; // Optional, defaults to "Now"
  layout: "horizontal" | "vertical";
  playClickSound: () => void;
}

const TimeNavigationControls: React.FC<TimeNavigationControlsProps> = ({
  onOlder,
  onNewer,
  onNow,
  isOlderDisabled,
  isNewerDisabled,
  isNowDisabled,
  olderLabel,
  newerLabel,
  nowLabel = "Now",
  layout,
  playClickSound,
}) => {
  const { t } = useTranslation();
  const OlderIcon = layout === "vertical" ? CaretDown : CaretRight;
  const NewerIcon = layout === "vertical" ? CaretUp : CaretLeft;

  const handleOlderClick = () => {
    playClickSound();
    onOlder();
  };

  const handleNewerClick = () => {
    playClickSound();
    onNewer();
  };

  const handleNowClick = () => {
    playClickSound();
    onNow();
  };

  const buttonClasses =
    "text-white/60 hover:text-white hover:bg-white/10 rounded p-1.5 h-8 w-8 flex items-center justify-center disabled:opacity-30 transition-colors";
  const mobileButtonClasses =
    "text-white/60 hover:text-white hover:bg-neutral-600/70 rounded p-1.5 h-8 w-8 flex items-center justify-center disabled:opacity-30 transition-colors";

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn(
          "flex items-center justify-center gap-4",
          layout === "vertical" ? "flex-col" : "flex-row"
        )}
      >
        {/* Top/Left Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={
                layout === "vertical" ? handleOlderClick : handleNewerClick
              }
              className={
                layout === "vertical" ? buttonClasses : mobileButtonClasses
              }
              disabled={
                layout === "vertical" ? isOlderDisabled : isNewerDisabled
              }
              aria-label={
                layout === "vertical" ? t("apps.internet-explorer.olderVersion") : t("apps.internet-explorer.newerVersion")
              }
            >
              <NewerIcon size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={layout === "vertical" ? "right" : "bottom"}>
            <p>{layout === "vertical" ? olderLabel : newerLabel}</p>
          </TooltipContent>
        </Tooltip>

        {/* Go to Now Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleNowClick}
              className={
                layout === "vertical" ? buttonClasses : mobileButtonClasses
              }
              disabled={isNowDisabled}
              aria-label={t("apps.internet-explorer.goToNow")}
            >
              <Circle size={24} weight="fill" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={layout === "vertical" ? "right" : "bottom"}>
            <p>{nowLabel}</p>
          </TooltipContent>
        </Tooltip>

        {/* Bottom/Right Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={
                layout === "vertical" ? handleNewerClick : handleOlderClick
              }
              className={
                layout === "vertical" ? buttonClasses : mobileButtonClasses
              }
              disabled={
                layout === "vertical" ? isNewerDisabled : isOlderDisabled
              }
              aria-label={
                layout === "vertical" ? t("apps.internet-explorer.newerVersion") : t("apps.internet-explorer.olderVersion")
              }
            >
              <OlderIcon size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={layout === "vertical" ? "right" : "bottom"}>
            <p>{layout === "vertical" ? newerLabel : olderLabel}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default TimeNavigationControls;
