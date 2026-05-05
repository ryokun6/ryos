import { useEffect, useMemo, useState } from "react";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { helpItems } from "../metadata";
import { createWelcomeInboxItem, useInboxStore } from "@/stores/useInboxStore";
import type { InboxCategory, InboxItem } from "@/lib/inbox/inboxTypes";

export type InboxTabFilter = "all" | "unread" | InboxCategory;

export function useInboxLogic({
  instanceId: _instanceId,
}: {
  instanceId: string;
}) {
  const translatedHelpItems = useTranslatedHelpItems("inbox", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const items = useInboxStore((s) => s.items);
  const upsertItem = useInboxStore((s) => s.upsertItem);
  const markRead = useInboxStore((s) => s.markRead);
  const markUnread = useInboxStore((s) => s.markUnread);
  const toggleRead = useInboxStore((s) => s.toggleRead);
  const removeItem = useInboxStore((s) => s.removeItem);
  const clearRead = useInboxStore((s) => s.clearRead);

  const [tab, setTab] = useState<InboxTabFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let list = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
    if (tab === "unread") {
      list = list.filter((i) => i.readAt === null);
    } else if (tab !== "all") {
      list = list.filter((i) => i.category === tab);
    }
    return list;
  }, [items, tab]);

  const selectedItem: InboxItem | null = useMemo(() => {
    if (!selectedId) return null;
    return items.find((i) => i.id === selectedId) ?? null;
  }, [items, selectedId]);

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      const w = createWelcomeInboxItem();
      upsertItem({
        dedupeKey: "welcome:v1",
        category: w.category,
        title: w.title,
        preview: w.preview,
        body: w.body,
        source: w.source,
      });
    }
  }, [items.length, upsertItem]);

  return {
    translatedHelpItems,
    isXpTheme,
    tab,
    setTab,
    filteredItems,
    selectedId,
    setSelectedId,
    selectedItem,
    markRead,
    markUnread,
    toggleRead,
    removeItem,
    clearRead,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  };
}
