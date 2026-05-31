import type { FC } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const SynthStatusDisplay: FC<{ message: string | null }> = ({
  message,
}) => {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-4 w-full text-center left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black/80 backdrop-blur-sm text-[#ff00ff] text-[12px] font-geneva-12 z-10 select-none"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
