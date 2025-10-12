// Theme configuration for ryOS Design System
import { designTokens } from "./design-tokens";

export type ThemeMode = "light" | "dark" | "retro" | "system7";

export interface ThemeConfig {
  mode: ThemeMode;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
}

// Light theme configuration
export const lightTheme: Omit<ThemeConfig, "mode"> = {
  colors: {
    background: "hsl(0, 0%, 100%)",
    foreground: "hsl(0, 0%, 0%)",
    card: "hsl(0, 0%, 100%)",
    "card-foreground": "hsl(0, 0%, 0%)",
    popover: "hsl(0, 0%, 100%)",
    "popover-foreground": "hsl(0, 0%, 0%)",
    primary: "hsl(0, 0%, 0%)",
    "primary-foreground": "hsl(0, 0%, 100%)",
    secondary: "hsl(0, 0%, 89%)",
    "secondary-foreground": "hsl(0, 0%, 0%)",
    muted: "hsl(0, 0%, 89%)",
    "muted-foreground": "hsl(0, 0%, 45.1%)",
    accent: "hsl(0, 0%, 89%)",
    "accent-foreground": "hsl(0, 0%, 0%)",
    destructive: "hsl(0, 84.2%, 60.2%)",
    "destructive-foreground": "hsl(0, 0%, 98%)",
    border: "hsl(0, 0%, 0%)",
    input: "hsl(0, 0%, 0%)",
    ring: "hsl(0, 0%, 0%)",
  },
  fonts: designTokens.typography.fonts,
  spacing: designTokens.spacing,
  borderRadius: designTokens.borderRadius,
  shadows: designTokens.shadows,
};

// Dark theme configuration
export const darkTheme: Omit<ThemeConfig, "mode"> = {
  colors: {
    background: "hsl(0, 0%, 0%)",
    foreground: "hsl(0, 0%, 100%)",
    card: "hsl(0, 0%, 0%)",
    "card-foreground": "hsl(0, 0%, 100%)",
    popover: "hsl(0, 0%, 0%)",
    "popover-foreground": "hsl(0, 0%, 100%)",
    primary: "hsl(0, 0%, 100%)",
    "primary-foreground": "hsl(0, 0%, 0%)",
    secondary: "hsl(0, 0%, 14.9%)",
    "secondary-foreground": "hsl(0, 0%, 100%)",
    muted: "hsl(0, 0%, 14.9%)",
    "muted-foreground": "hsl(0, 0%, 63.9%)",
    accent: "hsl(0, 0%, 14.9%)",
    "accent-foreground": "hsl(0, 0%, 100%)",
    destructive: "hsl(0, 62.8%, 30.6%)",
    "destructive-foreground": "hsl(0, 0%, 100%)",
    border: "hsl(0, 0%, 100%)",
    input: "hsl(0, 0%, 14.9%)",
    ring: "hsl(0, 0%, 100%)",
  },
  fonts: designTokens.typography.fonts,
  spacing: designTokens.spacing,
  borderRadius: designTokens.borderRadius,
  shadows: designTokens.shadows,
};

// Retro theme configuration (CRT/old computer aesthetic)
export const retroTheme: Omit<ThemeConfig, "mode"> = {
  colors: {
    background: "hsl(120, 3%, 6%)", // Dark green-black
    foreground: "hsl(120, 7%, 89%)", // Light green
    card: "hsl(120, 3%, 8%)",
    "card-foreground": "hsl(120, 7%, 89%)",
    popover: "hsl(120, 3%, 8%)",
    "popover-foreground": "hsl(120, 7%, 89%)",
    primary: "hsl(120, 7%, 89%)",
    "primary-foreground": "hsl(120, 3%, 6%)",
    secondary: "hsl(120, 3%, 12%)",
    "secondary-foreground": "hsl(120, 7%, 89%)",
    muted: "hsl(120, 3%, 12%)",
    "muted-foreground": "hsl(120, 7%, 60%)",
    accent: "hsl(120, 3%, 12%)",
    "accent-foreground": "hsl(120, 7%, 89%)",
    destructive: "hsl(0, 84%, 60%)",
    "destructive-foreground": "hsl(120, 3%, 6%)",
    border: "hsl(120, 7%, 89%)",
    input: "hsl(120, 3%, 12%)",
    ring: "hsl(120, 7%, 89%)",
  },
  fonts: designTokens.typography.fonts,
  spacing: designTokens.spacing,
  borderRadius: { ...designTokens.borderRadius, lg: "0px" }, // Sharp corners for retro
  shadows: {
    ...designTokens.shadows,
    retro: "2px 2px 0px 0px rgb(0 0 0)",
  },
};

// System 7 theme configuration (Classic Mac OS)
export const system7Theme: Omit<ThemeConfig, "mode"> = {
  colors: {
    background: designTokens.colors.system7["window-bg"],
    foreground: designTokens.colors.system7["title-bar"],
    card: designTokens.colors.system7["window-bg"],
    "card-foreground": designTokens.colors.system7["title-bar"],
    popover: designTokens.colors.system7["window-bg"],
    "popover-foreground": designTokens.colors.system7["title-bar"],
    primary: designTokens.colors.system7["title-bar"],
    "primary-foreground": designTokens.colors.system7["title-text"],
    secondary: designTokens.colors.system7["menubar-bg"],
    "secondary-foreground": designTokens.colors.system7["title-bar"],
    muted: designTokens.colors.system7["menubar-bg"],
    "muted-foreground": designTokens.colors.system7["button-shadow"],
    accent: designTokens.colors.system7["button-highlight"],
    "accent-foreground": designTokens.colors.system7["title-bar"],
    destructive: "hsl(0, 84%, 60%)",
    "destructive-foreground": designTokens.colors.system7["title-text"],
    border: designTokens.colors.system7.border,
    input: designTokens.colors.system7["window-bg"],
    ring: designTokens.colors.system7.border,
  },
  fonts: designTokens.typography.fonts,
  spacing: designTokens.spacing,
  borderRadius: { ...designTokens.borderRadius, lg: "0px" }, // Sharp corners for System 7
  shadows: {
    ...designTokens.shadows,
    system7: "1px 1px 0px 0px rgb(0 0 0)",
  },
};

// Theme registry
export const themes: Record<ThemeMode, Omit<ThemeConfig, "mode">> = {
  light: lightTheme,
  dark: darkTheme,
  retro: retroTheme,
  system7: system7Theme,
};

// Theme utility functions
export function getTheme(mode: ThemeMode): ThemeConfig {
  return {
    mode,
    ...themes[mode],
  };
}

export function applyTheme(mode: ThemeMode): void {
  const theme = getTheme(mode);
  const root = document.documentElement;

  // Apply CSS custom properties
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });

  // Apply theme class
  root.className = root.className.replace(/theme-\w+/g, "");
  root.classList.add(`theme-${mode}`);
}

// Theme detection utilities
export function prefersDarkMode(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getSystemTheme(): ThemeMode {
  return prefersDarkMode() ? "dark" : "light";
}

// Theme persistence
export function saveThemePreference(mode: ThemeMode): void {
  localStorage.setItem("ryos-theme", mode);
}

export function loadThemePreference(): ThemeMode {
  const saved = localStorage.getItem("ryos-theme") as ThemeMode;
  return saved && themes[saved] ? saved : "system7"; // Default to system7 for ryOS
}