import type { MouseEvent, TouchEvent } from "react";
import { cn } from "@/lib/utils";
import type { LinkMetadata } from "../types";
import { getFaviconUrl } from "../utils";
import { LinkPreviewActionButtons } from "./LinkPreviewActionButtons";

export function LinkPreviewFullWidthContent({
  url,
  metadata,
  isMacOSTheme,
  handleAddToIpod,
  handleOpenInKaraoke,
  handleOpenYouTube,
  handleOpenExternally,
}: {
  url: string;
  metadata: LinkMetadata;
  isMacOSTheme: boolean;
  handleAddToIpod: (e: MouseEvent | TouchEvent) => void;
  handleOpenInKaraoke: (e: MouseEvent | TouchEvent) => void;
  handleOpenYouTube: (e: MouseEvent | TouchEvent) => void;
  handleOpenExternally: (e: MouseEvent | TouchEvent) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "relative aspect-video bg-neutral-100 overflow-hidden",
          isMacOSTheme && "-mx-3 -mt-[6px] rounded-t-[14px]"
        )}
      >
        <img
          src={metadata.image!}
          alt={metadata.title || "Link preview"}
          className="size-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <div className="flex items-center gap-2">
            <img
              src={getFaviconUrl(url)}
              alt="Site favicon"
              className="size-4 flex-shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
            <div className="size-4 bg-neutral-300 rounded-full flex-shrink-0 hidden"></div>
            {metadata.title && (
              <h3 className="font-semibold text-white text-[10px] truncate">
                {metadata.title}
              </h3>
            )}
          </div>
        </div>
      </div>

      <LinkPreviewActionButtons
        url={url}
        isMacOSTheme={isMacOSTheme}
        layout="fullWidth"
        handleAddToIpod={handleAddToIpod}
        handleOpenInKaraoke={handleOpenInKaraoke}
        handleOpenYouTube={handleOpenYouTube}
        handleOpenExternally={handleOpenExternally}
      />
    </>
  );
}
