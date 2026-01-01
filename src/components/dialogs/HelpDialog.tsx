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

// Map appId to doc URL path (most are same, but some have different names)
const APP_DOC_NAMES: Partial<Record<AppId, string>> = {
  pc: "virtual-pc",
  "applet-viewer": "applet-store",
};

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
  const launchApp = useAppStore((state) => state.launchApp);

  // Use localized app name if appId is provided, otherwise fall back to appName
  const displayAppName = appId ? getTranslatedAppName(appId) : appName || "";

  const handleViewDocs = () => {
    // Get the doc name for this app (use mapping or fall back to appId)
    const docName = appId ? (APP_DOC_NAMES[appId] || appId) : "";
    const docsUrl = docName
      ? `https://os.ryo.lu/docs/${docName}`
      : "https://os.ryo.lu/docs";

    launchApp("internet-explorer", {
      url: docsUrl,
      year: "current",
    });
    onOpenChange(false);
  };

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-6 pt-4"}>
      <div className="flex items-center justify-between mb-4">
        <p
          className={cn(
            "text-2xl",
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
        {isMacTheme ? (
          <button
            className="aqua-button secondary text-[12px] px-3 py-1"
            onClick={handleViewDocs}
          >
            {t("common.dialog.viewDocs")}
          </button>
        ) : isXpTheme ? (
          <button className="button" onClick={handleViewDocs}>
            {t("common.dialog.viewDocs")}
          </button>
        ) : (
          <Button
            variant="retro"
            className="text-[11px] px-3 py-1 h-auto"
            onClick={handleViewDocs}
          >
            {t("common.dialog.viewDocs")}
          </Button>
        )}
      </div>
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
            <DialogHeader>{t("common.dialog.help")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogHeader>{t("common.dialog.help")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("common.dialog.help")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("common.dialog.informationAboutApp")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
