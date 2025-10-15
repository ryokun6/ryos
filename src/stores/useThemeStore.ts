import { create } from "zustand";
import { OsThemeId } from "@/themes/types";
import { invalidateIconCache } from "@/utils/icons";
import { useAppStore } from "./useAppStore";

interface ThemeState {
  current: OsThemeId;
  setTheme: (theme: OsThemeId) => void;
  hydrate: () => void;
}

// Dynamically manage loading/unloading of legacy Windows CSS (xp.css variants)
let legacyCssLink: HTMLLinkElement | null = null;

async function ensureLegacyCss(theme: OsThemeId) {
  // Only xp and win98 use xp.css
  if (theme !== "xp" && theme !== "win98") {
    if (legacyCssLink) {
      legacyCssLink.remove();
      legacyCssLink = null;
    }
    return;
  }

  const desiredVariant = theme === "xp" ? "XP" : "98";
  const currentVariant = legacyCssLink?.dataset.variant;
  if (currentVariant === desiredVariant) return; // already loaded

  try {
    // Use our forked CSS files from public directory
    const href = theme === "xp" ? "/css/xp-custom.css" : "/css/98-custom.css";

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.role = "legacy-win-css";
    link.dataset.variant = desiredVariant;

    // Replace existing link if present
    if (legacyCssLink) legacyCssLink.replaceWith(link);
    else document.head.appendChild(link);
    legacyCssLink = link;
  } catch (e) {
    console.error(
      "Failed to load legacy Windows CSS variant",
      desiredVariant,
      e
    );
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  current: "macosx",
  setTheme: (theme) => {
    set({ current: theme });
    localStorage.setItem("os_theme", theme);
    document.documentElement.dataset.osTheme = theme;
    ensureLegacyCss(theme);
    // Force-refresh icon URLs so newly themed assets fetch fresh, bypassing any stale cache.
    invalidateIconCache(`theme-${theme}`);
    // If switching away from XP/Win98, unminimize all windows to make them visible
    if (theme === "macosx" || theme === "system7") {
      try {
        useAppStore.getState().unminimizeAllInstances();
      } catch {}
    }
  },
  hydrate: () => {
    const saved = localStorage.getItem("os_theme") as OsThemeId | null;
    const theme = saved || "macosx";
    set({ current: theme });
    document.documentElement.dataset.osTheme = theme;
    ensureLegacyCss(theme);
  },
}));
