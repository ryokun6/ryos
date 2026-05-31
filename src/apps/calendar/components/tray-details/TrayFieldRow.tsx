import { cn } from "@/lib/utils";

/** iCal-style label / value row (bold right-aligned label). */
export function TrayFieldRow({
  label,
  children,
  useGeneva,
}: {
  label: string;
  children: React.ReactNode;
  useGeneva: boolean;
}) {
  return (
    <div className="flex gap-2 items-start min-h-[22px]">
      <span
        className={cn(
          "w-[52px] shrink-0 text-right font-bold text-[11px] leading-tight text-[#222] pt-0.5",
          useGeneva && "font-geneva-12"
        )}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
