import type { Dispatch, MouseEvent, TouchEvent } from "react";
import { cn } from "@/lib/utils";
import type { LinkMetadata, LinkPreviewAction } from "../types";
import { getFaviconUrl, isYouTubeUrl } from "../utils";
import { LinkPreviewActionButtons } from "./LinkPreviewActionButtons";

export function LinkPreviewSideBySideContent({
  url,
  metadata,
  isMacOSTheme,
  dispatch,
  handleAddToIpod,
  handleOpenInKaraoke,
  handleOpenYouTube,
  handleOpenExternally,
}: {
  url: string;
  metadata: LinkMetadata;
  isMacOSTheme: boolean;
  dispatch: Dispatch<LinkPreviewAction>;
  handleAddToIpod: (e: MouseEvent | TouchEvent) => void;
  handleOpenInKaraoke: (e: MouseEvent | TouchEvent) => void;
  handleOpenYouTube: (e: MouseEvent | TouchEvent) => void;
  handleOpenExternally: (e: MouseEvent | TouchEvent) => void;
}) {
  return (
    <>
      <div className="flex">
        {metadata.image && (
          <div
            className={cn(
              "size-18 bg-neutral-100 dark:bg-neutral-800 relative overflow-hidden flex-shrink-0",
              isMacOSTheme && "hidden"
            )}
          >
            <img
              src={metadata.image}
              alt={metadata.title || "Link preview"}
              className="size-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              onLoad={(e) => {
                const img = e.currentTarget;
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                const shouldBeFullWidth =
                  isYouTubeUrl(url) || aspectRatio > 1.5;

                if (shouldBeFullWidth) {
                  dispatch({
                    type: "setFullWidthThumbnail",
                    enabled: true,
                  });
                }
              }}
            />
          </div>
        )}

        <div
          className={`flex-1 min-w-0 p-3 ${
            metadata.image ? "flex flex-col justify-center" : ""
          }`}
        >
          {metadata.title && (
            <h3
              className="font-semibold text-neutral-900 dark:text-neutral-100 text-[10px]"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {metadata.title}
            </h3>
          )}

          {metadata.description && (
            <p
              className={`text-[10px] text-neutral-600 dark:text-neutral-400 ${
                metadata.image ? "" : "mb-2"
              }`}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {metadata.description}
            </p>
          )}

          {!metadata.image && (
            <div className="flex items-center gap-2">
              <img
                src={getFaviconUrl(url)}
                alt="Site favicon"
                className="size-4 flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.remove(
                    "hidden"
                  );
                }}
              />
              <div className="size-4 bg-neutral-300 dark:bg-neutral-600 rounded-full flex-shrink-0 hidden"></div>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                {metadata.siteName || new URL(url).hostname}
              </p>
            </div>
          )}
        </div>
      </div>

      <LinkPreviewActionButtons
        url={url}
        isMacOSTheme={isMacOSTheme}
        layout="sideBySide"
        handleAddToIpod={handleAddToIpod}
        handleOpenInKaraoke={handleOpenInKaraoke}
        handleOpenYouTube={handleOpenYouTube}
        handleOpenExternally={handleOpenExternally}
      />
    </>
  );
}
