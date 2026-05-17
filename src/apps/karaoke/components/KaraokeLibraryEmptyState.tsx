import type { LibrarySource } from "@/stores/useIpodStore";
import type { CSSProperties, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSound, Sounds } from "@/hooks/useSound";

/** Matches ListenSessionToolbar / FullscreenPlayerControls top shine */
function KaraokeToolbarShine() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{
        top: "2px",
        height: "35%",
        width: "calc(100% - 24px)",
        borderRadius: "100px",
        background: "linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
        filter: "blur(0.5px)",
        zIndex: 2,
      }}
    />
  );
}

interface KaraokeLibraryEmptyStateProps {
  onAddSongs: () => void;
  /** When Apple Music is the active iPod library, prompt to use iPod to load music. */
  librarySource?: LibrarySource;
  className?: string;
}

export function KaraokeLibraryEmptyState({
  onAddSongs,
  librarySource = "youtube",
  className,
}: KaraokeLibraryEmptyStateProps) {
  const { t } = useTranslation();
  const { isMacOSTheme: isMacTheme } = useThemeFlags();
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  // ListenSessionToolbar — segment + icon button + text label
  const segmentClasses = isMacTheme
    ? "relative overflow-hidden rounded-full shadow-lg flex items-center gap-1 px-1 py-1"
    : "flex items-center gap-1 rounded-full border border-white/10 bg-neutral-800/60 px-1 py-1 shadow-lg backdrop-blur-sm";

  const aquaSegmentStyle: CSSProperties = isMacTheme
    ? {
        background: "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
        boxShadow:
          "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
      }
    : {};

  const buttonClasses = isMacTheme
    ? "size-8 flex items-center justify-center rounded-full transition-colors focus:outline-none relative z-10"
    : "size-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none";

  const iconClasses = isMacTheme
    ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    : "text-white/90";

  const handleAddSongs = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    playClick();
    onAddSongs();
  };

  return (
    <div
      className={cn(
        "ipod-force-font flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-4 px-6 text-center select-none",
        className
      )}
    >
      <ThemedIcon
        name="/icons/default/karaoke.png"
        alt=""
        className="size-16 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        aria-hidden
      />
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-sm font-semibold text-white/90">
          {t("apps.karaoke.emptyLibrary.title")}
        </p>
        <p className="text-xs leading-snug text-white/50">
          {librarySource === "appleMusic"
            ? t("apps.karaoke.emptyLibrary.subtitleAppleMusic")
            : t("apps.karaoke.emptyLibrary.subtitle")}
        </p>
      </div>
      {librarySource === "youtube" && (
        <div className="relative flex items-center justify-center">
          <div className={segmentClasses} style={aquaSegmentStyle}>
            {isMacTheme && <KaraokeToolbarShine />}
            <button
              type="button"
              onClick={handleAddSongs}
              className={cn(buttonClasses, "gap-1 px-2 w-auto")}
            >
              <span className={cn("text-sm", iconClasses)}>
                {t("apps.karaoke.emptyLibrary.addSongs")}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
