import { cn } from "@/lib/utils";

export function GroupListItem({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px]",
        isSelected ? "" : "hover:bg-black/5 transition-colors"
      )}
      data-selected={isSelected ? "true" : undefined}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
