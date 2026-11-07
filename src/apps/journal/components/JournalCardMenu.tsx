import { createPortal } from "react-dom";
import { RightClickMenu, type MenuItem } from "@/components/ui/right-click-menu";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { journalCardDayId, sidebarDates, todayDayId } from "../logic";
import { formatJournalDay } from "../sampleContent";

export interface JournalCardMenuState {
  x: number;
  y: number;
  id: string;
}

export function JournalCardMenu({
  menu,
  onClose,
  l,
}: {
  menu: JournalCardMenuState | null;
  onClose: () => void;
  l: JournalLogic;
}) {
  if (!menu || typeof document === "undefined") return null;
  const currentDay = journalCardDayId(l.journal, menu.id);
  const items: MenuItem[] = [
    {
      type: "item",
      label: l.t("apps.journal.toolbar.delete"),
      onSelect: () => l.api.removeCard(menu.id),
    },
    {
      type: "submenu",
      label: l.t("apps.journal.toolbar.move"),
      items: sidebarDates(todayDayId()).map((dayId) => ({
        type: "item" as const,
        label: formatJournalDay(dayId, l.language),
        disabled: dayId === currentDay,
        onSelect: () => l.api.moveCard(menu.id, dayId),
      })),
    },
  ];
  return createPortal(
    <div className="pointer-events-none fixed inset-0">
      <RightClickMenu position={menu} onClose={onClose} items={items} />
    </div>,
    document.body
  );
}
