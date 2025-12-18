import { cn } from "@/lib/utils";

interface MenuListItemProps {
  text: string;
  isSelected: boolean;
  onClick: () => void;
  backlightOn?: boolean;
  showChevron?: boolean;
  value?: string;
}

export function MenuListItem({
  text,
  isSelected,
  onClick,
  backlightOn = true,
  showChevron = true,
  value,
}: MenuListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "pl-2 cursor-pointer font-chicago text-[16px] flex justify-between items-center",
        showChevron || value ? "pr-4" : "pr-2",
        isSelected
          ? backlightOn
            ? "bg-[#0a3667] text-[#c5e0f5] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
            : "bg-[#0a3667] text-[#8a9da9] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
          : "text-[#0a3667] hover:bg-[#c0d8f0] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
      )}
    >
      <span className="whitespace-nowrap overflow-hidden text-ellipsis flex-1 mr-2">
        {text}
      </span>
      {value ? (
        <span className="flex-shrink-0">{value}</span>
      ) : (
        showChevron && <span className="flex-shrink-0">{">"}</span>
      )}
    </div>
  );
}
