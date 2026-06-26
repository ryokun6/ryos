import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getTranslatedAppName, type AppId } from "@/utils/i18n";
import { useAppStore } from "@/stores/useAppStore";
import { getDocsBaseUrl } from "@/utils/runtimeConfig";

// Map appId to doc URL path (most are same, but some have different names)
const APP_DOC_NAMES: Partial<Record<AppId, string>> = {
  pc: "virtual-pc",
  "applet-viewer": "applet-store",
};

interface HelpCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

function HelpCard({ icon, title, description }: HelpCardProps) {
  const { isWindowsTheme, isMacOSTheme: isMacTheme } =
    useThemeFlags();

  return (
    <div className="flex gap-3 rounded-os bg-black/5 p-3 transition-colors sm:block sm:p-4">
      <div
        className="flex shrink-0 items-start !text-[18px] sm:mb-0 sm:items-center"
        style={{ height: 22 }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            "font-medium leading-snug",
            isWindowsTheme && "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]",
            isMacTheme && "font-bold"
          )}
          style={{
            fontFamily: isWindowsTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isWindowsTheme ? "11px" : undefined,
          }}
        >
          {title}
        </h3>
        <p
          className={cn(
            "mt-0.5 text-neutral-700 leading-snug",
            isWindowsTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
              : "font-geneva-12 text-[10px]"
          )}
          style={{
            fontFamily: isWindowsTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isWindowsTheme ? "10px" : undefined,
          }}
        >
          {description}
        </p>
      </div>
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

function useHelpCardScrollerFade(isActive: boolean, itemCount: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollEl(node);
  }, []);

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    const canScroll = maxScroll > 1;

    setFadeTop(canScroll && scrollTop > 1);
    setFadeBottom(canScroll && scrollTop < maxScroll - 1);
  }, []);

  useEffect(() => {
    if (!isActive) {
      setFadeTop(false);
      setFadeBottom(false);
      return;
    }
    if (!scrollEl) return;

    scrollEl.scrollTop = 0;

    const scheduleUpdate = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updateFade);
      });
    };

    scheduleUpdate();
    const measureTimer = window.setTimeout(updateFade, 150);

    scrollEl.addEventListener("scroll", updateFade, { passive: true });
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(scrollEl);
    const content = scrollEl.firstElementChild;
    if (content) resizeObserver.observe(content);

    return () => {
      window.clearTimeout(measureTimer);
      scrollEl.removeEventListener("scroll", updateFade);
      resizeObserver.disconnect();
    };
  }, [isActive, itemCount, scrollEl, updateFade]);

  return { setScrollRef, fadeTop, fadeBottom };
}

export function HelpDialog({
  isOpen,
  onOpenChange,
  helpItems = [],
  appName,
  appId,
}: HelpDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme: isMacTheme } =
    useThemeFlags();
  const launchApp = useAppStore((state) => state.launchApp);

  // Use localized app name if appId is provided, otherwise fall back to appName
  const displayAppName = appId ? getTranslatedAppName(appId) : appName || "";
  const { setScrollRef, fadeTop, fadeBottom } = useHelpCardScrollerFade(
    isOpen,
    helpItems.length
  );

  const handleViewDocs = () => {
    // Get the doc name for this app (use mapping or fall back to appId)
    const docName = appId ? (APP_DOC_NAMES[appId] || appId) : "";
    // Preserve /docs in the base URL (runtime docsBaseUrl must not be origin-only
    // or IE opens app routes like /ipod instead of /docs/ipod).
    const docsBaseUrl = getDocsBaseUrl().replace(/\/+$/, "");
    const docsUrl = docName ? `${docsBaseUrl}/${docName}` : docsBaseUrl;

    launchApp("internet-explorer", {
      url: docsUrl,
      year: "current",
    });
    onOpenChange(false);
  };

  const dialogContent = (
    <div className={isWindowsTheme ? "p-2 px-4" : "p-6 pt-4"}>
      <div className="mb-4 flex items-center justify-between">
        <p
          className={cn(
            "text-2xl",
            isWindowsTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial]"
              : "font-apple-garamond"
          )}
          style={{
            fontFamily: isWindowsTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isWindowsTheme ? "18px" : undefined,
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
        ) : isWindowsTheme ? (
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
      <div
        ref={setScrollRef}
        className={cn(
          "help-dialog-card-scroller__viewport max-h-[min(calc(90dvh-11rem),28rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
          fadeTop && "help-dialog-card-scroller__viewport--fade-top",
          fadeBottom && "help-dialog-card-scroller__viewport--fade-bottom"
        )}
      >
        <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
          {helpItems.map((item) => (
            <HelpCard key={item.title} {...item} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[min(600px,calc(100vw-1.5rem))] overflow-hidden",
          isWindowsTheme && "p-0"
        )}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.dialog.help")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.dialog.informationAboutApp")}
            </DialogDescription>
            <DialogHeader>{t("common.dialog.help")}</DialogHeader>
            <div className="window-body overflow-hidden">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.dialog.help")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.dialog.informationAboutApp")}
            </DialogDescription>
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
