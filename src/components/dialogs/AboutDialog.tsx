import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useTranslation } from "react-i18next";
import { getTranslatedAppName, AppId } from "@/utils/i18n";

interface AboutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: {
    name: string;
    version: string;
    creator: {
      name: string;
      url: string;
    };
    github: string;
    icon: string;
  };
  appId?: AppId;
}

export function AboutDialog({
  isOpen,
  onOpenChange,
  metadata,
  appId,
}: AboutDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  
  // Use translated app name if appId is provided, otherwise fall back to metadata.name
  const displayName = appId ? getTranslatedAppName(appId) : metadata.name;

  const dialogContent = (
    <div className="flex flex-col items-center justify-center space-y-2 py-8 px-6">
      <div>
        <ThemedIcon
          name={metadata.icon}
          alt="App Icon"
          className="w-12 h-12 mx-auto [image-rendering:pixelated]"
        />
      </div>
      <div
        className={cn(
          "space-y-0 text-center",
          isXpTheme
            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
            : "font-geneva-12 text-[10px]"
        )}
        style={{
          fontFamily: isXpTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isXpTheme ? "11px" : undefined,
        }}
      >
        <div
          className={cn(
            "!text-3xl font-medium",
            isXpTheme
              ? "font-['Trebuchet MS'] !text-[17px]"
              : "font-apple-garamond"
          )}
        >
          {displayName}
        </div>
        <p className="text-gray-500 mb-2">{t("common.dialog.version")} {metadata.version}</p>
        <p>
          {t("common.dialog.madeBy")}{" "}
          <a
            href={metadata.creator.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            {metadata.creator.name}
          </a>
        </p>
        <p>
          <a
            href={metadata.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            {t("common.dialog.openInGitHub")}
          </a>
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("w-fit min-w-[280px] max-w-[400px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{t("common.dialog.aboutApp", { appName: displayName })}</DialogHeader>
            <div className={`window-body ${isXpTheme ? "p-2 px-4" : "p-4"}`}>
              {dialogContent}
            </div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>{t("common.dialog.aboutApp", { appName: displayName })}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("common.dialog.aboutApp", { appName: displayName })}
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
