import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";

export interface FullscreenMobileDismissProps {
  visible: boolean;
  onDismiss: () => void;
  onInteraction?: () => void;
  /** Extra condition to keep the control interactive (e.g. menus open) */
  forceVisible?: boolean;
}

/**
 * Top-right fullscreen dismiss pill used on narrow viewports (matches Karaoke / iPod FullScreenPortal).
 */
export function FullscreenMobileDismiss({
  visible,
  onDismiss,
  onInteraction,
  forceVisible = false,
}: FullscreenMobileDismissProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  const show = visible || forceVisible;

  return (
    <div
      data-toolbar
      className={cn(
        "fixed z-[10001] md:hidden transition-opacity duration-200",
        show ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
      style={{
        top: "calc(max(env(safe-area-inset-top), 0.75rem) + 0.75rem)",
        right: "calc(max(env(safe-area-inset-right), 0.75rem) + 0.75rem)",
      }}
    >
      <div
        className={cn(
          isMacTheme
            ? "relative overflow-hidden rounded-full shadow-lg flex items-center gap-1 px-1 py-1"
            : "border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-1 py-1 bg-neutral-800/35"
        )}
        style={
          isMacTheme
            ? {
                background:
                  "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                boxShadow:
                  "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
              }
            : {}
        }
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            playClick();
            onInteraction?.();
            onDismiss();
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          aria-label={t("apps.ipod.ariaLabels.closeFullscreen")}
          title={t("common.dialog.close")}
        >
          <X weight="bold" size={18} />
        </button>
      </div>
    </div>
  );
}
