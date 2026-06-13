import type { MouseEvent, TouchEvent } from "react";
import { ArrowSquareOut, Microphone, MusicNote } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { isYouTubeUrl } from "../utils";

type LayoutVariant = "fullWidth" | "sideBySide";

/** Border above link-preview action rows — OS tokens on macOS Aqua, Tailwind elsewhere. */
function linkPreviewActionsDividerClass(isMacOSTheme: boolean) {
  return cn(
    "link-preview-actions-divider border-t",
    isMacOSTheme
      ? "border-black/10 os-mac-aqua-dark:border-[color:var(--os-color-separator)]"
      : "border-neutral-200 dark:border-neutral-700"
  );
}

function actionButtonClass(
  isMacOSTheme: boolean,
  variant: "pair" | "fullWidthSingle"
) {
  if (isMacOSTheme) {
    return cn(
      "aqua-button secondary",
      variant === "pair" ? "flex-1" : "w-full"
    );
  }
  return cn(
    "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-100 rounded-md transition-colors",
    variant === "pair" ? "flex-1" : "w-full"
  );
}

export function LinkPreviewActionButtons({
  url,
  isMacOSTheme,
  layout,
  handleAddToIpod,
  handleOpenInKaraoke,
  handleOpenYouTube,
  handleOpenExternally,
}: {
  url: string;
  isMacOSTheme: boolean;
  layout: LayoutVariant;
  handleAddToIpod: (e: MouseEvent | TouchEvent) => void;
  handleOpenInKaraoke: (e: MouseEvent | TouchEvent) => void;
  handleOpenYouTube: (e: MouseEvent | TouchEvent) => void;
  handleOpenExternally: (e: MouseEvent | TouchEvent) => void;
}) {
  const { t } = useTranslation();
  const dividerClass = linkPreviewActionsDividerClass(isMacOSTheme);
  const stopTouch = (e: TouchEvent) => e.stopPropagation();

  const flexRow = (
    <>
      {!isYouTubeUrl(url) ? (
        <button
          onClick={handleOpenExternally}
          onTouchStart={stopTouch}
          className={actionButtonClass(isMacOSTheme, "fullWidthSingle")}
          title="Open Externally"
          data-link-preview
        >
          {!isMacOSTheme && (
            <ArrowSquareOut className="size-3" weight="bold" />
          )}
          <span>Open Externally</span>
        </button>
      ) : url.includes("/ipod/") ? (
        <>
          <button
            onClick={handleAddToIpod}
            onTouchStart={stopTouch}
            className={actionButtonClass(isMacOSTheme, "pair")}
            title={t("components.linkPreview.openIpod")}
            data-link-preview
          >
            {!isMacOSTheme && (
              <MusicNote className="size-3" weight="bold" />
            )}
            <span>{t("components.linkPreview.openIpod")}</span>
          </button>
          <button
            onClick={handleOpenYouTube}
            onTouchStart={stopTouch}
            className={actionButtonClass(isMacOSTheme, "pair")}
            title={t("components.linkPreview.openYouTube")}
            data-link-preview
          >
            {!isMacOSTheme && (
              <ArrowSquareOut className="size-3" weight="bold" />
            )}
            <span>{t("components.linkPreview.openYouTube")}</span>
          </button>
        </>
      ) : url.includes("/karaoke/") ? (
        <>
          <button
            onClick={handleOpenInKaraoke}
            onTouchStart={stopTouch}
            className={actionButtonClass(isMacOSTheme, "pair")}
            title={t("components.linkPreview.openKaraoke")}
            data-link-preview
          >
            {!isMacOSTheme && (
              <Microphone className="size-3" weight="bold" />
            )}
            <span>{t("components.linkPreview.openKaraoke")}</span>
          </button>
          <button
            onClick={handleOpenYouTube}
            onTouchStart={stopTouch}
            className={actionButtonClass(isMacOSTheme, "pair")}
            title={t("components.linkPreview.openYouTube")}
            data-link-preview
          >
            {!isMacOSTheme && (
              <ArrowSquareOut className="size-3" weight="bold" />
            )}
            <span>{t("components.linkPreview.openYouTube")}</span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleAddToIpod}
            onTouchStart={stopTouch}
            className={actionButtonClass(isMacOSTheme, "pair")}
            title={t("components.linkPreview.addToIpod")}
            data-link-preview
          >
            {!isMacOSTheme && (
              <MusicNote className="size-3" weight="bold" />
            )}
            <span>{t("components.linkPreview.addToIpod")}</span>
          </button>
          <button
            onClick={handleOpenYouTube}
            onTouchStart={stopTouch}
            className={actionButtonClass(isMacOSTheme, "pair")}
            title={t("components.linkPreview.openYouTube")}
            data-link-preview
          >
            {!isMacOSTheme && (
              <ArrowSquareOut className="size-3" weight="bold" />
            )}
            <span>{t("components.linkPreview.openYouTube")}</span>
          </button>
        </>
      )}
    </>
  );

  if (layout === "fullWidth") {
    return (
      <div className="px-2 pb-2">
        <div className={cn("flex gap-2 pt-2", dividerClass)}>
          {flexRow}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("pb-2", dividerClass)}>
      <div className="px-2 pt-2">
        <div className="flex gap-2">{flexRow}</div>
      </div>
    </div>
  );
}
