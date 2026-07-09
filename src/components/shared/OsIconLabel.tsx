import { useSound, Sounds } from "@/hooks/useSound";
import { memo, useCallback, useRef } from "react";
import { isTouchDevice } from "@/utils/device";
import { usePointerLongPress } from "@/hooks/usePointerLongPress";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { ThemedIcon } from "@/components/shared/ThemedIcon";

export interface OsIconLabelProps {
  name: string;
  isDirectory?: boolean;
  icon: string;
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  isSelected?: boolean;
  isDropTarget?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  size?: "small" | "large";
  className?: string;
  context?: "desktop" | "finder";
  /** Optional alt text for the icon image (defaults to name). */
  iconAlt?: string;
}

const sizeClasses = {
  small: {
    container: "w-[80px]",
    icon: "w-12 h-12",
    image: "w-[32px] h-[32px]",
    text: "text-[10px] max-w-[90px]",
    labelMinH: "min-h-[22px]",
  },
  large: {
    container: "w-24",
    icon: "w-16 h-16",
    image: "w-12 h-12",
    text: "text-[12px] max-w-[96px]",
    labelMinH: "min-h-[26px]",
  },
} as const;

const isEmojiIcon = (iconPath: string): boolean => {
  if (!iconPath) return false;
  if (iconPath.startsWith("/") || iconPath.startsWith("http")) return false;
  return iconPath.length <= 10;
};

/**
 * Lightweight OS icon + label used by the desktop shell.
 * Kept outside Finder so the boot path does not pull Finder thumbnail/blob logic.
 */
export const OsIconLabel = memo(function OsIconLabel({
  name,
  isDirectory = false,
  icon,
  onDoubleClick,
  onPointerDown,
  onContextMenu,
  isSelected,
  isDropTarget,
  onClick,
  size = "small",
  className,
  context = "desktop",
  iconAlt,
}: OsIconLabelProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const { isWinXp: isWindowsTheme, isWin98: isWin98Theme, isMacOSTheme } =
    useThemeFlags();
  const isFinderContext = context === "finder";
  const lastClickSoundRef = useRef(0);
  const CLICK_SOUND_COOLDOWN_MS = 400;

  const sizes = sizeClasses[size];
  const imagePixelSize = size === "large" ? 48 : 32;

  const renderIcon = () => {
    if (isEmojiIcon(icon)) {
      return (
        <span
          className={`relative ${sizes.icon} flex items-center justify-center leading-none`}
          style={{
            fontSize: size === "large" ? 48 : 32,
            lineHeight: 1,
            display: "flex",
          }}
          onContextMenu={(e) => e.preventDefault()}
          data-emoji-icon="true"
        >
          {icon}
        </span>
      );
    }

    return (
      <ThemedIcon
        name={icon}
        alt={iconAlt ?? name}
        width={imagePixelSize}
        height={imagePixelSize}
        decoding="async"
        loading={isFinderContext ? "lazy" : "eager"}
        fetchPriority={isFinderContext ? "auto" : "low"}
        className={`no-touch-callout object-contain ${sizes.image} ${
          isDirectory && isDropTarget ? "invert" : ""
        }`}
        style={{ imageRendering: "pixelated" } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      />
    );
  };

  const longPressHandlers = usePointerLongPress((event) => {
    if (onContextMenu) {
      const syntheticEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: event.clientX,
        clientY: event.clientY,
      } as unknown as React.MouseEvent<HTMLDivElement>;
      onContextMenu(syntheticEvent);
    }
  });
  const { consumeClickIfLongPressFired, ...longPressDomBindings } =
    longPressHandlers;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (consumeClickIfLongPressFired()) return;

      const now = Date.now();
      if (now - lastClickSoundRef.current >= CLICK_SOUND_COOLDOWN_MS) {
        lastClickSoundRef.current = now;
        playClick();
      }

      if (isTouchDevice() && onDoubleClick) {
        onDoubleClick(e);
      } else {
        onClick?.(e);
      }
    },
    [consumeClickIfLongPressFired, onClick, onDoubleClick, playClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isTouchDevice()) {
        onDoubleClick?.(e);
      }
    },
    [onDoubleClick]
  );

  return (
    <div
      className={`flex flex-col items-center justify-start cursor-default ${
        isMacOSTheme ? "gap-0 pb-1" : "gap-0"
      } ${sizes.container} ${className ?? ""}`}
      onDoubleClick={handleDoubleClick}
      onPointerDown={onPointerDown}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      data-desktop-icon="true"
      {...longPressDomBindings}
    >
      <div
        className={`flex items-center justify-center ${sizes.icon} ${
          isSelected || (isDropTarget && isDirectory)
            ? "brightness-65 contrast-100"
            : ""
        }`}
      >
        {renderIcon()}
      </div>
      <div className={`${sizes.labelMinH} flex items-start justify-center`}>
        <span
          className={`px-1 file-icon-label text-center leading-tight line-clamp-2 break-words ${sizes.text} ${
            isMacOSTheme ? "rounded" : ""
          } ${isMacOSTheme && !isFinderContext ? "font-bold" : ""} ${
            isSelected
              ? ""
              : isWin98Theme
                ? "bg-white text-black"
                : (isWindowsTheme || isMacOSTheme) && !isFinderContext
                  ? "bg-transparent text-white"
                  : isMacOSTheme && isFinderContext
                    ? "bg-transparent text-os-text-primary"
                    : "bg-white text-black"
          }`}
          data-selected={isSelected ? "true" : undefined}
          style={{
            ...(isSelected && isMacOSTheme && isFinderContext
              ? {
                  background:
                    "color-mix(in srgb, var(--os-accent-color, #2765ca) 88%, transparent)",
                  textShadow: "none",
                }
              : {}),
            ...(!isSelected &&
            (isWindowsTheme || isMacOSTheme) &&
            !isFinderContext
              ? isMacOSTheme
                ? {
                    textShadow:
                      "rgba(0, 0, 0, 0.9) 0px 1px 0px, rgba(0, 0, 0, 0.85) 0px 1px 3px, rgba(0, 0, 0, 0.45) 0px 2px 3px",
                  }
                : { textShadow: "1px 1px 2px rgba(0, 0, 0, 0.8)" }
              : {}),
          }}
        >
          {name}
        </span>
      </div>
    </div>
  );
});
