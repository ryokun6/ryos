import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSpotlightStore } from "@/stores/useSpotlightStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { onSpotlightToggle } from "@/utils/appEventBus";

const loadSpotlightSearchOverlay = () => import("./SpotlightSearch");

const SpotlightSearchOverlay = lazy(() =>
  loadSpotlightSearchOverlay().then((m) => ({ default: m.SpotlightSearch }))
);

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

/**
 * Always-mounted, dependency-light Spotlight host.
 *
 * The actual search overlay (and its controller, which subscribes to the
 * iPod/Files/IE/Videos/Calendar/Contacts stores plus the full app registry)
 * is code-split and only loaded on first open. This host owns the pieces that
 * must exist before that point:
 *   - the global toggle listener (Cmd+Space / menu bar / Start menu),
 *   - the hidden mobile proxy input that is focused inside the user gesture
 *     so the on-screen keyboard can transfer to the real input on open.
 */
export function SpotlightSearchHost() {
  const isOpen = useSpotlightStore((s) => s.isOpen);
  const [hasBeenOpen, setHasBeenOpen] = useState(isOpen);
  const isMobile = useIsMobile();
  const proxyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setHasBeenOpen(true);
  }, [isOpen]);

  useEffect(() => {
    const handler = () => {
      const state = useSpotlightStore.getState();
      if (!state.isOpen && isMobile && proxyInputRef.current) {
        proxyInputRef.current.focus();
      }
      state.toggle();
    };
    return onSpotlightToggle(handler);
  }, [isMobile]);

  // Warm the overlay chunk once the browser is idle so the first open is
  // instant without paying for it during boot.
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(() => {
        void loadSpotlightSearchOverlay();
      });
      return () => win.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => {
      void loadSpotlightSearchOverlay();
    }, 2500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      {isMobile &&
        !isOpen &&
        createPortal(
          <input
            ref={proxyInputRef}
            aria-hidden="true"
            tabIndex={-1}
            style={proxyInputStyle}
          />,
          document.body
        )}
      {hasBeenOpen && (
        <Suspense fallback={null}>
          <SpotlightSearchOverlay />
        </Suspense>
      )}
    </>
  );
}
