import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { LinkPreviewError } from "./components/LinkPreviewError";
import { LinkPreviewFullWidthContent } from "./components/LinkPreviewFullWidthContent";
import { LinkPreviewLoading } from "./components/LinkPreviewLoading";
import { LinkPreviewSideBySideContent } from "./components/LinkPreviewSideBySideContent";
import { useLinkPreviewClick } from "./hooks/useLinkPreviewClick";
import { useLinkPreviewHandlers } from "./hooks/useLinkPreviewHandlers";
import { useLinkPreviewMetadata } from "./hooks/useLinkPreviewMetadata";
import type { LinkPreviewProps } from "./types";

export function LinkPreview({ url, className = "" }: LinkPreviewProps) {
  const [{ metadata, loading, error, isFullWidthThumbnail }, dispatch] =
    useLinkPreviewMetadata(url);
  const { isMacOSTheme } = useThemeFlags();
  const displayFullWidthThumbnail = isMacOSTheme || isFullWidthThumbnail;

  const {
    handleAddToIpod,
    handleOpenInKaraoke,
    handleOpenYouTube,
    handleOpenExternally,
  } = useLinkPreviewHandlers(url);
  const handleClick = useLinkPreviewClick(url);

  if (loading) {
    return <LinkPreviewLoading className={className} />;
  }

  if (error && !metadata) {
    return <LinkPreviewError error={error} className={className} />;
  }

  if (!metadata) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "link-preview-container relative overflow-hidden cursor-pointer font-geneva-12 group max-w-[420px]",
        isMacOSTheme
          ? "chat-bubble macosx-link-preview bg-neutral-100 border-none shadow-none dark:bg-neutral-800/90"
          : "bg-white border border-neutral-200 rounded dark:border-neutral-700 dark:bg-neutral-950",
        className
      )}
      onClick={handleClick}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
      data-link-preview
    >
      <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-5 transition-opacity z-10 pointer-events-none" />
      {displayFullWidthThumbnail && metadata.image ? (
        <LinkPreviewFullWidthContent
          url={url}
          metadata={metadata}
          isMacOSTheme={isMacOSTheme}
          handleAddToIpod={handleAddToIpod}
          handleOpenInKaraoke={handleOpenInKaraoke}
          handleOpenYouTube={handleOpenYouTube}
          handleOpenExternally={handleOpenExternally}
        />
      ) : (
        <LinkPreviewSideBySideContent
          url={url}
          metadata={metadata}
          isMacOSTheme={isMacOSTheme}
          dispatch={dispatch}
          handleAddToIpod={handleAddToIpod}
          handleOpenInKaraoke={handleOpenInKaraoke}
          handleOpenYouTube={handleOpenYouTube}
          handleOpenExternally={handleOpenExternally}
        />
      )}
    </motion.div>
  );
}
