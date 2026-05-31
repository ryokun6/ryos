import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export interface HtmlPreviewAppletBannerProps {
  appletIcon: string;
  appletTitle: string;
  isStreaming: boolean;
  onSave: (e: React.MouseEvent) => void | Promise<void>;
}

export function HtmlPreviewAppletBanner({
  appletIcon,
  appletTitle,
  isStreaming,
  onSave,
}: HtmlPreviewAppletBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-neutral-100 border-b border-neutral-300 flex-shrink-0">
      <div
        className="!text-2xl flex-shrink-0 applet-icon"
        style={{ fontSize: "1.5rem" }}
      >
        {appletIcon || "📱"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm font-geneva-12 truncate">
          {appletTitle || t("common.htmlPreview.bannerFallbackTitle")}
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await onSave(e);
          } catch (error) {
            console.error("Failed to save applet:", error);
          }
        }}
        className="w-[60px]"
        disabled={isStreaming}
      >
        {t("common.dialog.save")}
      </Button>
    </div>
  );
}
