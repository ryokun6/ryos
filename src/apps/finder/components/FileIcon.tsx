import { useSound, Sounds } from "@/hooks/useSound";
import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isTouchDevice } from "@/utils/device";
import { useLongPress } from "@/hooks/useLongPress";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  icon?: string;
  content?: string | Blob;
  contentUrl?: string;
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  isSelected?: boolean;
  isDropTarget?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  size?: "small" | "large";
  className?: string;
  context?: "desktop" | "finder";
}

export function FileIcon({
  name,
  isDirectory,
  icon,
  content,
  contentUrl,
  onDoubleClick,
  onContextMenu,
  isSelected,
  isDropTarget,
  onClick,
  size = "small",
  className,
  context = "desktop",
}: FileIconProps) {
  const { t } = useTranslation();
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp";
  const isWin98Theme = currentTheme === "win98";
  const isMacOSXTheme = currentTheme === "macosx";
  const isFinderContext = context === "finder";
  const [imgSrc, setImgSrc] = useState<string | undefined>(contentUrl);
  const [fallbackToIcon, setFallbackToIcon] = useState(false);
  const attemptedUrlsRef = useRef<Set<string>>(new Set());
  const blobUrlRef = useRef<string | null>(null);
  const contentRef = useRef(content);
  const contentUrlRef = useRef(contentUrl);

  // Track props with refs to avoid dependency issues
  useEffect(() => {
    contentRef.current = content;
    contentUrlRef.current = contentUrl;
  }, [content, contentUrl]);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  // Setup image source once on mount, or when key props change
  useEffect(() => {
    // Skip if we're already showing the icon
    if (fallbackToIcon) return;

    // Clear attempted URLs when setup runs
    attemptedUrlsRef.current.clear();

    // Try contentUrl first if available
    if (contentUrl && !attemptedUrlsRef.current.has(contentUrl)) {
      attemptedUrlsRef.current.add(contentUrl);
      setImgSrc(contentUrl);
      return;
    }

    // If no contentUrl or it failed, try using content
    if (content) {
      if (content instanceof Blob) {
        // Revoke previous URL if exists
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }

        // Create new object URL
        const url = URL.createObjectURL(content);
        blobUrlRef.current = url;
        attemptedUrlsRef.current.add(url);
        setImgSrc(url);
      } else if (
        typeof content === "string" &&
        !attemptedUrlsRef.current.has(content)
      ) {
        attemptedUrlsRef.current.add(content);
        setImgSrc(content);
      }
    }
  }, [contentUrl, content]); // Don't include fallbackToIcon in deps

  const isImage = () => {
    const ext = name.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext || "");
  };

  const getIconPath = () => {
    if (icon) return icon;
    if (isDirectory) return "/icons/directory.png"; // legacy logical path
    if (name.endsWith(".txt") || name.endsWith(".md"))
      return "/icons/file-text.png";
    return "/icons/file.png";
  };

  // Check if the icon is an emoji (doesn't start with / or http and is short)
  const isEmojiIcon = (iconPath: string): boolean => {
    if (!iconPath) return false;
    // Check if it's not a file path or URL
    if (iconPath.startsWith("/") || iconPath.startsWith("http")) return false;
    // Check if it's a short string (emojis are typically 1-4 characters including multi-byte)
    return iconPath.length <= 10;
  };

  const sizeClasses = {
    small: {
      container: "w-[80px]",
      icon: "w-12 h-12",
      image: "w-[32px] h-[32px]",
      text: "text-[10px] max-w-[90px]",
    },
    large: {
      container: "w-24",
      icon: "w-16 h-16",
      image: "w-12 h-12",
      text: "text-[12px] max-w-[96px]",
    },
  };

  const sizes = sizeClasses[size];

  const handleImageError = () => {
    console.error(
      `Error loading thumbnail for ${name}, fallback to icon. Current imgSrc: ${imgSrc?.substring(
        0,
        50
      )}...`
    );

    // If we have a Blob but URL failed, try regenerating URL one time
    if (
      !fallbackToIcon &&
      contentRef.current instanceof Blob &&
      blobUrlRef.current &&
      imgSrc === blobUrlRef.current
    ) {
      // Only try once per blob to avoid loops
      if (!attemptedUrlsRef.current.has("blob-retry")) {
        console.log(`[FileIcon] Retrying with new URL for ${name}`);
        attemptedUrlsRef.current.add("blob-retry");

        // Revoke current URL
        URL.revokeObjectURL(blobUrlRef.current);

        // Create new URL from the same blob
        const newUrl = URL.createObjectURL(contentRef.current);
        blobUrlRef.current = newUrl;
        setImgSrc(newUrl);
        console.log(
          `[FileIcon] Created new URL for ${name}: ${newUrl.substring(
            0,
            50
          )}...`
        );
        return;
      }
    }

    // Otherwise fall back to icon
    console.log(`[FileIcon] Falling back to icon for ${name}`);
    setFallbackToIcon(true);
  };

  const renderIcon = () => {
    if (isImage() && imgSrc && !fallbackToIcon) {
      return (
        <div
          className={`relative ${sizes.icon} flex items-center justify-center`}
        >
          <img
            src={imgSrc}
            alt={name}
            className={`no-touch-callout object-cover ${sizes.image} rounded`}
            onError={handleImageError}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
            data-legacy-aware="true"
          />
        </div>
      );
    }

    const iconPath = getIconPath();

    // Render emoji as text if it's an emoji icon
    if (icon && isEmojiIcon(icon)) {
      return (
        <span
          className={`relative ${sizes.icon} flex items-center justify-center leading-none`}
          style={{
            // Explicit font size avoids macOS theme global div/p font overrides
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
        name={iconPath}
        alt={isDirectory ? t("apps.finder.fileTypes.directory") : t("apps.finder.fileTypes.file")}
        className={`no-touch-callout object-contain ${sizes.image} ${
          isDirectory && isDropTarget ? "invert" : ""
        }`}
        style={{ imageRendering: "pixelated" } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      />
    );
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    playClick();

    // On touch devices, single tap should open the app (execute onDoubleClick)
    if (isTouchDevice() && onDoubleClick) {
      onDoubleClick(e);
    } else {
      // On desktop, execute the regular onClick handler (selection)
      onClick?.(e);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle double-click on desktop (touch uses single tap)
    if (!isTouchDevice()) {
      onDoubleClick?.(e);
    }
  };

  // Add long-press support for context menu on mobile
  const longPressHandlers = useLongPress((touchEvent) => {
    if (onContextMenu) {
      const touch = touchEvent.touches[0];
      const syntheticEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent<HTMLDivElement>;
      onContextMenu(syntheticEvent);
    }
  });

  return (
    <div
      className={`flex flex-col items-center justify-start cursor-default ${
        isMacOSXTheme ? "gap-0 pb-3" : "gap-0"
      } ${sizes.container} ${className}`}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      data-desktop-icon="true"
      {...longPressHandlers}
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
      <span
        className={`px-1 file-icon-label text-center truncate ${sizes.text} ${
          isMacOSXTheme ? "rounded" : ""
        } ${isMacOSXTheme && !isFinderContext ? "font-bold" : ""} ${
          isSelected
            ? ""
            : isWin98Theme
            ? "bg-white text-black"
            : (isXpTheme || isMacOSXTheme) && !isFinderContext
            ? "bg-transparent text-white"
            : "bg-white text-black"
        }`}
        style={{
          ...(isSelected
            ? {
                background: "var(--os-color-selection-bg)",
                color: "var(--os-color-selection-text)",
              }
            : {}),
          ...(!isSelected && (isXpTheme || isMacOSXTheme) && !isFinderContext
            ? isMacOSXTheme
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
  );
}
