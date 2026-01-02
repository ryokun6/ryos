import { create } from "zustand";
import { OsThemeId } from "@/themes/types";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";

interface ThemeState extends PersistedStoreMeta {
  current: OsThemeId;
  setTheme: (theme: OsThemeId) => void;
  hydrate: () => void;
}

const STORE_NAME = "ryos:theme";
const STORE_VERSION = 1;

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

const applyTheme = (theme: OsThemeId) => {
  document.documentElement.dataset.osTheme = theme;
  localStorage.setItem("os_theme", theme);
  ensureLegacyCss(theme);
};

export const useThemeStore = create<ThemeState>()(
  createPersistedStore(
    (set, get) => ({
      current: "macosx",
      _updatedAt: Date.now(),
      setTheme: (theme) => {
        set({ current: theme, _updatedAt: Date.now() });
        applyTheme(theme);
        // Note: No need to invalidate icon cache on theme switch.
        // Theme switching changes the icon PATH (e.g., /icons/default/ → /icons/macosx/),
        // and the service worker caches each path separately.
      },
      hydrate: () => {
        // Respect existing saved value if present; fallback to current/default
        const saved = (localStorage.getItem("os_theme") as OsThemeId | null) || get().current || "macosx";
        set({ current: saved, _updatedAt: Date.now() });
        applyTheme(saved);
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        current: state.current,
        _updatedAt: state._updatedAt,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("[ThemeStore] Rehydrate failed:", error);
          return;
        }
        if (state?.current) {
          applyTheme(state.current);
        }
      },
    }
  )
);
