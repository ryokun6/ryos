import { useEffect, useRef, type ReactNode } from "react";
import { AppDrawer } from "@/components/shared/AppDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSound, Sounds } from "@/hooks/useSound";
import { reminderTimeOptions } from "../logic";
import type { JournalLogic } from "../hooks/useJournalLogic";

function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-left">
        <div className="text-[11px] leading-snug text-os-text-primary">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[10px] leading-snug text-os-text-secondary">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function JournalDrawer({
  l,
  isOpen,
  onClose,
}: {
  l: JournalLogic;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, journal } = l;
  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isOpen) void playDrawerOpen();
    else void playDrawerClose();
  }, [isOpen, playDrawerOpen, playDrawerClose]);

  const reminderOn = journal.toggles.reminder;
  const reminderTimes = reminderTimeOptions(journal.reminderTime);

  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t("apps.journal.drawer.title")}
      data-journal-drawer=""
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <SettingsField
          label={t("apps.journal.features.reminder")}
          description={t("apps.journal.features.reminderHint")}
        >
          <Switch
            id="journal-feature-reminder"
            checked={reminderOn}
            onCheckedChange={() => l.api.toggleFeature("reminder")}
            aria-label={t("apps.journal.features.reminder")}
            className="data-[state=checked]:bg-[#000000]"
          />
        </SettingsField>
        {reminderOn ? (
          <SettingsField label={t("apps.journal.reminder.timeLabel")}>
            <Select
              value={journal.reminderTime}
              onValueChange={(value) => l.api.setReminderTime(value)}
            >
              <SelectTrigger
                aria-label={t("apps.journal.reminder.timeLabel")}
                className="w-[5.75rem]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="item-aligned" className="max-h-64">
                {reminderTimes.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
        ) : null}
      </div>
    </AppDrawer>
  );
}
