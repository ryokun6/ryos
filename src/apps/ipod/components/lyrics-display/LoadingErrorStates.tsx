import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";

export const LoadingState = ({
  bottomPaddingClass = "pb-5",
}: {
  bottomPaddingClass?: string;
}) => {
  return (
    <div
      className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
    />
  );
};

export const ErrorState = ({
  error,
  bottomPaddingClass = "pb-5",
  textSizeClass = "text-[12px]",
  fontClassName = "font-geneva-12",
}: {
  error?: string;
  bottomPaddingClass?: string;
  textSizeClass?: string;
  fontClassName?: string;
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Fade out after 3 seconds
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
        >
          <div className={`text-white/70 ${textSizeClass} ${fontClassName}`}>
            {error || t("apps.ipod.lyrics.unableToLoad")}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
