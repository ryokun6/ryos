import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  MODERN_SPLIT_HALF,
  SPLIT_ART_CROSSFADE_SECONDS,
  SPLIT_LAYOUT_TRANSITION_TIMING,
} from "./constants";

export interface IpodScreenSplitArtPanelProps {
  showSplitMenuArt: boolean;
  splitLayoutTransitionReady: boolean;
  displayedSplitArtUrl: string | null;
}

export function IpodScreenSplitArtPanel({
  showSplitMenuArt,
  splitLayoutTransitionReady,
  displayedSplitArtUrl,
}: IpodScreenSplitArtPanelProps) {
  return (
    <div
      className={cn(
        // Outer container: width animates 50% ↔ 0% in lock-step with
        // the menu panel's 50% ↔ 100% width animation. We do NOT
        // fade the container's own opacity — the panel's solid-black
        // background must remain visible as the cover image fades
        // off so it reads as a true "black backface" peeking out
        // from under the covers (instead of letting the white
        // screen leak through a half-faded panel).
        "ipod-modern-split-art absolute top-0 right-0 bottom-0 z-[5] overflow-hidden",
        splitLayoutTransitionReady &&
          `transition-[width] ${SPLIT_LAYOUT_TRANSITION_TIMING}`
      )}
      style={{
        width: showSplitMenuArt ? MODERN_SPLIT_HALF : "0%",
      }}
      aria-hidden
    >
      {/* Cover art layer: fades on its OWN opacity track, leaving
       *  the parent panel at full opacity. When `showSplitMenuArt`
       *  flips off, the image fades to 0 over the same 300ms
       *  window as the width transition — revealing the solid
       *  black backface beneath before the column clips away.
       *
       *  We render against `displayedSplitArtUrl`, which only changes
       *  after the debounced target image has loaded. That lets
       *  AnimatePresence cross-fade loaded bitmap to loaded bitmap
       *  instead of fading the old cover to black while the next one
       *  is still in flight. */}
      <div
        className={cn(
          "absolute inset-0",
          splitLayoutTransitionReady &&
            `transition-opacity ${SPLIT_LAYOUT_TRANSITION_TIMING}`
        )}
        style={{ opacity: showSplitMenuArt ? 1 : 0 }}
      >
        {displayedSplitArtUrl ? (
          <AnimatePresence initial={false} mode="sync">
            <motion.img
              key={displayedSplitArtUrl}
              src={displayedSplitArtUrl}
              alt=""
              draggable={false}
              className="ipod-modern-split-art-img absolute inset-0 size-full object-cover select-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: SPLIT_ART_CROSSFADE_SECONDS,
                ease: "easeInOut",
              }}
            />
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );
}
