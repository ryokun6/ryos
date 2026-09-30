export interface MenubarWindowChromeInput {
  /** The host shell provides a frameless desktop window (see RyosDesktopCapabilities). */
  hasWindowChrome: boolean;
  /** Touch device with a phone-width viewport (`useIsPhone`). */
  isPhone: boolean;
  isWindowsPlatform: boolean;
  isMacTheme: boolean;
  isFullscreen: boolean;
}

export interface MenubarWindowChromeLayout {
  /** Render the flex-1 `-webkit-app-region: drag` spacer between menus and status controls. */
  showWindowDragRegion: boolean;
  /** Inset the menubar 78px for macOS traffic lights and grow it to 32px. */
  needsTrafficLightClearance: boolean;
}

export function getMenubarWindowChromeLayout({
  hasWindowChrome,
  isPhone,
  isWindowsPlatform,
  isMacTheme,
  isFullscreen,
}: MenubarWindowChromeInput): MenubarWindowChromeLayout {
  return {
    // On a touch phone the scrollable menu strip is itself flex-1; a second
    // flex-1 spacer would split the leftover width with it.
    showWindowDragRegion: hasWindowChrome && !isPhone,
    needsTrafficLightClearance:
      hasWindowChrome && !isWindowsPlatform && isMacTheme && !isFullscreen,
  };
}
