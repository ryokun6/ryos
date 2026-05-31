import { cn } from "@/lib/utils";
import { ThemedIcon } from "@/components/shared/ThemedIcon";

export function FinderSidebarItem({
  name,
  icon,
  isActive,
  onClick,
}: {
  name: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-1.5 pl-1.5 pr-2.5 py-[2px] text-left text-[12px]",
        isActive ? "" : "hover:bg-black/5 transition-colors"
      )}
      data-selected={isActive ? "true" : undefined}
    >
      <ThemedIcon name={icon} alt="" className="size-8 shrink-0 [image-rendering:auto]" />
      <span className="truncate">{name}</span>
    </button>
  );
}
