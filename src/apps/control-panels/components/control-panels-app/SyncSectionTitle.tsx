import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { cn } from "@/lib/utils";
import { controlPanelItemIconShell } from "./constants";

export function SyncSectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className={cn(
          controlPanelItemIconShell,
          "flex items-center justify-center overflow-hidden"
        )}
      >
        <ThemedIcon
          name="/icons/default/cloud-sync.png"
          alt=""
          className="size-8 object-contain"
        />
      </div>
      <div className="min-w-0 space-y-1">
        <span className="block text-[13px] font-geneva-12 font-medium leading-tight truncate">
          {title}
        </span>
        <p className="text-[11px] text-neutral-600 font-geneva-12 leading-tight truncate">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
