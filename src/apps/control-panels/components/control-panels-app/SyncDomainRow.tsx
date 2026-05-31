import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getAppIconPath } from "@/config/appRegistry";
import { AUTO_SYNC_ITEM_ICONS } from "./constants";

export function SyncDomainRow({
  appId,
  label,
  status,
  checked,
  onCheckedChange,
}: {
  appId: (typeof AUTO_SYNC_ITEM_ICONS)[keyof typeof AUTO_SYNC_ITEM_ICONS];
  label: string;
  status: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <ThemedIcon
          name={getAppIconPath(appId)}
          alt=""
          className="size-8 shrink-0 object-contain"
        />
        <div className="space-y-0.5 min-w-0">
          <Label className="leading-none">{label}</Label>
          <p className="text-[11px] text-neutral-600 font-geneva-12">{status}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-[#000000]"
      />
    </div>
  );
}
