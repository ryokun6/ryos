import { useEffect, useRef, useState, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { AnimatedEllipsis } from "@/apps/terminal/components/AnimatedEllipsis";

interface ChannelPromptInputProps {
  /** Submit handler; resolves with the created channel name on success. */
  onSubmit: (description: string) => Promise<string | null>;
  isLoading: boolean;
  placeholder: string;
  /** Status messages cycled while loading (e.g. "Planning…", "Searching…"). */
  loadingMessages: string[];
  ariaLabel: string;
  width?: string;
  className?: string;
}

/**
 * Compact inline prompt rendered in the TV controls bar. Mirrors the
 * SearchInput pill from the Calendar app, but pressing Enter submits to
 * the AI channel-create flow instead of filtering local state. While the
 * request is in-flight the input is cleared and an overlaid shimmering
 * status string is shown — same affordance the chat input uses while the
 * model is "thinking".
 */
export function ChannelPromptInput({
  onSubmit,
  isLoading,
  placeholder,
  loadingMessages,
  ariaLabel,
  width,
  className,
}: ChannelPromptInputProps) {
  const { isMacOSTheme, isSystem7Theme } = useThemeFlags();
  const bodyFontClass = isSystem7Theme ? "font-geneva-12" : "font-os-ui";
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const [value, setValue] = useState("");

  // Cycle through status messages so the loading state feels alive.
  const [statusIndex, setStatusIndex] = useState(0);
  useEffect(() => {
    if (!isLoading) {
      setStatusIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setStatusIndex((i) => (i + 1) % loadingMessages.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [isLoading, loadingMessages.length]);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    // Clear immediately so the shimmer overlay (which only shows when the
    // input is empty) can take over the field. If the request fails we
    // restore the typed value so the user can retry without retyping.
    setValue("");
    inputRef.current?.blur();
    const created = await onSubmit(trimmed);
    if (!created) {
      setValue(trimmed);
    }
  };

  const showOverlay = isLoading && value === "";
  const statusMessage = loadingMessages[statusIndex] ?? loadingMessages[0] ?? "";

  return (
    <div
      className={cn("relative min-w-0", className)}
      style={width ? { width } : undefined}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        aria-label={ariaLabel}
        aria-busy={isLoading || undefined}
        // Keep a single space as the placeholder while loading so the
        // browser doesn't render the static placeholder text underneath
        // the shimmer overlay.
        placeholder={isLoading ? " " : placeholder}
        disabled={isLoading}
        className={cn(
          "w-full outline-none min-w-0 transition-colors text-black placeholder:text-black/40 disabled:placeholder:text-black/30 disabled:bg-white",
          bodyFontClass,
          isMacOSTheme
            ? "rounded-full border border-black/40 bg-white px-3 py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)]"
            : "rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]",
          isLoading && "cursor-progress"
        )}
      />
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            key="creating-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 pointer-events-none flex items-center px-3"
          >
            <span className={cn("shimmer-gray text-[11px] truncate", bodyFontClass)}>
              {statusMessage}
              <AnimatedEllipsis />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
