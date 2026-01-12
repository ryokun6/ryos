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
        isMacTheme
          ? "chat-bubble macosx-link-preview bg-gray-100 border-none shadow-none"
          : "bg-white border border-gray-200 rounded",
        className
      )}
    >
      {/* Image container */}
      <div
        className={cn(
          "relative overflow-hidden",
          isMacTheme && "-mx-3 -mt-[6px] -mb-[6px] rounded-[14px]"
        )}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-auto object-cover max-h-[200px]"
          style={{ display: "block" }}
        />

        {/* Remove button - positioned at top right of the image */}
        {showRemoveButton && onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className={cn(
              "absolute top-2 right-2 w-5 h-5 flex items-center justify-center z-10",
              "bg-black/40 backdrop-blur-sm",
              isMacTheme ? "rounded-full" : "rounded-sm",
              "hover:bg-black/60 transition-colors"
            )}
            aria-label="Remove image"
          >
            <X className="h-3 w-3 text-white" weight="bold" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default ImageAttachment;
