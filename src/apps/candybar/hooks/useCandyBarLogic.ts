import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { helpItems } from "..";
import { isWindowsTheme } from "@/themes";

export interface IconPackIcon {
  name: string;
  url: string;
}

export interface IconPack {
  id: string;
  name: string;
  author: string;
  description: string;
  previewIcons: IconPackIcon[];
  iconCount: number;
  downloadUrl?: string;
  createdAt: string;
  category: IconPackCategory;
}

export type IconPackCategory =
  | "all"
  | "system"
  | "apps"
  | "folders"
  | "devices"
  | "community";

export interface SidebarItem {
  id: IconPackCategory;
  label: string;
  icon: string;
  count: number;
}

interface UseCandyBarLogicProps {
  isWindowOpen: boolean;
  isForeground: boolean;
  instanceId: string;
}

export function useCandyBarLogic({
  isWindowOpen,
}: UseCandyBarLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("candybar", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = isWindowsTheme(currentTheme);
  const isMacOSXTheme = currentTheme === "macosx";

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<IconPackCategory>("all");
  const [history, setHistory] = useState<Array<"list" | { pack: IconPack }>>([
    "list",
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [iconPacks, setIconPacks] = useState<IconPack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchIconPacks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candybar/packs");
      if (!res.ok) throw new Error(`Failed to fetch icon packs: ${res.status}`);
      const data = await res.json();
      setIconPacks(data.packs || []);
    } catch (err) {
      console.error("Failed to fetch icon packs:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load icon packs"
      );
      setIconPacks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isWindowOpen) {
      fetchIconPacks();
    }
  }, [isWindowOpen, fetchIconPacks]);

  const filteredPacks = useMemo(() => {
    let packs = iconPacks;

    if (selectedCategory !== "all") {
      packs = packs.filter((p) => p.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      packs = packs.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }

    return packs;
  }, [iconPacks, selectedCategory, searchQuery]);

  const sidebarItems: SidebarItem[] = useMemo(() => {
    const countByCategory = (cat: IconPackCategory) =>
      cat === "all"
        ? iconPacks.length
        : iconPacks.filter((p) => p.category === cat).length;

    return [
      {
        id: "all" as const,
        label: t("apps.candybar.sidebar.all"),
        icon: "🍬",
        count: countByCategory("all"),
      },
      {
        id: "system" as const,
        label: t("apps.candybar.sidebar.system"),
        icon: "💻",
        count: countByCategory("system"),
      },
      {
        id: "apps" as const,
        label: t("apps.candybar.sidebar.apps"),
        icon: "📱",
        count: countByCategory("apps"),
      },
      {
        id: "folders" as const,
        label: t("apps.candybar.sidebar.folders"),
        icon: "📁",
        count: countByCategory("folders"),
      },
      {
        id: "devices" as const,
        label: t("apps.candybar.sidebar.devices"),
        icon: "🖥️",
        count: countByCategory("devices"),
      },
      {
        id: "community" as const,
        label: t("apps.candybar.sidebar.community"),
        icon: "👥",
        count: countByCategory("community"),
      },
    ];
  }, [iconPacks, t]);

  const currentView = history[historyIndex];
  const selectedPack = currentView === "list" ? null : currentView.pack;

  const canNavigateBack = historyIndex > 0;
  const canNavigateForward = historyIndex < history.length - 1;

  const navigateBack = useCallback(() => {
    if (!canNavigateBack) return;
    setHistoryIndex((i) => i - 1);
  }, [canNavigateBack]);

  const navigateForward = useCallback(() => {
    if (!canNavigateForward) return;
    setHistoryIndex((i) => i + 1);
  }, [canNavigateForward]);

  const selectPack = useCallback((pack: IconPack) => {
    setHistory((h) => {
      const next = h.slice(0, historyIndex + 1);
      next.push({ pack });
      return next;
    });
    setHistoryIndex((i) => i + 1);
  }, [historyIndex]);

  const clearLibrary = useCallback(() => {
    setIconPacks([]);
    setHistory(["list"]);
    setHistoryIndex(0);
  }, []);

  const addPack = useCallback(() => {
    toast.info(t("apps.candybar.dialogs.addPackComingSoon"));
  }, [t]);

  return {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOSXTheme,
    currentTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    selectedCategory,
    setSelectedCategory,
    selectedPack,
    selectPack,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    iconPacks,
    filteredPacks,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    sidebarItems,
    fetchIconPacks,
    clearLibrary,
    addPack,
  };
}
