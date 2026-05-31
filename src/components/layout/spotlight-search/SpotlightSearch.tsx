import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSpotlightSearchController } from "./useSpotlightSearchController";
import { SpotlightSearchPanel } from "./SpotlightSearchPanel";

const proxyInputStyle = {
  position: "fixed" as const,
  opacity: 0,
  pointerEvents: "none" as const,
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  fontSize: "16px",
  border: "none",
  padding: 0,
  margin: 0,
};

export function SpotlightSearch() {
  const ctrl = useSpotlightSearchController();
  const {
    isOpen,
    reset,
    hasBeenOpen,
    isMobile,
    proxyInputRef,
    panelPositionClass,
    panelTopStyle,
    needsCenter,
    handleKeyDown,
  } = ctrl;

  if (!hasBeenOpen) {
    if (isMobile) {
      return createPortal(
        <input
          ref={proxyInputRef}
          aria-hidden="true"
          tabIndex={-1}
          style={proxyInputStyle}
        />,
        document.body
      );
    }
    return null;
  }

  const overlay = (
    <>
      {isMobile && !isOpen && (
        <input
          ref={proxyInputRef}
          aria-hidden="true"
          tabIndex={-1}
          style={proxyInputStyle}
        />
      )}
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
