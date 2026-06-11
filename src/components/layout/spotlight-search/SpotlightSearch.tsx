import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useSpotlightSearchController } from "./useSpotlightSearchController";
import { SpotlightSearchPanel } from "./SpotlightSearchPanel";

// NOTE: this overlay is lazy-loaded by SpotlightSearchHost on first open.
// The host owns the global toggle listener and the mobile proxy input, so
// neither lives here anymore.
export function SpotlightSearch() {
  const ctrl = useSpotlightSearchController();
  const {
    isOpen,
    reset,
    panelPositionClass,
    panelTopStyle,
    needsCenter,
    handleKeyDown,
  } = ctrl;

  const overlay = (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[10003]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={reset}
            />

            <motion.div
              className={panelPositionClass}
              style={panelTopStyle}
              initial={{
                opacity: 0,
                scale: 0.96,
                y: -8,
                x: needsCenter ? "-50%" : 0,
              }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                x: needsCenter ? "-50%" : 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.96,
                y: -8,
                x: needsCenter ? "-50%" : 0,
              }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              onKeyDown={handleKeyDown}
            >
              <SpotlightSearchPanel ctrl={ctrl} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );

  return createPortal(overlay, document.body);
}
