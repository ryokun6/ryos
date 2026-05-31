import { motion } from "framer-motion";

export function HtmlPreviewLoadingPulse() {
  return (
    <motion.div
      className="absolute inset-0 z-10 pointer-events-none bg-neutral-300/80 dark:bg-neutral-800/70"
      initial={{ opacity: 0.15 }}
      animate={{ opacity: [0.15, 0.38, 0.15] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
