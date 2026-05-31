import { cn } from "@/lib/utils";
import { ArrowsOutSimple, CardsThree } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

export interface WindowFrameTrailingTitlebarControlsProps {
  variant: "aqua" | "system7";
  titleBarRightContent?: ReactNode;
  isNoTitlebar: boolean;
  isForeground: boolean;
  onCoverFlowToggle?: () => void;
  isCoverFlowActive?: boolean;
  onFullscreenToggle?: () => void;
}

export function WindowFrameTrailingTitlebarControls({
  variant,
  titleBarRightContent,
  isNoTitlebar,
  isForeground,
  onCoverFlowToggle,
  isCoverFlowActive = false,
  onFullscreenToggle,
}: WindowFrameTrailingTitlebarControlsProps) {
  const { t } = useTranslation();
  const coverFlowLabel = t("apps.ipod.menu.coverFlow");
  if (titleBarRightContent) {
    return titleBarRightContent;
  }

  const isAquaNoTitlebar = variant === "aqua" && isNoTitlebar;
  const buttonClass = cn(
    variant === "aqua" ? "size-5" : "mr-2 size-5",
    "flex items-center justify-center",
    isAquaNoTitlebar
      ? "text-white/80"
      : variant === "aqua"
        ? isForeground
          ? "text-neutral-500"
          : "text-neutral-400"
        : isForeground
          ? "text-neutral-600"
          : "text-neutral-400",
    onCoverFlowToggle &&
      isCoverFlowActive &&
      (isAquaNoTitlebar ? "text-white" : "text-os-titlebar-active-text")
  );
  const iconSize = variant === "aqua" ? 14 : 12;
  const buttonStyle =
    variant === "aqua"
      ? {
          filter: isAquaNoTitlebar
            ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))"
            : isForeground
              ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))"
              : "none",
        }
      : undefined;

  if (!onCoverFlowToggle && !onFullscreenToggle) {
    return variant === "aqua" ? <div style={{ width: 52 }} /> : <div className="mr-2 size-4" />;
  }

  return (
    <div
      className={cn(
        "flex items-center shrink-0",
        variant === "aqua" ? "gap-0.5" : "gap-0.5 mr-2"
      )}
    >
      {onCoverFlowToggle ? (
        <button
          type="button"
          aria-label={coverFlowLabel}
          title={coverFlowLabel}
          aria-pressed={isCoverFlowActive}
          onClick={(e) => {
            e.stopPropagation();
            onCoverFlowToggle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          data-titlebar-controls
          className={buttonClass}
          style={buttonStyle}
        >
          <CardsThree size={iconSize} weight="bold" />
        </button>
      ) : null}
      {onFullscreenToggle ? (
        <button
          type="button"
          aria-label={t("common.window.fullscreen")}
          onClick={(e) => {
            e.stopPropagation();
            onFullscreenToggle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          data-titlebar-controls
          className={buttonClass}
          style={buttonStyle}
        >
          <ArrowsOutSimple size={iconSize} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
