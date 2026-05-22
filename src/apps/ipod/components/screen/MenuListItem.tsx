import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useImageLoaded } from "../../hooks/useImageLoaded";
import { IPOD_MODERN_MEDIA_THUMB_PX } from "../../constants";
import { IpodArtworkPlaceholder, type IpodEmptyArtworkKind } from "./IpodArtworkPlaceholder";
import { ScrollingText } from "./ScrollingText";

const THUMB_FADE = "opacity 250ms ease-out" as const;

interface MenuListItemProps {
  text: string;
  isSelected: boolean;
  onClick: () => void;
  backlightOn?: boolean;
  showChevron?: boolean;
  value?: string;
  isLoading?: boolean;
  /**
   * When false, long labels stay static (no horizontal marquee) until the
   * parent layout has settled — e.g. during split-menu width animation.
   */
  allowScrollingMarquee?: boolean;
  /**
   * Visual skin. `"classic"` keeps the monochrome blue-on-blue
   * Chicago-font row from the original 1st-gen LCD. `"modern"` switches
   * to an iOS 6 UITableViewCell look — Helvetica Neue, white background
   * with a 1px hairline separator, and a glossy blue gradient
   * selection highlight with white text.
   */
  variant?: "classic" | "modern";
  /**
   * Modern media rows only: second line (caption). Single-line ellipsis;
   * omit or pass empty to show only the primary line.
   */
  subtitle?: string | null;
  /** Modern media rows only: square artwork (`object-cover`). */
  thumbnailUrl?: string | null;
  /** Placeholder glyph when `thumbnailUrl` is missing (default album). */
  emptyArtworkKind?: IpodEmptyArtworkKind;
  /**
   * Modern UI + browse menus stamped with `modernMediaList`: two-line label
   * column with a square thumbnail. Ignored for classic skin.
   */
  mediaRow?: boolean;
}

const CJK_TEXT_PATTERN =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

export function MenuListItem({
  text,
  isSelected,
  onClick,
  backlightOn = true,
  showChevron = true,
  value,
  isLoading = false,
  allowScrollingMarquee = true,
  variant = "classic",
  subtitle,
  thumbnailUrl,
  emptyArtworkKind = "album",
  mediaRow = false,
}: MenuListItemProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hasCjkText =
    CJK_TEXT_PATTERN.test(text) ||
    (value ? CJK_TEXT_PATTERN.test(value) : false) ||
    (subtitle ? CJK_TEXT_PATTERN.test(subtitle) : false);
  const isModern = variant === "modern";
  const thumbSrc = isModern && mediaRow ? (thumbnailUrl ?? null) : null;
  const thumb = useImageLoaded(thumbSrc);
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => {
    setThumbFailed(false);
  }, [thumbSrc]);
  const showThumbImage = Boolean(thumbSrc) && !thumbFailed;
  const subtitleTrim =
    typeof subtitle === "string" ? subtitle.trim() : "";

  if (isModern) {
    if (mediaRow) {
      return (
        <div
          ref={rowRef}
          onClick={isLoading ? undefined : onClick}
          className={cn(
            "h-full overflow-x-visible overflow-y-hidden pl-1 pr-1.5 font-ipod-modern-ui flex justify-between items-center gap-1",
            "ipod-modern-row",
            isLoading ? "cursor-default" : "cursor-pointer",
            isSelected && !isLoading
              ? "ipod-modern-row-selected"
              : isLoading
                ? "text-[#555] animate-pulse"
                : "text-black"
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 items-center gap-1.5 mr-0.5">
            <div
              className="relative shrink-0 overflow-hidden rounded-[2px]"
              style={{
                width: IPOD_MODERN_MEDIA_THUMB_PX,
                height: IPOD_MODERN_MEDIA_THUMB_PX,
              }}
              aria-hidden
            >
              <IpodArtworkPlaceholder
                kind={emptyArtworkKind}
                selected={isSelected && !isLoading}
                className="size-full rounded-[2px]"
              />
              {showThumbImage ? (
                <img
                  ref={thumb.ref}
                  src={thumbSrc!}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                  draggable={false}
                  onLoad={thumb.onLoad}
                  onError={() => setThumbFailed(true)}
                  style={{
                    opacity: thumb.loaded ? 1 : 0,
                    transition: THUMB_FADE,
                  }}
                />
              ) : null}
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-px py-0 leading-none">
              <ScrollingText
                text={text}
                align="left"
                fadeEdges
                rowRef={rowRef}
                allowMarquee={allowScrollingMarquee}
                isPlaying={isSelected && !isLoading}
                resetOnPause
                scrollStartDelaySec={0.5}
                className={cn(
                  "m-0 w-full min-w-0 p-0 font-semibold leading-none",
                  hasCjkText ? "text-[11px]" : "text-[12px]"
                )}
              />
              {subtitleTrim ? (
                <span
                  className={cn(
                    "block min-w-0 truncate font-normal !leading-none",
                    hasCjkText ? "text-[10px]" : "text-[11px]",
                    isSelected && !isLoading
                      ? "text-white/88"
                      : "text-[rgb(99,101,103)]"
                  )}
                  title={subtitleTrim}
                >
                  {subtitleTrim}
                </span>
              ) : null}
            </div>
          </div>
          {value ? (
            <span
              data-ipod-menu-row-end
              className={cn(
                "flex shrink-0 items-center font-semibold leading-none",
                hasCjkText ? "text-[11px]" : "text-[12px]",
                isSelected && !isLoading
                  ? "text-white/90"
                  : "text-[rgb(99,101,103)]"
              )}
            >
              {value}
            </span>
          ) : (
            showChevron &&
            !isLoading && (
              <span
                data-ipod-menu-row-end
                className={cn(
                  "flex shrink-0 items-center justify-center font-normal leading-none",
                  "text-[16px]",
                  isSelected && !isLoading ? "text-white/95" : "text-[#b8b8bc]"
                )}
                aria-hidden
              >
                {"›"}
              </span>
            )
          )}
        </div>
      );
    }

    return (
      <div
        ref={rowRef}
        onClick={isLoading ? undefined : onClick}
        className={cn(
          "h-full overflow-x-visible overflow-y-hidden pl-1.5 pr-2 font-ipod-modern-ui flex justify-between items-center",
          "ipod-modern-row",
          isLoading ? "cursor-default" : "cursor-pointer",
          isSelected && !isLoading
            ? "ipod-modern-row-selected"
            : isLoading
              ? "text-[#555] animate-pulse"
              : "text-black"
        )}
      >
        <span className="flex h-full min-h-0 min-w-0 flex-1 items-center self-stretch mr-2">
          <ScrollingText
            text={text}
            align="left"
            fadeEdges
            rowRef={rowRef}
            allowMarquee={allowScrollingMarquee}
            isPlaying={isSelected && !isLoading}
            resetOnPause
            scrollStartDelaySec={0.5}
            className="w-full min-w-0 text-[15px] font-semibold leading-none"
          />
        </span>
        {value ? (
          <span
            data-ipod-menu-row-end
            className={cn(
              "flex shrink-0 items-center text-[15px] font-semibold leading-none",
              isSelected && !isLoading
                ? "text-white/90"
                : "text-[rgb(99,101,103)]"
            )}
          >
            {value}
          </span>
        ) : (
          showChevron &&
          !isLoading && (
            <span
              data-ipod-menu-row-end
              className={cn(
                "flex shrink-0 items-center justify-center font-normal leading-none",
                "text-[19px]",
                isSelected && !isLoading ? "text-white/95" : "text-[#b8b8bc]"
              )}
              aria-hidden
            >
              {"›"}
            </span>
          )
        )}
      </div>
    );
  }

  return (
    <div
      onClick={isLoading ? undefined : onClick}
      className={cn(
        "h-full pl-2 pr-3 font-chicago flex justify-between items-center",
        isLoading ? "cursor-default" : "cursor-pointer",
        isSelected && !isLoading
          ? backlightOn
            ? "bg-[#0a3667] text-[#c5e0f5] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
            : "bg-[#0a3667] text-[#8a9da9] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
          : isLoading
            ? "text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)] animate-pulse"
            : "text-[#0a3667] hover:bg-[#c0d8f0] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
      )}
    >
      <span
        className={cn(
          "whitespace-nowrap overflow-hidden text-ellipsis flex-1 mr-2 leading-[1.15]",
          hasCjkText ? "text-[15px]" : "text-[16px]"
        )}
      >
        {text}
      </span>
      {value ? (
        <span
          className={cn(
            "flex-shrink-0 leading-[1.15]",
            hasCjkText ? "text-[15px]" : "text-[16px]"
          )}
        >
          {value}
        </span>
      ) : (
        showChevron &&
        !isLoading && (
          <span className="flex-shrink-0 text-[16px] leading-none">{">"}</span>
        )
      )}
    </div>
  );
}
