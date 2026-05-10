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
    return (
      <div
        onClick={isLoading ? undefined : onClick}
        className={cn(
          "h-full pl-3 pr-2 font-ipod-modern-ui flex justify-between items-center",
          // 1px hairline separator. Drawn with a tiny inset box-shadow so
          // it never adds layout height and it sits below the row's
          // bottom edge like a real iOS 6 table-view cell.
          "ipod-modern-row",
          isLoading ? "cursor-default" : "cursor-pointer",
          isSelected && !isLoading
            ? "ipod-modern-row-selected text-white"
            : isLoading
            ? "text-[#555] animate-pulse"
            : "text-[#1f1f1f] hover:bg-[#eaeaea]"
        )}
      >
        <span
          className={cn(
            "whitespace-nowrap overflow-hidden text-ellipsis flex-1 mr-2 leading-[1.15]",
            // Match the visual rhythm of an iOS 6 row: Helvetica Neue at
            // ~14px, slightly smaller for CJK because Hiragino/Noto runs
            // visually larger at the same em.
            hasCjkText ? "text-[12px]" : "text-[13px]",
            isSelected && !isLoading ? "font-semibold" : "font-medium"
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
                ? "text-white/85"
                : "text-[#8a8a8e]"
            )}
          >
            {value}
          </span>
        ) : (
          showChevron && !isLoading && (
            <span
              className={cn(
                "flex-shrink-0 text-[12px] leading-none font-normal",
                isSelected && !isLoading ? "text-white/90" : "text-[#c4c4c8]"
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
