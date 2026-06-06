import { motion } from "motion/react";
import {
  ArrowsOut,
  ArrowsIn,
  Copy,
  Check,
  DownloadSimple,
  Export,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export interface HtmlPreviewCornerToolbarProps {
  isStreaming: boolean;
  isFullScreen: boolean;
  copySuccess: boolean;
  onSaveAsApplet: (e: React.MouseEvent) => void;
  onSaveToDisk: (e: React.MouseEvent) => void;
  onCopy: (e: React.MouseEvent) => void;
  onToggleFullScreen: (e: React.MouseEvent) => void;
}

export function HtmlPreviewCornerToolbar({
  isStreaming,
  isFullScreen,
  copySuccess,
  onSaveAsApplet,
  onSaveToDisk,
  onCopy,
  onToggleFullScreen,
}: HtmlPreviewCornerToolbarProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      className="flex justify-end p-1 absolute top-2 right-4 z-20"
      animate={{ opacity: isStreaming ? 0 : 1 }}
      transition={{ duration: 0.3 }}
      style={{ pointerEvents: isStreaming ? "none" : "auto" }}
    >
      <button
        onClick={onSaveAsApplet}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-center size-6 hover:bg-black/10 rounded mr-1 group"
        aria-label={t("common.htmlPreview.saveApplet")}
        disabled={isStreaming}
      >
        <DownloadSimple
          size={16}
          className="text-neutral-400/50 group-hover:text-neutral-300"
        />
      </button>
      <button
        onClick={onSaveToDisk}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-center size-6 hover:bg-black/10 rounded mr-1 group"
        aria-label={t("common.htmlPreview.downloadHtml")}
        disabled={isStreaming}
      >
        <Export
          size={16}
          className="text-neutral-400/50 group-hover:text-neutral-300"
        />
      </button>
      <button
        onClick={onCopy}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-center size-6 hover:bg-black/10 rounded mr-1 group"
        aria-label={t("common.htmlPreview.copyHtml")}
        disabled={isStreaming}
      >
        {copySuccess ? (
          <Check
            size={16}
            className="text-neutral-400/50 group-hover:text-neutral-300"
          />
        ) : (
          <Copy
            size={16}
            className="text-neutral-400/50 group-hover:text-neutral-300"
          />
        )}
      </button>
      <button
        onClick={onToggleFullScreen}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-center size-6 hover:bg-black/10 rounded group"
        aria-label={
          isFullScreen
            ? t("common.htmlPreview.minimizePreview")
            : t("common.htmlPreview.maximizePreview")
        }
        disabled={isStreaming}
      >
        {isFullScreen ? (
          <ArrowsIn
            size={16}
            className="text-neutral-400/50 group-hover:text-neutral-300"
          />
        ) : (
          <ArrowsOut
            size={16}
            className="text-neutral-400/50 group-hover:text-neutral-300"
          />
        )}
      </button>
    </motion.div>
  );
}
