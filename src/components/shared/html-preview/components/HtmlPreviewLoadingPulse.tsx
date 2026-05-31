import { motion } from "framer-motion";

export function HtmlPreviewLoadingPulse() {
  return (
    <motion.div
      className="absolute inset-0 bg-neutral-300 z-10 pointer-events-none"
      initial={{ opacity: 0.2 }}
      animate={{ opacity: [0.2, 0.6, 0.2] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
