import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("inbox", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const items = useInboxStore((s) => s.items);
  const upsertItem = useInboxStore((s) => s.upsertItem);
  const markRead = useInboxStore((s) => s.markRead);
  const markReadMany = useInboxStore((s) => s.markReadMany);
  const markUnread = useInboxStore((s) => s.markUnread);
  const toggleRead = useInboxStore((s) => s.toggleRead);
  const removeItem = useInboxStore((s) => s.removeItem);
  const clearRead = useInboxStore((s) => s.clearRead);

  const [tab, setTab] = useState<InboxTabFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totalUnread = useMemo(
    () => items.reduce((n, i) => n + (i.readAt === null ? 1 : 0), 0),
    [items]
  );

  const filteredItems = useMemo(() => {
    let list = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
    if (tab === "unread") {
      list = list.filter((i) => i.readAt === null);
    } else if (tab !== "all") {
      list = list.filter((i) => i.category === tab);
    }
    return list;
  }, [items, tab]);

  const filteredUnreadCount = useMemo(
    () => filteredItems.filter((i) => i.readAt === null).length,
    [filteredItems]
  );

  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(() => new Set());

  const stackSections = useMemo(() => {
    const map = new Map<string, InboxItem[]>();
    for (const item of filteredItems) {
      const raw = item.source?.extras?.stackGroupKey?.trim();
      const key =
        raw && raw.length > 0 ? raw : (`solo:${item.id}` as const);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const catLabel = (c: InboxCategory) => {
      if (c === "system") return t("apps.inbox.tabs.system");
      return t(`apps.inbox.tabs.${c}`);
    };
    return Array.from(map.entries())
      .map(([key, groupItems]) => {
        const sorted = [...groupItems].sort(
          (a, b) => b.updatedAt - a.updatedAt
        );
        const first = sorted[0];
        const label =
          first?.source?.extras?.appLabel?.trim() ||
          (first ? catLabel(first.category) : "");
        const isStack = key.startsWith("app:");
        return { key, items: sorted, label, isStack };
      })
      .sort(
        (a, b) =>
          Math.max(...b.items.map((i) => i.updatedAt)) -
          Math.max(...a.items.map((i) => i.updatedAt))
      );
  }, [filteredItems, t]);

  const toggleStackExpanded = useCallback((key: string) => {
    setExpandedStacks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const visibleListItems = useMemo(() => {
    const out: InboxItem[] = [];
    for (const sec of stackSections) {
      if (sec.isStack && sec.items.length > 1) {
        const open = expandedStacks.has(sec.key);
        if (open) out.push(...sec.items);
        else out.push(sec.items[0]);
      } else {
        out.push(...sec.items);
      }
    }
    return out;
  }, [expandedStacks, stackSections]);

  useEffect(() => {
    if (!selectedId) return;
    const sel = items.find((i) => i.id === selectedId);
    if (!sel) return;
    const gk = sel.source?.extras?.stackGroupKey;
    if (!gk?.startsWith("app:")) return;
    const same = filteredItems.filter(
      (i) => i.source?.extras?.stackGroupKey === gk
    );
    if (same.length > 1) {
      setExpandedStacks((prev) => new Set(prev).add(gk));
    }
  }, [filteredItems, items, selectedId]);

  const selectedItem: InboxItem | null = useMemo(() => {
    if (!selectedId) return null;
    return items.find((i) => i.id === selectedId) ?? null;
  }, [items, selectedId]);

  const markAllReadFiltered = useCallback(() => {
    const ids = filteredItems
      .filter((i) => i.readAt === null)
      .map((i) => i.id);
    markReadMany(ids);
  }, [filteredItems, markReadMany]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (visibleListItems.length === 0) return null;
      if (prev && visibleListItems.some((i) => i.id === prev)) return prev;
      return visibleListItems[0].id;
    });
  }, [visibleListItems, tab]);

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
    items,
    filteredItems,
    visibleListItems,
    totalUnread,
    filteredUnreadCount,
    selectedId,
    setSelectedId,
    selectedItem,
    markRead,
    markUnread,
    markAllReadFiltered,
    toggleRead,
    removeItem,
    clearRead,
    stackSections,
    expandedStacks,
    toggleStackExpanded,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  };
}
