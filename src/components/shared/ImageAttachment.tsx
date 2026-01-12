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
  const isXpTheme = theme === "xp" || theme === "win98";

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
      </div>

      {/* Remove button with aqua styling for macOS */}
      {showRemoveButton && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center z-10",
            isMacTheme
              ? "rounded-full relative overflow-hidden"
              : isXpTheme
              ? "rounded-sm bg-white border border-gray-300 shadow-sm hover:bg-gray-100"
              : "rounded-sm bg-white border border-gray-300 shadow-sm hover:bg-gray-100"
          )}
          style={
            isMacTheme
              ? {
                  background:
                    "linear-gradient(rgba(220, 220, 220, 0.95), rgba(180, 180, 180, 0.95))",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.2), 0 0.5px 0.5px rgba(0,0,0,0.25), inset 0 0 0 0.5px rgba(0,0,0,0.2), inset 0 1px 1px rgba(0,0,0,0.3)",
                }
              : undefined
          }
          aria-label="Remove image"
        >
          {isMacTheme && (
            <>
              {/* Top shine */}
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  top: "1px",
                  height: "35%",
                  width: "calc(100% - 6px)",
                  borderRadius: "6px 6px 2px 2px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.2))",
                  filter: "blur(0.2px)",
                  zIndex: 2,
                }}
              />
              {/* Bottom glow */}
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: "0.5px",
                  height: "40%",
                  width: "calc(100% - 2px)",
                  borderRadius: "2px 2px 6px 6px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.1), rgba(255,255,255,0.4))",
                  filter: "blur(0.2px)",
                  zIndex: 1,
                }}
              />
            </>
          )}
          <X
            className={cn(
              "h-2.5 w-2.5",
              isMacTheme ? "text-gray-700 relative z-10" : "text-gray-600"
            )}
            weight="bold"
          />
        </button>
      )}
    </motion.div>
  );
}

export default ImageAttachment;
