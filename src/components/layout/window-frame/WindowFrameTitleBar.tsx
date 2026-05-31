import { cn } from "@/lib/utils";
import { getAppIconPath } from "@/config/appRegistry";
import { AppId } from "@/config/appIds";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { TrafficLightButton } from "@/components/shared/TrafficLightButton";
import { useTranslation } from "react-i18next";
import type { MouseEvent, ReactNode, TouchEvent } from "react";
import { isFromTitlebarControls } from "./windowFrameUtils";
import { WindowFrameTrailingTitlebarControls } from "./WindowFrameTrailingTitlebarControls";

export interface WindowFrameTitleBarProps {
  isXpTheme: boolean;
  isWinXp: boolean;
  isMacOSTheme: boolean;
  isForeground: boolean;
  isNoTitlebar: boolean;
  disableTitlebarAutoHide: boolean;
  effectiveTransparentBackground: boolean;
  isBrushedMetal: boolean;
  isTransparent: boolean;
  isTitlebarHovered: boolean;
  showTitlebarWithAutoHide: () => void;
  handleMouseDownWithForeground: (
    e: MouseEvent<HTMLElement> | TouchEvent<HTMLElement>
  ) => void;
  handleFullMaximize: (e: MouseEvent | TouchEvent) => void;
  handleTitleBarTap: (e: TouchEvent) => void;
  handleTouchStart: (e: TouchEvent<HTMLElement>) => void;
  handleTouchMove: (e: TouchEvent<HTMLElement>) => void;
  handleTouchEnd: () => void;
  isPhone: boolean;
  appId: AppId;
  title: string;
  titleBarRightContent?: ReactNode;
  onCoverFlowToggle?: () => void;
  isCoverFlowActive?: boolean;
  onFullscreenToggle?: () => void;
  debugMode: boolean;
  handleClose: () => void;
  handleMinimize: () => void;
}

export function WindowFrameTitleBar({
  isXpTheme,
  isWinXp,
  isMacOSTheme,
  isForeground,
  isNoTitlebar,
  disableTitlebarAutoHide,
  effectiveTransparentBackground,
  isBrushedMetal,
  isTransparent,
  isTitlebarHovered,
  showTitlebarWithAutoHide,
  handleMouseDownWithForeground,
  handleFullMaximize,
  handleTitleBarTap,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  isPhone,
  appId,
  title,
  titleBarRightContent,
  onCoverFlowToggle,
  isCoverFlowActive = false,
  onFullscreenToggle,
  debugMode,
  handleClose,
  handleMinimize,
}: WindowFrameTitleBarProps) {
  const { t } = useTranslation();
  const coverFlowLabel = t("apps.ipod.menu.coverFlow");

  return (
    <>
      {isXpTheme ? (
        // XP/98 theme title bar structure
        <div
          className={cn(
            "title-bar relative z-50",
            !isForeground && "inactive" // Add inactive class when not in foreground
          )}
          style={{
            ...(isWinXp ? { minHeight: "30px" } : undefined),
            ...(!isForeground
              ? {
                  background: "var(--os-color-titlebar-inactive-bg)",
                }
              : undefined),
          }}
          onMouseDown={handleMouseDownWithForeground}
          onDoubleClick={(e) => {
            if (isFromTitlebarControls(e.target)) return;
            handleFullMaximize(e);
          }}
          onTouchStart={(e: TouchEvent<HTMLElement>) => {
            if (isFromTitlebarControls(e.target)) {
              e.stopPropagation();
              return;
            }
            handleTitleBarTap(e);
            handleMouseDownWithForeground(e);
            if (isPhone) {
              handleTouchStart(e);
            }
          }}
          onTouchMove={(e: TouchEvent<HTMLElement>) => {
            if (isPhone) {
              handleTouchMove(e);
            }
          }}
          onTouchEnd={() => {
            if (isPhone) {
              handleTouchEnd();
            }
          }}
        >
          <div
            className={cn(
              "title-bar-text min-w-0",
              !isForeground && "inactive"
            )}
            style={{
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              ...(!isForeground
                ? {
                    color: "var(--os-color-titlebar-text-inactive)",
                  }
                : {}),
            }}
            onTouchMove={(e) => e.preventDefault()}
          >
            <ThemedIcon
              name={getAppIconPath(appId)}
              alt={title}
              className="size-4 mr-1 shrink-0 [image-rendering:pixelated]"
              style={{
                filter: !isForeground ? "grayscale(100%)" : "none",
              }}
            />
            <span className="truncate">{title}</span>
          </div>
          <div className="title-bar-controls flex items-center gap-0.5" data-titlebar-controls>
            {titleBarRightContent ? (
              titleBarRightContent
            ) : (
              <>
                {onCoverFlowToggle ? (
                  <button
                    type="button"
                    aria-label={coverFlowLabel}
                    title={coverFlowLabel}
                    aria-pressed={isCoverFlowActive}
                    data-action="cover-flow"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCoverFlowToggle();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  />
                ) : null}
                {onFullscreenToggle ? (
                  <button
                    aria-label={t("common.window.fullscreen")}
                    data-action="fullscreen"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFullscreenToggle();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  />
                ) : null}
              </>
            )}
            <button
              aria-label={t("common.window.minimize")}
              data-action="minimize"
              onClick={(e) => {
                e.stopPropagation();
                handleMinimize();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            />
            <button
              aria-label={t("common.window.maximize")}
              data-action="maximize"
              onClick={(e) => {
                e.stopPropagation();
                handleFullMaximize(e);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            />
            <button
              aria-label={t("common.window.close")}
              data-action="close"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : isMacOSTheme ? (
        // Mac OS X theme title bar with traffic light buttons
        <div
          className={cn(
            "title-bar relative flex items-center h-6 min-h-[1.25rem] mx-0 mb-0 px-[0.1rem] py-[0.1rem] select-none cursor-move user-select-none z-50 draggable-area",
            // For notitlebar: absolute positioning, no shrink, transition opacity
            isNoTitlebar
              ? "absolute top-0 left-0 right-0 transition-opacity duration-200"
              : "shrink-0",
            effectiveTransparentBackground && !isNoTitlebar && "mt-0"
          )}
          style={{
            borderRadius: isNoTitlebar ? "8px 8px 0px 0px" : "8px 8px 0px 0px",
            // For notitlebar: gradient background for visibility, opacity based on hover
            ...(isNoTitlebar
              ? {
                  background: "linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0) 100%)",
                  borderBottom: "none",
                  opacity: isTitlebarHovered ? 1 : 0,
                }
              : isBrushedMetal
              ? {
                  background: "transparent",
                }
              : isForeground
              ? {
                  backgroundColor: "var(--os-color-window-bg)",
                  backgroundImage:
                    "var(--os-pinstripe-titlebar), var(--os-pinstripe-window)",
                }
              : {
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                  backgroundImage: "var(--os-pinstripe-window)",
                  opacity: "0.85",
                }),
            // No border for notitlebar or brushed metal
            ...(!isNoTitlebar && !isBrushedMetal && {
              borderBottom: `1px solid ${
                isForeground
                  ? "var(--os-color-titlebar-border, rgba(0, 0, 0, 0.1))"
                  : "var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.05))"
              }`,
            }),
          }}
          onMouseDown={handleMouseDownWithForeground}
          onDoubleClick={(e) => {
            if (isFromTitlebarControls(e.target)) return;
            handleFullMaximize(e);
          }}
          onTouchStart={(e: TouchEvent<HTMLElement>) => {
            // For notitlebar: show title bar when tapping the top area (only if auto-hide is enabled)
            if (isNoTitlebar && !disableTitlebarAutoHide) {
              showTitlebarWithAutoHide();
            }
            if (isFromTitlebarControls(e.target)) {
              e.stopPropagation();
              return;
            }
            handleTitleBarTap(e);
            handleMouseDownWithForeground(e);
            if (isPhone) {
              handleTouchStart(e);
            }
          }}
          onTouchMove={(e: TouchEvent<HTMLElement>) => {
            if (isPhone) {
              handleTouchMove(e);
            }
          }}
          onTouchEnd={() => {
            if (isPhone) {
              handleTouchEnd();
            }
          }}
        >
          {/* Traffic Light Buttons */}
          <div
            className="group/traffic flex items-center gap-2 ml-1.5 relative"
            data-titlebar-controls
          >
            <TrafficLightButton
              color="red"
              onClick={handleClose}
              isForeground={isForeground}
              debugMode={debugMode}
              ariaLabel={t("common.window.close")}
            />
            <TrafficLightButton
              color="yellow"
              onClick={handleMinimize}
              isForeground={isForeground}
              debugMode={debugMode}
              ariaLabel={t("common.window.minimize")}
            />
            <TrafficLightButton
              color="green"
              onClick={handleFullMaximize}
              isForeground={isForeground}
              debugMode={debugMode}
              ariaLabel={t("common.window.maximize")}
            />
          </div>

          {/* Title - absolutely centered so it stays centered regardless of left/right content width */}
          <span
            className={cn(
              "select-none absolute left-1/2 -translate-x-1/2 px-2 py-0 h-full flex items-center justify-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[calc(100%-140px)] text-[13px] pointer-events-none",
              isNoTitlebar
                ? "text-white"
                : isForeground
                ? "text-os-titlebar-active-text"
                : "text-os-titlebar-inactive-text"
            )}
            style={{
              textShadow: isNoTitlebar
                ? "0 1px 3px rgba(0, 0, 0, 0.8)"
                : isBrushedMetal && isForeground
                ? "0 1px 0 rgba(255, 255, 255, 0.5)"
                : isForeground
                ? "0 2px 3px rgba(0, 0, 0, 0.25)"
                : "none",
              fontWeight: 500,
            }}
            onTouchMove={(e) => e.preventDefault()}
          >
            <span className="truncate">{title}</span>
          </span>

          {/* Titlebar right content, fullscreen button, or spacer to balance the traffic lights */}
          <div
            className="ml-auto mr-1 flex items-center justify-end"
            data-titlebar-controls
          >
            <WindowFrameTrailingTitlebarControls
              variant="aqua"
              titleBarRightContent={titleBarRightContent}
              isNoTitlebar={isNoTitlebar}
              isForeground={isForeground}
              onCoverFlowToggle={onCoverFlowToggle}
              isCoverFlowActive={isCoverFlowActive}
              onFullscreenToggle={onFullscreenToggle}
            />
          </div>
        </div>
      ) : (
        // Original Mac theme title bar (for System 7)
        <div
          className={cn(
            "flex items-center shrink-0 h-os-titlebar min-h-[1.5rem] mx-0 my-[0.1rem] mb-0 px-[0.1rem] py-[0.2rem] select-none cursor-move border-b-[1.5px] user-select-none z-50 draggable-area",
            isTransparent && "mt-0",
            isForeground
              ? isTransparent
                ? "bg-white/70 backdrop-blur-sm border-b-os-window"
                : "bg-os-titlebar-active-bg bg-os-titlebar-pattern bg-clip-content bg-[length:6.6666666667%_13.3333333333%] border-b-os-window"
              : isTransparent
              ? "bg-white/20 backdrop-blur-sm border-b-os-window"
              : "bg-os-titlebar-inactive-bg border-b-neutral-400"
          )}
          onMouseDown={handleMouseDownWithForeground}
          onDoubleClick={(e) => {
            if (isFromTitlebarControls(e.target)) return;
            handleFullMaximize(e);
          }}
          onTouchStart={(e: TouchEvent<HTMLElement>) => {
            if (isFromTitlebarControls(e.target)) {
              e.stopPropagation();
              return;
            }
            handleTitleBarTap(e);
            handleMouseDownWithForeground(e);
            if (isPhone) {
              handleTouchStart(e);
            }
          }}
          onTouchMove={(e: TouchEvent<HTMLElement>) => {
            if (isPhone) {
              handleTouchMove(e);
            }
          }}
          onTouchEnd={() => {
            if (isPhone) {
              handleTouchEnd();
            }
          }}
        >
          <div
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="relative ml-2 size-4 cursor-default select-none"
            data-titlebar-controls
          >
            <div className="absolute inset-0 -m-2" />{" "}
            {/* Larger click area */}
            <div
              className={`size-4 ${
                !isTransparent &&
                "bg-os-button-face shadow-[0_0_0_1px_var(--os-color-button-face)]"
              } border-2 border-os-window hover:bg-neutral-200 active:bg-neutral-300 flex items-center justify-center ${
                !isForeground && "invisible"
              }`}
            />
          </div>
          <span
            className={cn(
              "select-none mx-auto px-2 py-0 h-full flex items-center whitespace-nowrap overflow-hidden text-ellipsis min-w-0 max-w-[calc(100%-56px)]",
              !isTransparent && "bg-os-button-face",
              isForeground
                ? "text-os-titlebar-active-text"
                : "text-os-titlebar-inactive-text"
            )}
            onTouchMove={(e) => e.preventDefault()}
          >
            <span className="truncate">{title}</span>
          </span>
          <WindowFrameTrailingTitlebarControls
            variant="system7"
            titleBarRightContent={titleBarRightContent}
            isNoTitlebar={isNoTitlebar}
            isForeground={isForeground}
            onCoverFlowToggle={onCoverFlowToggle}
            isCoverFlowActive={isCoverFlowActive}
            onFullscreenToggle={onFullscreenToggle}
          />
        </div>
      )}
    </>
  );
}
