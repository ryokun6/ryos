import { create } from "zustand";
import { OsThemeId } from "@/themes/types";
import { applyThemeCssVariables, getTheme, getThemeClassName } from "@/themes";

interface ThemeState {
  current: OsThemeId;
  setTheme: (theme: OsThemeId) => void;
  hydrate: () => void;
}

// Dynamically manage loading/unloading of legacy Windows CSS (xp.css variants)
let legacyCssLink: HTMLLinkElement | null = null;
let appliedThemeClass: string | null = null;

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

function applyThemeGlobals(theme: OsThemeId) {
  if (typeof document === "undefined") return;
  const resolved = getTheme(theme);
  document.documentElement.dataset.osTheme = theme;

  // Maintain a single theme class for scoped styling opportunities.
  if (appliedThemeClass) {
    document.documentElement.classList.remove(appliedThemeClass);
  }
  appliedThemeClass = getThemeClassName(theme);
  document.documentElement.classList.add(appliedThemeClass);

  applyThemeCssVariables(resolved);
  ensureLegacyCss(theme);
}

export const useThemeStore = create<ThemeState>((set) => ({
  current: "macosx",
  setTheme: (theme) => {
    set({ current: theme });
    localStorage.setItem("os_theme", theme);
    applyThemeGlobals(theme);
    // Note: No need to invalidate icon cache on theme switch.
    // Theme switching changes the icon PATH (e.g., /icons/default/ → /icons/macosx/),
    // and the service worker caches each path separately.
  },
  hydrate: () => {
    const saved = localStorage.getItem("os_theme") as OsThemeId | null;
    const theme = saved || "macosx";
    set({ current: theme });
    applyThemeGlobals(theme);
  },
}));
