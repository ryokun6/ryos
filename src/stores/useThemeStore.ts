import { create } from "zustand";
import { OsThemeId } from "@/themes/types";

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

// Storage keys
const THEME_KEY = "ryos:theme";
const LEGACY_THEME_KEY = "os_theme";

// Valid theme IDs for validation
const VALID_THEMES: OsThemeId[] = ["system7", "macosx", "xp", "win98"];

const isValidTheme = (theme: string | null): theme is OsThemeId => {
  return theme !== null && VALID_THEMES.includes(theme as OsThemeId);
};

export const useThemeStore = create<ThemeState>((set) => ({
  current: "macosx",
  setTheme: (theme) => {
    set({ current: theme });
    localStorage.setItem(THEME_KEY, theme);
    // Clean up legacy key
    localStorage.removeItem(LEGACY_THEME_KEY);
    document.documentElement.dataset.osTheme = theme;
    ensureLegacyCss(theme);
    // Note: No need to invalidate icon cache on theme switch.
    // Theme switching changes the icon PATH (e.g., /icons/default/ → /icons/macosx/),
    // and the service worker caches each path separately.
  },
  hydrate: () => {
    // Try new key first, fall back to legacy
    let saved = localStorage.getItem(THEME_KEY);
    if (!isValidTheme(saved)) {
      saved = localStorage.getItem(LEGACY_THEME_KEY);
      if (isValidTheme(saved)) {
        // Migrate to new key
        localStorage.setItem(THEME_KEY, saved);
        localStorage.removeItem(LEGACY_THEME_KEY);
      }
    }
    const theme = isValidTheme(saved) ? saved : "macosx";
    set({ current: theme });
    document.documentElement.dataset.osTheme = theme;
    ensureLegacyCss(theme);
  },
}));
