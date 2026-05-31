import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function LinkPreviewLoading({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "h-[106px] w-full min-w-[280px] max-w-[420px]",
        "relative overflow-hidden rounded",
        "border border-neutral-200 bg-neutral-50/80",
        "dark:border-neutral-700 dark:bg-neutral-900/80",
        "before:absolute before:inset-0",
        "before:bg-gradient-to-r before:from-neutral-200 before:via-neutral-100 before:to-neutral-200",
        "dark:before:from-neutral-800 dark:before:via-neutral-700 dark:before:to-neutral-800",
        "before:animate-[shimmer_2s_linear_infinite]",
        "before:bg-[length:200%_100%]",
        className
      )}
    />
  );
}
