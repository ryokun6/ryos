import { cn } from "@/lib/utils";
import { ScrollingText } from "./ScrollingText";

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
}: MenuListItemProps) {
  const hasCjkText =
    CJK_TEXT_PATTERN.test(text) || (value ? CJK_TEXT_PATTERN.test(value) : false);
  const isModern = variant === "modern";

  if (isModern) {
    // iPod-classic-js SelectableListItem: white row, blue gradient
    // selection highlight, no separator. Rows are compact (**21px**) with **15px** type so
    // titlebar + six rows fit inside the 150px screen (nano 6G/7G density).
    //
    // Long labels truncate via `ScrollingText` with `fadeEdges`:
    //   - When the label fits, ScrollingText renders static text.
    //   - When it overflows, a fade-to-transparent mask appears on the
    //     right edge (truncation hint) instead of an ellipsis.
    //   - When the row is also `isSelected`, the marquee animates and
    //     both edges fade — matches the iPod nano 6G/7G's behavior of
    //     scrolling the highlighted row's text horizontally.
    return (
      <div
        onClick={isLoading ? undefined : onClick}
        className={cn(
          /* items-stretch + inner flex items-center: line-box ascent no longer floats labels high */
          "h-full pl-1.5 pr-2 font-ipod-modern-ui flex justify-between items-stretch",
          "ipod-modern-row",
          isLoading ? "cursor-default" : "cursor-pointer",
          isSelected && !isLoading
            ? "ipod-modern-row-selected"
            : isLoading
            ? "text-[#555] animate-pulse"
            : "text-black"
        )}
      >
        <span className="flex min-h-0 min-w-0 flex-1 items-center mr-2">
          <ScrollingText
            text={text}
            align="left"
            fadeEdges
            allowMarquee={allowScrollingMarquee}
            isPlaying={isSelected && !isLoading}
            scrollStartDelaySec={0.5}
            className="max-w-full min-w-0 block text-[15px] font-semibold leading-normal"
          />
        </span>
        {value ? (
          <span
            className={cn(
              "flex shrink-0 items-center text-[15px] font-semibold leading-normal",
              isSelected && !isLoading
                ? "text-white/90"
                : "text-[rgb(99,101,103)]"
            )}
          >
            {value}
          </span>
        ) : (
          showChevron && !isLoading && (
            // Right-arrow chevron: thin and light grey when idle, white
            // when the row is selected — same affordance as the
            // arrow_right.svg used in iPod-classic-js.
            <span
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
        // h-full makes the row exactly fill its
        // virtualization wrapper (MENU_ITEM_HEIGHT in IpodScreen) so
        // items in every menu — main, music, artist, and All Songs —
        // share the same vertical rhythm.
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
        showChevron && !isLoading && (
          <span className="flex-shrink-0 text-[16px] leading-none">{">"}</span>
        )
      )}
    </div>
  );
}
