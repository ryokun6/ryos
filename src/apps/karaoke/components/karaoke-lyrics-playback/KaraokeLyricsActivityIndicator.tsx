import { AnimatePresence, motion } from "framer-motion";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { useKaraokeLyricsPlayback } from "./context";

export function KaraokeLyricsActivityIndicator() {
  const { activityState, hasActiveActivity } = useKaraokeLyricsPlayback();
  return (
    <AnimatePresence>
      {hasActiveActivity && (
        <motion.div
          className="absolute top-8 right-6 z-40 pointer-events-none flex justify-end"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
        >
          <ActivityIndicatorWithLabel size={32} state={activityState} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
