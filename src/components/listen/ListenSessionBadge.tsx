import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";

interface ListenSessionBadgeProps {
  listenerCount: number;
  isHost: boolean;
  isDj: boolean;
  onOpenPanel: () => void;
  onShare: () => void;
  onLeave: () => void;
  className?: string;
}

export function ListenSessionBadge({
  listenerCount,
  isHost,
  isDj,
  onOpenPanel,
  onShare,
  onLeave,
  className,
}: ListenSessionBadgeProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const buttonClassName = cn(
    "h-6 px-2 text-[11px]",
    isXpTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial]"
      : "font-geneva-12"
  );

  const buttonStyle = isXpTheme
    ? { fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial' }
    : undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded border border-black/20 bg-white/90 backdrop-blur-sm px-1.5 py-1 shadow-sm",
        className
      )}
    >
      <Button
        variant="retro"
        onClick={onOpenPanel}
        className={buttonClassName}
        style={buttonStyle}
      >
        🎧 {listenerCount} {isDj && `• ${t("apps.karaoke.liveListen.djLabel")}`}
      </Button>
      <Button
        variant="retro"
        onClick={onShare}
        className={buttonClassName}
        style={buttonStyle}
      >
        {t("apps.karaoke.liveListen.inviteTitle")}
      </Button>
      <Button
        variant="retro"
        onClick={onLeave}
        className={buttonClassName}
        style={buttonStyle}
      >
        {isHost ? t("apps.karaoke.liveListen.endSession") : t("apps.karaoke.liveListen.leaveSession")}
      </Button>
    </div>
  );
}
