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
        className
      )}
    >
      {/* Container with aqua bubble styling for macOS */}
      <div
        className={cn(
          "relative overflow-hidden",
          isMacTheme
            ? "chat-bubble macosx-link-preview rounded-[16px] bg-gray-100"
            : "bg-white border border-gray-200 rounded"
        )}
      >
        {/* Full bleed image for macOS */}
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
        </div>
      </div>

      {/* Remove button - positioned at top right corner */}
      {showRemoveButton && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center z-20",
            isMacTheme
              ? "rounded-full overflow-hidden"
              : "rounded-sm bg-black/40 backdrop-blur-sm hover:bg-black/60",
            "transition-colors"
          )}
          style={
            isMacTheme
              ? {
                  background: "linear-gradient(rgba(160, 160, 160, 0.9), rgba(255, 255, 255, 0.9))",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2), 0 0.5px 0.5px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(0, 0, 0, 0.2), inset 0 1px 2px 0.5px rgba(187, 187, 187, 0.8)",
                }
              : undefined
          }
          aria-label="Remove image"
        >
          {/* Top shine for macOS */}
          {isMacTheme && (
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{
                top: "1px",
                height: "35%",
                width: "50%",
                borderRadius: "9999px",
                background: "linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.2))",
                filter: "blur(0.3px)",
                zIndex: 2,
              }}
            />
          )}
          <X
            className={cn(
              "h-2.5 w-2.5 relative z-[3]",
              isMacTheme ? "text-neutral-500" : "text-white"
            )}
            weight="bold"
          />
        </button>
      )}
    </motion.div>
  );
}

export default ImageAttachment;
