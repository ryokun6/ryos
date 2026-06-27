import { create } from "zustand";
import {
  DEFAULT_AQUA_MATERIAL,
  getOsMacChrome,
  getOsPlatform,
  DEFAULT_OS_THEME_ID,
  themes,
  themeSupportsDarkMode,
} from "@/themes";
import type { AquaMaterial, OsThemeId } from "@/themes/types";
import {
  ACCENT_CSS_VAR_NAMES,
  DEFAULT_ACCENT,
  getAccentChrome,
  getAccentCssVars,
  isValidAccent,
  normalizeAccentHex,
  type AccentId,
} from "@/themes/accents";
import {
  THEME_DEFAULT_SYSTEM_FONT,
  getSystemFontCssValue,
  isSystemFontId,
  type SystemFontId,
} from "@/themes/systemFonts";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";

function sanitizeStoredTheme(id: string | null | undefined): OsThemeId {
  if (id && id in themes) {
    return id as OsThemeId;
  }
  return DEFAULT_OS_THEME_ID;
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

/**
 * Per-theme accent-color preference. Keyed by theme id (only Aqua + System 7
 * advertise an accent picker today). Absent / `"default"` means "use the
 * theme's classic selection color".
 */
type AccentMap = Partial<Record<OsThemeId, AccentId>>;

function safeReadAccentMap(): AccentMap {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: AccentMap = {};
    for (const id of Object.keys(themes) as OsThemeId[]) {
      const chrome = getAccentChrome(id);
      const value = (parsed as Record<string, unknown>)[id];
      if (chrome && typeof value === "string" && isValidAccent(chrome, value)) {
        out[id] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAccentMap(map: AccentMap) {
  try {
    localStorage.setItem(ACCENT_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private-mode errors
  }
}

/**
 * Surface material for the Mac OS X Aqua chrome:
 * - `"classic"` (default): the pinstriped / brushed-metal Tiger-era Aqua look.
 * - `"glass"`: the "Aqua Glass" re-imagining — frosted translucent surfaces with
 *   specular shine and blurred highlights (inspired by the karaoke controls).
 *
 * Stored as a flat string (not per-theme) because it only modifies the `macosx`
 * chrome; other themes ignore it. Applied to `<html>` as `data-os-aqua-material`
 * only when the active theme is `macosx` and the material is `"glass"`, so it
 * layers on top of the existing Aqua rules via higher-specificity selectors.
 */
function isAquaMaterial(value: unknown): value is AquaMaterial {
  return value === "classic" || value === "glass";
}

function safeReadAquaMaterial(): AquaMaterial {
  try {
    const raw = localStorage.getItem(AQUA_MATERIAL_KEY);
    return isAquaMaterial(raw) ? raw : DEFAULT_AQUA_MATERIAL;
  } catch {
    return DEFAULT_AQUA_MATERIAL;
  }
}

function writeAquaMaterial(material: AquaMaterial) {
  try {
    localStorage.setItem(AQUA_MATERIAL_KEY, material);
  } catch {
    // ignore quota / private-mode errors
  }
}

function safeReadSystemFont(): SystemFontId {
  try {
    const raw = localStorage.getItem(SYSTEM_FONT_KEY);
    return isSystemFontId(raw) ? raw : THEME_DEFAULT_SYSTEM_FONT;
  } catch {
    return THEME_DEFAULT_SYSTEM_FONT;
  }
}

function writeSystemFont(font: SystemFontId) {
  try {
    if (font === THEME_DEFAULT_SYSTEM_FONT) {
      localStorage.removeItem(SYSTEM_FONT_KEY);
    } else {
      localStorage.setItem(SYSTEM_FONT_KEY, font);
    }
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
  /** Per-theme accent-color preferences (Aqua + System 7); persisted per theme. */
  accentByTheme: AccentMap;
  /** Mac OS X Aqua surface material ("classic" pinstripe vs "glass" frosted). */
  aquaMaterial: AquaMaterial;
  /** Optional debug override for the global UI font stack. */
  systemFont: SystemFontId;
  /**
   * Color sampled from the active wallpaper, driving the `"wallpaper"` accent.
   * `null` until sampled (or when the wallpaper can't be sampled).
   */
  wallpaperAccentColor: string | null;
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
  /**
   * Set the accent color for a theme (defaults to the current theme). Only
   * Aqua + System 7 support accents; calls for other themes are ignored.
   */
  setAccent: (accent: AccentId, theme?: OsThemeId) => void;
  /**
   * Switch the Aqua surface material. Only meaningful for the `macosx` theme,
   * but the preference is persisted regardless so it sticks when toggling back.
   */
  setAquaMaterial: (material: AquaMaterial) => void;
  /** Override the theme's default UI font stack, or restore theme defaults. */
  setSystemFont: (font: SystemFontId) => void;
  /**
   * Record the latest color sampled from the wallpaper. Re-applies the root
   * accent immediately when the current theme is using the `"wallpaper"` accent.
   */
  setWallpaperAccentColor: (hex: string | null) => void;
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
/**
 * Per-theme dark-mode preferences, keyed by theme id.
 * Stored as a single JSON blob so settings sync (which round-trips localStorage)
 * picks it up alongside `ryos:theme` without needing a new sync section.
 *
 * Values are `DarkModePreference` strings. Older builds wrote booleans; the
 * reader coerces those to `"dark"` / `"light"` so upgrades are seamless.
 */
const DARK_MODE_KEY = "ryos:theme:dark";
/**
 * Per-theme accent-color preferences, keyed by theme id. Stored as a single
 * JSON blob (same rationale as `DARK_MODE_KEY`) so it round-trips through the
 * settings-sync localStorage snapshot without a dedicated section.
 */
const ACCENT_KEY = "ryos:theme:accent";
/**
 * Aqua surface material ("classic" vs "glass"). Single flat value (only the
 * `macosx` chrome reads it). Stored as a plain string so it round-trips through
 * the settings-sync localStorage snapshot alongside the other theme keys.
 */
const AQUA_MATERIAL_KEY = "ryos:theme:aqua-material";
/**
 * Debug-only global UI font override. The default removes the inline CSS
 * custom property so the active theme token remains the source of truth.
 */
const SYSTEM_FONT_KEY = "ryos:theme:system-font";
/**
 * Last color sampled from the active wallpaper for the `"wallpaper"` accent.
 * Cached so a non-default-accent reload paints the right color immediately
 * (the sampler re-derives it from the wallpaper shortly after, in case the
 * wallpaper changed while away). Device-local — not part of settings sync.
 */
const WALLPAPER_ACCENT_COLOR_KEY = "ryos:theme:accent:wallpaper-color";

function safeReadWallpaperAccentColor(): string | null {
  try {
    return normalizeAccentHex(localStorage.getItem(WALLPAPER_ACCENT_COLOR_KEY));
  } catch {
    return null;
  }
}

function writeWallpaperAccentColor(hex: string | null) {
  try {
    if (hex) localStorage.setItem(WALLPAPER_ACCENT_COLOR_KEY, hex);
    else localStorage.removeItem(WALLPAPER_ACCENT_COLOR_KEY);
  } catch {
    // ignore quota / private-mode errors
  }
}

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

/**
 * Apply (or clear) the accent-color CSS custom properties on `<html>`.
 *
 * Inline custom properties win over every stylesheet rule, so a non-default
 * accent overrides the theme's light/dark selection tokens everywhere. For the
 * `"default"` accent we remove the inline vars entirely, restoring the
 * stylesheet's classic look (including dark-mode + brushed-metal variants).
 */
function applyRootAccent(
  theme: OsThemeId,
  accentMap: AccentMap,
  isDark: boolean,
  wallpaperColor: string | null
) {
  const root = document.documentElement;
  const chrome = getAccentChrome(theme);
  const accent = chrome ? accentMap[theme] ?? DEFAULT_ACCENT : "default";
  const vars = chrome
    ? getAccentCssVars(chrome, accent, isDark, wallpaperColor)
    : {};

  for (const name of ACCENT_CSS_VAR_NAMES) {
    const value = vars[name];
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }

  if (chrome && accent !== "default") root.dataset.osAccent = accent;
  else delete root.dataset.osAccent;
}

function applyRootSystemFont(systemFont: SystemFontId) {
  const root = document.documentElement;
  const cssValue = getSystemFontCssValue(systemFont);
  if (cssValue) {
    root.style.setProperty("--os-font-ui", cssValue);
    root.dataset.osSystemFont = systemFont;
  } else {
    root.style.removeProperty("--os-font-ui");
    delete root.dataset.osSystemFont;
  }
}

function applyRootThemeAttributes(
  theme: OsThemeId,
  isDark: boolean,
  accentMap: AccentMap,
  wallpaperColor: string | null,
  aquaMaterial: AquaMaterial,
  systemFont: SystemFontId
) {
  const root = document.documentElement;
  root.dataset.osTheme = theme;
  root.dataset.osPlatform = getOsPlatform(theme);
  const macChrome = getOsMacChrome(theme);
  if (macChrome) root.dataset.osMacChrome = macChrome;
  else delete root.dataset.osMacChrome;
  // Aqua "glass" material only applies to the macosx chrome. The attribute is
  // omitted for classic Aqua (and every other theme) so the glass overrides —
  // which key on `[data-os-aqua-material="glass"]` — stay dormant.
  if (theme === "macosx" && aquaMaterial === "glass") {
    root.dataset.osAquaMaterial = "glass";
  } else {
    delete root.dataset.osAquaMaterial;
  }
  // Color-scheme attribute is only applied when the theme supports dark mode AND it's enabled.
  // This keeps the existing light-mode CSS the single source of truth for unsupported themes.
  // Mirror the same predicate on Tailwind's `dark` class so `dark:*` utilities match Aqua dark mode
  // (Tailwind `darkMode: ["class"]` expects a `.dark` ancestor — `data-os-color-scheme` alone is insufficient).
  if (isDark && themeSupportsDarkMode(theme)) {
    root.dataset.osColorScheme = "dark";
    root.style.colorScheme = "dark";
    root.classList.add("dark");
  } else {
    delete root.dataset.osColorScheme;
    root.style.colorScheme = "light";
    root.classList.remove("dark");
  }

  applyRootAccent(theme, accentMap, isDark, wallpaperColor);
  applyRootSystemFont(systemFont);
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
    applyRootThemeAttributes(
      state.current,
      nextDark,
      state.accentByTheme,
      state.wallpaperAccentColor,
      state.aquaMaterial,
      state.systemFont
    );
  };
  if (typeof systemDarkQuery.addEventListener === "function") {
    systemDarkQuery.addEventListener("change", systemDarkListener);
  } else if (typeof systemDarkQuery.addListener === "function") {
    // Safari < 14 fallback
    systemDarkQuery.addListener(systemDarkListener);
  }
}

const createThemeStore = () => create<ThemeState>((set) => ({
  current: DEFAULT_OS_THEME_ID,
  isDark: false,
  darkModeByTheme: {},
  accentByTheme: {},
  aquaMaterial: DEFAULT_AQUA_MATERIAL,
  systemFont: THEME_DEFAULT_SYSTEM_FONT,
  wallpaperAccentColor: null,
  setTheme: (theme) => {
    const safe = sanitizeStoredTheme(theme);
    const previousTheme = useThemeStore.getState().current;
    const state = useThemeStore.getState();
    const map = state.darkModeByTheme;
    const nextDark = effectiveDarkFor(safe, map);
    set({ current: safe, isDark: nextDark });
    localStorage.setItem(THEME_KEY, safe);
    applyRootThemeAttributes(
      safe,
      nextDark,
      state.accentByTheme,
      state.wallpaperAccentColor,
      state.aquaMaterial,
      state.systemFont
    );
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
      applyRootThemeAttributes(
        state.current,
        nextDark,
        state.accentByTheme,
        state.wallpaperAccentColor,
        state.aquaMaterial,
        state.systemFont
      );
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
  setAccent: (accent, theme) => {
    const state = useThemeStore.getState();
    const target = theme ?? state.current;
    const chrome = getAccentChrome(target);
    // Accents only apply to the classic Mac chromes (Aqua + System 7).
    if (!chrome || !isValidAccent(chrome, accent)) return;

    // Persist the choice explicitly (including `"default"`/System) so it sticks
    // against the implicit wallpaper fallback used for themes with no entry.
    const nextMap: AccentMap = { ...state.accentByTheme, [target]: accent };
    writeAccentMap(nextMap);
    set({ accentByTheme: nextMap });

    if (target === state.current) {
      applyRootAccent(
        state.current,
        nextMap,
        state.isDark,
        state.wallpaperAccentColor
      );
      track(SETTINGS_ANALYTICS.THEME_CHANGE, {
        theme: state.current,
        accent,
      });
    }
  },
  setAquaMaterial: (material) => {
    if (!isAquaMaterial(material)) return;
    const state = useThemeStore.getState();
    if (material === state.aquaMaterial) return;
    writeAquaMaterial(material);
    set({ aquaMaterial: material });
    applyRootThemeAttributes(
      state.current,
      state.isDark,
      state.accentByTheme,
      state.wallpaperAccentColor,
      material,
      state.systemFont
    );
    track(SETTINGS_ANALYTICS.THEME_CHANGE, {
      theme: state.current,
      aquaMaterial: material,
    });
  },
  setSystemFont: (font) => {
    if (!isSystemFontId(font)) return;
    const state = useThemeStore.getState();
    if (font === state.systemFont) return;
    writeSystemFont(font);
    set({ systemFont: font });
    applyRootSystemFont(font);
    track(SETTINGS_ANALYTICS.THEME_CHANGE, {
      theme: state.current,
      systemFont: font,
    });
  },
  setWallpaperAccentColor: (hex) => {
    const normalized = normalizeAccentHex(hex);
    const state = useThemeStore.getState();
    if (normalized === state.wallpaperAccentColor) return;
    writeWallpaperAccentColor(normalized);
    set({ wallpaperAccentColor: normalized });

    // Only the active "wallpaper" accent needs a live re-paint.
    const chrome = getAccentChrome(state.current);
    const activeAccent = chrome
      ? state.accentByTheme[state.current] ?? DEFAULT_ACCENT
      : "default";
    if (activeAccent === "wallpaper") {
      applyRootAccent(state.current, state.accentByTheme, state.isDark, normalized);
    }
  },
  hydrate: () => {
    const saved = localStorage.getItem(THEME_KEY);
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
    const accentMap = safeReadAccentMap();
    const wallpaperAccentColor = safeReadWallpaperAccentColor();
    const aquaMaterial = safeReadAquaMaterial();
    const systemFont = safeReadSystemFont();
    const isDark = effectiveDarkFor(theme, map);
    set({
      current: theme,
      isDark,
      darkModeByTheme: map,
      accentByTheme: accentMap,
      aquaMaterial,
      systemFont,
      wallpaperAccentColor,
    });
    applyRootThemeAttributes(
      theme,
      isDark,
      accentMap,
      wallpaperAccentColor,
      aquaMaterial,
      systemFont
    );
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
