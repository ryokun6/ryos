import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AlphabetScrollOverlayProps {
  /** Single character to display, or null to hide the overlay. */
  letter: string | null;
  /** Selected UI skin — drives typography + chrome. */
  variant?: "classic" | "modern";
}

/**
 * Large semi-transparent letter rendered in the center of the iPod
 * LCD while the user is spinning the wheel fast through an
 * alphabetically-sorted list (Albums / Artists / Playlists / All
 * Songs). Mirrors the iOS contacts / iPod classic "alphabet scrubber"
 * affordance: a chunky letter the user can latch onto as feedback
 * for where they are in A→Z without each row's full label having to
 * be readable at speed.
 *
 * The letter is owned by the parent — this component only handles
 * presentation and the fade-in / fade-out transition.
 */
export function AlphabetScrollOverlay({
  letter,
  variant = "classic",
}: AlphabetScrollOverlayProps) {
  const isModern = variant === "modern";
  return (
    <AnimatePresence>
      {letter ? (
        <motion.div
          key="alphabet-overlay"
          className={cn(
            // Match the menu body's stacking — sit above virtualized
            // rows and the split-art column, below the titlebar (z-20)
            // so the silver header is never occluded.
            "absolute inset-0 z-[15] pointer-events-none",
            "flex items-center justify-center"
          )}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <div
            className={cn(
              "flex items-center justify-center select-none",
              isModern
                ? cn(
                    "size-[68px] rounded-2xl",
                    // Dark glassy pill matching the iOS 6 status-bar
                    // tinted overlay style used elsewhere in the
                    // modern skin (e.g. fullscreen status messages).
                    "bg-black/55 text-white",
                    "backdrop-blur-[2px]",
                    "shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                  )
                : cn(
                    "size-[60px] rounded-md",
                    // Classic LCD: deep iPod blue fill so the letter
                    // reads against the cyan backlight; outlined with
                    // a 1px hairline to match the rest of the chrome.
                    "bg-[#0a3667]/85 text-[#c5e0f5]",
                    "border border-[#0a3667]",
                    "shadow-[0_1px_0_rgba(255,255,255,0.4)]"
                  )
            )}
          >
            <span
              className={cn(
                "leading-none font-bold",
                isModern
                  ? "font-ipod-modern-ui text-[44px]"
                  : "font-chicago text-[40px]"
              )}
              style={{ transform: "translateY(-1px)" }}
              aria-hidden
            >
              {letter}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
