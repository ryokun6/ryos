import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getTranslatedAppName, type AppId } from "@/utils/i18n";
import { useAppStore } from "@/stores/useAppStore";

interface HelpCardProps {
  icon: string;
  title: string;
  description: string;
}

function HelpCard({ icon, title, description }: HelpCardProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  return (
    <div className="p-4 bg-black/5 rounded-os transition-colors">
      <div className="!text-[18px]">{icon}</div>
      <h3
        className={cn(
          "font-medium",
          isXpTheme && "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]",
          isMacTheme && "font-bold"
        )}
        style={{
          fontFamily: isXpTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isXpTheme ? "11px" : undefined,
        }}
      >
        {title}
      </h3>
      <p
        className={cn(
          "text-gray-700",
          isXpTheme
            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
            : "font-geneva-12 text-[10px]"
        )}
        style={{
          fontFamily: isXpTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isXpTheme ? "10px" : undefined,
        }}
      >
        {description}
      </p>
    </div>
  );
}

interface HelpDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  helpItems: HelpCardProps[];
  appName?: string; // Deprecated: use appId instead
  appId?: AppId; // Preferred: will use localized app name
}

export function HelpDialog({
  isOpen,
  onOpenChange,
  helpItems = [],
  appName,
  appId,
}: HelpDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";
  const openApp = useAppStore((state) => state.openApp);

  // Use localized app name if appId is provided, otherwise fall back to appName
  const displayAppName = appId ? getTranslatedAppName(appId) : appName || "";

  const handleViewDocs = () => {
    openApp("internet-explorer", {
      initialUrl: "https://os.ryo.lu/docs",
      initialYear: "current",
    });
    onOpenChange(false);
  };

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-6 pt-4"}>
      <p
        className={cn(
          "text-2xl mb-4",
          isXpTheme
            ? "font-['Pixelated_MS_Sans_Serif',Arial]"
            : "font-apple-garamond"
        )}
        style={{
          fontFamily: isXpTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isXpTheme ? "18px" : undefined,
        }}
      >
        {t("common.dialog.welcomeTo", { appName: displayAppName })}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {helpItems.map((item) => (
          <HelpCard key={item.title} {...item} />
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[600px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
      >
        {isXpTheme ? (
          <>
            <DialogHeader className="flex flex-row items-center justify-between">
              <span>{t("common.dialog.help")}</span>
              <button className="button" onClick={handleViewDocs}>
                {t("common.dialog.viewDocs")}
              </button>
            </DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogHeader className="flex flex-row items-center justify-between pr-8">
              <span>{t("common.dialog.help")}</span>
              <button
                className="aqua-button primary text-[12px] px-3 py-1"
                onClick={handleViewDocs}
              >
                {t("common.dialog.viewDocs")}
              </button>
            </DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader className="flex flex-row items-center justify-between pr-8">
              <DialogTitle className="font-normal text-[16px]">
                {t("common.dialog.help")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("common.dialog.informationAboutApp")}
              </DialogDescription>
              <Button
                variant="retro"
                className="text-[11px] px-3 py-1 h-auto"
                onClick={handleViewDocs}
              >
                {t("common.dialog.viewDocs")}
              </Button>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
