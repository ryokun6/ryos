import { create } from "zustand";
import {
  getOsMacChrome,
  getOsPlatform,
  themes,
  themeSupportsDarkMode,
} from "@/themes";
import type { OsThemeId } from "@/themes/types";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";

function sanitizeStoredTheme(id: string | null | undefined): OsThemeId {
  if (id && id in themes) {
    return id as OsThemeId;
  }
  return "macosx";
}

/**
 * Per-theme dark-mode preference (only honored when the theme supports it):
 * - `"system"` (default): track the OS `prefers-color-scheme: dark` media query.
 * - `"light"` / `"dark"`: explicit override that ignores the OS preference.
 */
export type DarkModePreference = "system" | "light" | "dark";
type DarkModeMap = Partial<Record<OsThemeId, DarkModePreference>>;

function isPreference(value: unknown): value is DarkModePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Accept both the legacy boolean shape and the new string shape. */
function coercePreference(value: unknown): DarkModePreference | undefined {
  if (isPreference(value)) return value;
  if (value === true) return "dark";
  if (value === false) return "light";
  return undefined;
}

function safeReadDarkModeMap(): DarkModeMap {
  try {
    const raw = localStorage.getItem(DARK_MODE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: DarkModeMap = {};
    for (const id of Object.keys(themes) as OsThemeId[]) {
      const coerced = coercePreference(
        (parsed as Record<string, unknown>)[id]
      );
      if (coerced) out[id] = coerced;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDarkModeMap(map: DarkModeMap) {
  try {
    localStorage.setItem(DARK_MODE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private-mode errors
  }
}

interface ThemeState {
  current: OsThemeId;
  /** Effective dark-mode flag for the active theme (false if the theme has no dark tokens). */
  isDark: boolean;
  /** Per-theme dark-mode preferences; persisted so each theme remembers its own choice. */
  darkModeByTheme: DarkModeMap;
  setTheme: (theme: OsThemeId) => void;
  /**
   * Set the dark-mode preference for a theme (defaults to the current theme).
   *
   * Accepts either a `DarkModePreference` string (`"system" | "light" | "dark"`)
   * or a plain boolean. Boolean inputs map to `"dark"` / `"light"` so existing
   * callers (including older cloud-sync payloads) continue to work.
   */
  setDarkMode: (
    pref: DarkModePreference | boolean,
    theme?: OsThemeId
  ) => void;
  /** Cycle the current theme through System → Light → Dark → System. */
  toggleDarkMode: () => void;
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
/**
 * Per-theme dark-mode preferences, keyed by theme id.
 * Stored as a single JSON blob so settings sync (which round-trips localStorage)
 * picks it up alongside `ryos:theme` without needing a new sync section.
 *
 * Values are `DarkModePreference` strings. Older builds wrote booleans; the
 * reader coerces those to `"dark"` / `"light"` so upgrades are seamless.
 */
const DARK_MODE_KEY = "ryos:theme:dark";

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Resolve a stored preference (defaulting to "system" when none recorded). */
function resolvePreference(map: DarkModeMap, theme: OsThemeId): DarkModePreference {
  return map[theme] ?? "system";
}

function applyRootThemeAttributes(theme: OsThemeId, isDark: boolean) {
  const root = document.documentElement;
  root.dataset.osTheme = theme;
  root.dataset.osPlatform = getOsPlatform(theme);
  const macChrome = getOsMacChrome(theme);
  if (macChrome) root.dataset.osMacChrome = macChrome;
  else delete root.dataset.osMacChrome;
  // Color-scheme attribute is only applied when the theme supports dark mode AND it's enabled.
  // This keeps the existing light-mode CSS the single source of truth for unsupported themes.
  if (isDark && themeSupportsDarkMode(theme)) {
    root.dataset.osColorScheme = "dark";
    root.style.colorScheme = "dark";
  } else {
    delete root.dataset.osColorScheme;
    root.style.colorScheme = "light";
  }
}

function effectiveDarkFor(theme: OsThemeId, map: DarkModeMap): boolean {
  if (!themeSupportsDarkMode(theme)) return false;
  const pref = resolvePreference(map, theme);
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return getSystemPrefersDark();
}

// Track the OS prefers-color-scheme listener so we can re-evaluate `isDark`
// whenever the user's system preference flips while we're following it.
let systemDarkQuery: MediaQueryList | null = null;
let systemDarkListener: ((event: MediaQueryListEvent) => void) | null = null;

function ensureSystemDarkListener() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  if (systemDarkQuery && systemDarkListener) return;
  try {
    systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return;
  }
  systemDarkListener = () => {
    const state = useThemeStore.getState();
    const pref = resolvePreference(state.darkModeByTheme, state.current);
    if (pref !== "system") return; // explicit override wins
    const nextDark = effectiveDarkFor(state.current, state.darkModeByTheme);
    if (nextDark === state.isDark) return;
    useThemeStore.setState({ isDark: nextDark });
    applyRootThemeAttributes(state.current, nextDark);
  };
  if (typeof systemDarkQuery.addEventListener === "function") {
    systemDarkQuery.addEventListener("change", systemDarkListener);
  } else if (typeof systemDarkQuery.addListener === "function") {
    // Safari < 14 fallback
    systemDarkQuery.addListener(systemDarkListener);
  }
}

const createThemeStore = () => create<ThemeState>((set) => ({
  current: "macosx",
  isDark: false,
  darkModeByTheme: {},
  setTheme: (theme) => {
    const safe = sanitizeStoredTheme(theme);
    const previousTheme = useThemeStore.getState().current;
    const map = useThemeStore.getState().darkModeByTheme;
    const nextDark = effectiveDarkFor(safe, map);
    set({ current: safe, isDark: nextDark });
    localStorage.setItem(THEME_KEY, safe);
    // Clean up legacy key
    localStorage.removeItem(LEGACY_THEME_KEY);
    applyRootThemeAttributes(safe, nextDark);
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
  setDarkMode: (pref, theme) => {
    const normalized = coercePreference(pref);
    if (!normalized) return;
    const state = useThemeStore.getState();
    const target = theme ?? state.current;
    if (!themeSupportsDarkMode(target)) {
      // Persist the preference anyway so it's remembered if the theme later gains support,
      // but never apply it. This also avoids surprising the user when they change the
      // Dark Mode preference on a theme that doesn't support it.
      const nextMap = { ...state.darkModeByTheme, [target]: normalized };
      writeDarkModeMap(nextMap);
      set({ darkModeByTheme: nextMap });
      return;
    }
    const nextMap = { ...state.darkModeByTheme, [target]: normalized };
    writeDarkModeMap(nextMap);
    const isCurrent = target === state.current;
    const nextDark = isCurrent
      ? effectiveDarkFor(state.current, nextMap)
      : state.isDark;
    set({
      darkModeByTheme: nextMap,
      isDark: nextDark,
    });
    if (isCurrent) {
      applyRootThemeAttributes(state.current, nextDark);
      track(SETTINGS_ANALYTICS.THEME_CHANGE, {
        theme: state.current,
        darkMode: nextDark,
        darkModePreference: normalized,
      });
    }
  },
  toggleDarkMode: () => {
    const state = useThemeStore.getState();
    const current = resolvePreference(state.darkModeByTheme, state.current);
    // Cycle: system → light → dark → system
    const next: DarkModePreference =
      current === "system" ? "light" : current === "light" ? "dark" : "system";
    state.setDarkMode(next);
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
    const map = safeReadDarkModeMap();
    // If the persisted map upgraded from booleans, rewrite so we don't keep
    // re-coercing on every page load (and so sync payloads carry strings).
    try {
      const raw = localStorage.getItem(DARK_MODE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const needsRewrite =
        parsed && typeof parsed === "object" &&
        Object.values(parsed as Record<string, unknown>).some(
          (v) => typeof v === "boolean"
        );
      if (needsRewrite) writeDarkModeMap(map);
    } catch {
      // ignore
    }
    const isDark = effectiveDarkFor(theme, map);
    set({ current: theme, isDark, darkModeByTheme: map });
    applyRootThemeAttributes(theme, isDark);
    ensureLegacyCss(theme);
    ensureSystemDarkListener();
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
