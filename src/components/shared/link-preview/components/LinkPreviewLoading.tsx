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
          ? "chat-bubble macosx-link-preview bg-neutral-100 border-none shadow-none"
          : "rounded border border-neutral-200 dark:border-neutral-700",
        className
      )}
      data-link-preview
      aria-busy="true"
      aria-label="Loading link preview"
    >
      <div
        className={cn(
          "link-preview-loading-skeleton absolute inset-0",
          !isMacOSTheme && "rounded-[inherit]"
        )}
        aria-hidden
      />
    </motion.div>
  );
}
