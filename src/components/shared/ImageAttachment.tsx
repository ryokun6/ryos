import { motion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";

interface ImageAttachmentProps {
  /** Image source - can be a data URL or regular URL */
  src: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Whether to show the remove button */
  showRemoveButton?: boolean;
  /** Callback when remove button is clicked */
  onRemove?: () => void;
  /** Additional class names */
  className?: string;
}

export function ImageAttachment({
  src,
  alt = "Image attachment",
  showRemoveButton = false,
  onRemove,
  className,
}: ImageAttachmentProps) {
  const theme = useThemeStore((s) => s.current);
  const isMacTheme = theme === "macosx";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-visible font-geneva-12 max-w-[280px]",
        // Add padding to allow X button to shoot out
        showRemoveButton && "pt-1.5 pr-1.5",
        className
      )}
    >
      {/* Image container with aqua bubble styling for macOS */}
      <div
        className={cn(
          "relative overflow-hidden",
          isMacTheme
            ? "chat-bubble rounded-[14px] bg-gray-100"
            : "bg-white border border-gray-200 rounded"
        )}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-auto object-cover max-h-[200px] relative z-[2]"
          style={{ display: "block" }}
        />
      </div>

      {/* Remove button - positioned at top right corner shooting out */}
      {showRemoveButton && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "absolute -top-0.5 -right-0.5 w-5 h-5 flex items-center justify-center z-20",
            isMacTheme
              ? "rounded-full chat-bubble bg-gray-200"
              : "rounded-sm bg-black/40 backdrop-blur-sm hover:bg-black/60",
            "transition-colors"
          )}
          aria-label="Remove image"
        >
          <X
            className={cn(
              "h-3 w-3 relative z-[3]",
              isMacTheme ? "text-gray-700" : "text-white"
            )}
            weight="bold"
          />
        </button>
      )}
    </motion.div>
  );
}

export default ImageAttachment;
