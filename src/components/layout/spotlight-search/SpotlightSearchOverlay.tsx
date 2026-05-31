import { motion, AnimatePresence } from "framer-motion";
import { SpotlightMobileProxyInput } from "./SpotlightMobileProxyInput";
import { SpotlightSearchPanel } from "./SpotlightSearchPanel";
import type { SpotlightSearchViewModel } from "./useSpotlightSearchController";

type SpotlightSearchOverlayProps = {
  vm: SpotlightSearchViewModel;
};

export function SpotlightSearchOverlay({ vm }: SpotlightSearchOverlayProps) {
  const {
    isOpen,
    isMobile,
    proxyInputRef,
    reset,
    handleKeyDown,
    panelPositionClass,
    panelTopStyle,
    needsCenter,
  } = vm;

  return (
    <>
      {isMobile && !isOpen && (
        <SpotlightMobileProxyInput proxyInputRef={proxyInputRef} />
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
              <SpotlightSearchPanel vm={vm} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
