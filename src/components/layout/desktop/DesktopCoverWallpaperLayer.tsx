import { AnimatePresence, motion } from "motion/react";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import { usePublishNowPlayingCover } from "@/stores/useNowPlayingCoverBridge";

export function CoverWallpaperLayer() {
  const { coverUrl } = useNowPlayingCover();
  // Publish to the lightweight bridge for boot-path consumers (menubar tone).
  usePublishNowPlayingCover(coverUrl);

  return (
    <div className="absolute inset-0 w-full h-full z-[-10] overflow-hidden bg-neutral-950">
      <AnimatePresence mode="popLayout">
        {coverUrl ? (
          <motion.div
            key={coverUrl}
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Full-bleed cover: fills the entire desktop, cropping as needed. */}
            <div
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: `url("${coverUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
            {/* Subtle darkening keeps desktop icons readable. */}
            <div className="absolute inset-0 w-full h-full bg-black/25" />
          </motion.div>
        ) : (
          <motion.div
            key="cover-empty"
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              backgroundImage:
                "linear-gradient(to bottom, #1a1a1f 0%, #0c0c10 100%)",
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
