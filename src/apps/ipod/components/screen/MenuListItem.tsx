import { cn } from "@/lib/utils";

interface MenuListItemProps {
  text: string;
  isSelected: boolean;
  onClick: () => void;
  backlightOn?: boolean;
  showChevron?: boolean;
  value?: string;
  isLoading?: boolean;
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
  variant = "classic",
}: MenuListItemProps) {
  const hasCjkText =
    CJK_TEXT_PATTERN.test(text) || (value ? CJK_TEXT_PATTERN.test(value) : false);
  const isModern = variant === "modern";

  if (isModern) {
    // iPod-classic-js SelectableListItem: white row, blue gradient
    // selection, no separator. Modern mode uses the 20px row height
    // configured in IpodScreen — slightly tighter than classic's 24px
    // because Helvetica Neue at 12px doesn't need as much padding as
    // 16px Chicago bitmap glyphs do.
    return (
      <div
        onClick={isLoading ? undefined : onClick}
        className={cn(
          "h-full pl-2 pr-2 font-ipod-modern-ui flex justify-between items-center",
          "ipod-modern-row",
          isLoading ? "cursor-default" : "cursor-pointer",
          isSelected && !isLoading
            ? "ipod-modern-row-selected"
            : isLoading
            ? "text-[#555] animate-pulse"
            : "text-black"
        )}
      >
        <span
          className={cn(
            "whitespace-nowrap overflow-hidden text-ellipsis flex-1 mr-2 leading-[1.15] font-medium",
            // 13px MyriadPro / Helvetica Neue. CJK gets a touch smaller
            // because Hiragino/Noto runs larger at the same nominal em.
            hasCjkText ? "text-[12px]" : "text-[13px]"
          )}
        >
          {text}
        </span>
        {value ? (
          <span
            className={cn(
              "flex-shrink-0 leading-[1.15] font-normal",
              hasCjkText ? "text-[11px]" : "text-[12px]",
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
                "flex-shrink-0 leading-none font-normal",
                "text-[13px]",
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
