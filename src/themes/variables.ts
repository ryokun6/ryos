import { OsTheme } from "./types";

const toPx = (value: number | string) =>
  typeof value === "number" ? `${value}px` : value;

/**
 * Convert an OsTheme object into a map of CSS variable assignments.
 * These variables mirror the tokens defined in styles/themes.css so the
 * runtime theme contract stays in sync with the TS source of truth.
 */
export function themeToCssVariables(theme: OsTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--os-font-ui": theme.fonts.ui,
    "--os-font-mono": theme.fonts.mono ?? theme.fonts.ui,
    ...(theme.fonts.extra ?? {}),

    "--os-color-window-bg": theme.colors.windowBg,
    "--os-color-menubar-bg": theme.colors.menubarBg,
    "--os-color-menubar-border": theme.colors.menubarBorder,
    "--os-color-window-border": theme.colors.windowBorder,
    "--os-color-titlebar-active-bg": theme.colors.titleBar.activeBg,
    "--os-color-titlebar-inactive-bg": theme.colors.titleBar.inactiveBg,
    "--os-color-titlebar-text": theme.colors.titleBar.text,
    "--os-color-titlebar-text-inactive": theme.colors.titleBar.inactiveText,
    "--os-color-button-face": theme.colors.button.face,
    "--os-color-button-highlight": theme.colors.button.highlight,
    "--os-color-button-shadow": theme.colors.button.shadow,
    "--os-color-selection-bg": theme.colors.selection.bg,
    "--os-color-selection-text": theme.colors.selection.text,
    "--os-color-text-primary": theme.colors.text.primary,
    "--os-color-text-secondary": theme.colors.text.secondary,
    "--os-color-text-disabled": theme.colors.text.disabled,

    "--os-metrics-border-width": theme.metrics.borderWidth,
    "--os-metrics-radius": theme.metrics.radius,
    "--os-metrics-titlebar-height": theme.metrics.titleBarHeight,
    "--os-metrics-menubar-height": toPx(theme.metadata.menuBarHeight),
    "--os-window-shadow": theme.metrics.windowShadow,
    "--os-taskbar-height": toPx(theme.metadata.taskbarHeight),
    "--os-dock-base-height": toPx(theme.metadata.baseDockHeight),
  };

  // Optional / theme-specific values
  if (theme.colors.windowBorderInactive) {
    vars["--os-color-window-border-inactive"] = theme.colors.windowBorderInactive;
  }
  if (theme.colors.titleBar.border) {
    vars["--os-color-titlebar-border"] = theme.colors.titleBar.border;
  }
  if (theme.colors.titleBar.borderInactive) {
    vars["--os-color-titlebar-border-inactive"] =
      theme.colors.titleBar.borderInactive;
  }
  if (theme.colors.titleBar.pattern) {
    vars["--os-color-titlebar-pattern"] = theme.colors.titleBar.pattern;
  }
  if (theme.colors.button.activeFace) {
    vars["--os-color-button-active-face"] = theme.colors.button.activeFace;
  }
  if (theme.colors.titleBar.borderBottom) {
    vars["--os-color-titlebar-border-bottom"] =
      theme.colors.titleBar.borderBottom;
  }

  if (theme.colors.trafficLights) {
    const { trafficLights } = theme.colors;
    if (trafficLights.close) {
      vars["--os-color-traffic-light-close"] = trafficLights.close;
    }
    if (trafficLights.closeHover) {
      vars["--os-color-traffic-light-close-hover"] = trafficLights.closeHover;
    }
    if (trafficLights.minimize) {
      vars["--os-color-traffic-light-minimize"] = trafficLights.minimize;
    }
    if (trafficLights.minimizeHover) {
      vars["--os-color-traffic-light-minimize-hover"] =
        trafficLights.minimizeHover;
    }
    if (trafficLights.maximize) {
      vars["--os-color-traffic-light-maximize"] = trafficLights.maximize;
    }
    if (trafficLights.maximizeHover) {
      vars["--os-color-traffic-light-maximize-hover"] =
        trafficLights.maximizeHover;
    }
  }

  if (theme.colors.selection.glow) {
    vars["--os-color-selection-glow"] = theme.colors.selection.glow;
  }

  if (theme.metrics.titleBarBorderWidth) {
    vars["--os-metrics-titlebar-border-width"] = theme.metrics.titleBarBorderWidth;
  }

  if (theme.textures) {
    const { textures } = theme;
    if (textures.toolbarImage) {
      vars["--os-texture-toolbar-image"] = textures.toolbarImage;
    }
    if (textures.toolbarSize) {
      vars["--os-texture-toolbar-size"] = textures.toolbarSize;
    }
    if (textures.toolbarRepeat) {
      vars["--os-texture-toolbar-repeat"] = textures.toolbarRepeat;
    }
    if (textures.toolbarPosition) {
      vars["--os-texture-toolbar-position"] = textures.toolbarPosition;
    }
    if (textures.pinstripeTitlebar) {
      vars["--os-pinstripe-titlebar"] = textures.pinstripeTitlebar;
    }
    if (textures.pinstripeWindow) {
      vars["--os-pinstripe-window"] = textures.pinstripeWindow;
    }
    if (textures.pinstripeMenubar) {
      vars["--os-pinstripe-menubar"] = textures.pinstripeMenubar;
    }
  }

  return vars;
}

/**
 * Apply theme CSS variables to the document root.
 * Safe to call multiple times; no-op during SSR.
 */
export function applyThemeCssVariables(theme: OsTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const variables = themeToCssVariables(theme);

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
