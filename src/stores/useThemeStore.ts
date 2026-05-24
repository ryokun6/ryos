import { create } from "zustand";
import { getOsMacChrome, getOsPlatform, themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";

function sanitizeStoredTheme(id: string | null | undefined): OsThemeId {
  if (id && id in themes) {
    return id as OsThemeId;
  }
  return "macosx";
}

function parseStoredDark(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  return raw === "1" || raw === "true";
}

interface ThemeState {
  current: OsThemeId;
  isDark: boolean;
  setTheme: (theme: OsThemeId) => void;
  setDark: (isDark: boolean) => void;
  toggleDark: () => void;
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
const DARK_KEY = "ryos:theme:dark";

function applyRootThemeAttributes(theme: OsThemeId, isDark: boolean) {
  const root = document.documentElement;
  root.dataset.osTheme = theme;
  root.dataset.osPlatform = getOsPlatform(theme);
  const macChrome = getOsMacChrome(theme);
  if (macChrome) root.dataset.osMacChrome = macChrome;
  else delete root.dataset.osMacChrome;
  // Color scheme: dark variant is opt-in per-theme and orthogonal to the theme id.
  // We set both `data-os-color-scheme` (used by the OS theme overrides in
  // themes.css) AND the `.dark` class (used by the shadcn variable layer in
  // index.css). The shadcn `.dark` toggle is what makes Radix portals
  // (dropdown menus, popovers, dialogs) follow dark mode automatically.
  if (isDark) {
    root.dataset.osColorScheme = "dark";
    root.style.colorScheme = "dark";
    root.classList.add("dark");
  } else {
    delete root.dataset.osColorScheme;
    root.style.colorScheme = "light";
    root.classList.remove("dark");
  }
}

const createThemeStore = () => create<ThemeState>((set, get) => ({
  current: "macosx",
  isDark: false,
  setTheme: (theme) => {
    const safe = sanitizeStoredTheme(theme);
    const previousTheme = useThemeStore.getState().current;
    set({ current: safe });
    localStorage.setItem(THEME_KEY, safe);
    // Clean up legacy key
    localStorage.removeItem(LEGACY_THEME_KEY);
    applyRootThemeAttributes(safe, get().isDark);
    ensureLegacyCss(safe);
    // Note: No need to invalidate icon cache on theme switch.
    // Theme switching changes the icon PATH (e.g., /icons/default/ → /icons/macosx/),
    // and the service worker caches each path separately.
    if (previousTheme !== safe) {
      track(SETTINGS_ANALYTICS.THEME_CHANGE, {
        theme: safe,
        previousTheme,
      });
    }
  },
  setDark: (isDark) => {
    const previous = get().isDark;
    if (previous === isDark) return;
    set({ isDark });
    try {
      localStorage.setItem(DARK_KEY, isDark ? "1" : "0");
    } catch {
      // ignore storage errors (private mode / quota)
    }
    applyRootThemeAttributes(get().current, isDark);
    track(SETTINGS_ANALYTICS.DARK_MODE_TOGGLE, {
      isDark,
      theme: get().current,
    });
  },
  toggleDark: () => {
    const next = !get().isDark;
    get().setDark(next);
  },
  hydrate: () => {
    let saved = localStorage.getItem(THEME_KEY);
    if (!saved) {
      saved = localStorage.getItem(LEGACY_THEME_KEY);
      if (saved) {
        localStorage.setItem(THEME_KEY, saved);
        localStorage.removeItem(LEGACY_THEME_KEY);
      }
    }
    const theme = sanitizeStoredTheme(saved);
    if (saved && theme !== saved) {
      localStorage.setItem(THEME_KEY, theme);
    }
    const isDark = parseStoredDark(localStorage.getItem(DARK_KEY));
    set({ current: theme, isDark });
    applyRootThemeAttributes(theme, isDark);
    ensureLegacyCss(theme);
  },
}));

// Preserve store across Vite HMR to prevent theme flashing during development
let useThemeStore = createThemeStore();
if (import.meta.hot) {
  const data = import.meta.hot.data as { useThemeStore?: typeof useThemeStore };
  if (data.useThemeStore) {
    useThemeStore = data.useThemeStore;
  } else {
    data.useThemeStore = useThemeStore;
  }
}
export { useThemeStore };
