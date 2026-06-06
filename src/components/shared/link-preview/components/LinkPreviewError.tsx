import { motion } from "motion/react";
import { WarningCircle } from "@phosphor-icons/react";

export function LinkPreviewError({
  error,
  className,
}: {
  error: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-sm font-geneva-12 max-w-[420px] dark:border-red-900/50 dark:bg-red-950/35 ${className}`}
      style={{ borderRadius: "3px" }}
    >
      <WarningCircle className="size-4 text-red-500 dark:text-red-400" weight="bold" />
      <span className="text-red-600 dark:text-red-200">{error}</span>
    </motion.div>
  );
}
