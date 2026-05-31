import { motion } from "framer-motion";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";

export function LinkPreviewLoading({ className }: { className?: string }) {
  const { isMacOSTheme } = useThemeFlags();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "link-preview-loading h-[106px] w-full min-w-[280px] max-w-[420px]",
        "relative overflow-hidden",
        isMacOSTheme
          ? "chat-bubble macosx-link-preview rounded-[16px] border-none shadow-none link-preview-loading-skeleton"
          : "rounded border border-neutral-200 dark:border-neutral-700",
        className
      )}
      data-link-preview
      aria-busy="true"
      aria-label="Loading link preview"
    >
      {/* Non-macOS: overlay skeleton. macOS applies skeleton on the bubble itself
          because `.chat-bubble > * { position: relative }` breaks absolute children. */}
      {!isMacOSTheme ? (
        <div
          className="link-preview-loading-skeleton absolute inset-0 rounded-[inherit]"
          aria-hidden
        />
      ) : null}
    </motion.div>
  );
}
