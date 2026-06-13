import { useEffect, useRef, useState, useId } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SearchInput } from "@/components/ui/search-input";
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
 * Compact inline prompt rendered in the TV controls bar. Uses the shared
 * SearchInput pill (no icon/clear); pressing Enter submits to the AI
 * channel-create flow. While the request is in-flight the input is cleared
 * and an overlaid shimmering status string is shown.
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
      <SearchInput
        id={inputId}
        inputRef={inputRef}
        value={value}
        onChange={setValue}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void handleSubmit();
          }
        }}
        ariaLabel={ariaLabel}
        ariaBusy={isLoading}
        placeholder={isLoading ? " " : placeholder}
        disabled={isLoading}
        showSearchIcon={false}
        showClear={false}
        className="w-full"
        inputClassName={cn(
          "transition-colors text-black placeholder:text-black/40 disabled:placeholder:text-black/30 disabled:bg-white",
          !isMacOSTheme && bodyFontClass,
          isLoading && "cursor-progress",
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
            className="pointer-events-none absolute inset-0 flex items-center px-3"
          >
            <span className={cn("shimmer-gray truncate text-[11px]", bodyFontClass)}>
              {statusMessage}
              <AnimatedEllipsis />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
