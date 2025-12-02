import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

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
            ? '"Pixelated MS Sans Serif", Arial'
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
            ? '"Pixelated MS Sans Serif", Arial'
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
  appName: string;
}

export function HelpDialog({
  isOpen,
  onOpenChange,
  helpItems = [],
  appName,
}: HelpDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

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
            ? '"Pixelated MS Sans Serif", Arial'
            : undefined,
          fontSize: isXpTheme ? "18px" : undefined,
        }}
      >
        {t("common.dialog.welcomeTo")} {appName}
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
            <DialogHeader>{t("common.dialog.help")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
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
