import {
  pickIconPath,
  type IconManifest,
} from "@/utils/icons";

const KNOWN_ICON_THEMES = new Set([
  "default",
  "macosx",
  "system7",
  "xp",
  "win98",
]);

const CORE_UI_SOUNDS = [
  "AlertBonk.mp3",
  "Boot.mp3",
  "ButtonClickDown.mp3",
  "ButtonClickUp.mp3",
  "Click.mp3",
  "MenuClose.mp3",
  "MenuItemClick.mp3",
  "MenuItemHover.mp3",
  "MenuOpen.mp3",
  "Volume.mp3",
  "WindowClose.mp3",
  "WindowControlClickDown.mp3",
  "WindowControlClickUp.mp3",
  "WindowFocus.mp3",
  "WindowOpen.mp3",
] as const;

function getLogicalIconName(iconPath: string): string | null {
  if (
    !iconPath ||
    /^(?:https?:|data:|blob:|\/\/)/i.test(iconPath) ||
    !iconPath.includes(".")
  ) {
    return null;
  }

  const withoutQuery = iconPath.split(/[?#]/)[0];
  const relative = withoutQuery
    .replace(/^\/?icons\//, "")
    .replace(/^\/+/, "");
  const segments = relative.split("/");
  if (segments.length > 1 && KNOWN_ICON_THEMES.has(segments[0])) {
    return segments.slice(1).join("/");
  }
  return relative;
}

export function collectActiveThemeIconUrls({
  theme,
  manifest,
  iconPaths,
}: {
  theme: string;
  manifest: IconManifest;
  iconPaths: readonly string[];
}): string[] {
  const urls = new Set<string>();
  for (const iconPath of iconPaths) {
    const logicalName = getLogicalIconName(iconPath);
    if (!logicalName) continue;
    urls.add(
      pickIconPath(logicalName, {
        theme,
        manifest,
      })
    );
  }
  return [...urls];
}

export function getThemeStaticAssetUrls(theme: string): string[] {
  switch (theme) {
    case "xp":
      return ["/assets/splash/xp.png", "/assets/splash/xp-boot.gif"];
    case "win98":
      return ["/assets/splash/win98.png", "/assets/splash/win98.gif"];
    case "system7":
      return ["/assets/splash/hello.svg", "/assets/splash/macos.svg"];
    case "macosx":
    default:
      return [
        "/assets/brushed-metal.jpg",
        "/assets/button.svg",
        "/assets/button-default.svg",
        "/assets/splash/hello.svg",
        "/assets/splash/macos.svg",
      ];
  }
}

export function getCoreSoundUrls(): string[] {
  return CORE_UI_SOUNDS.map((sound) => `/sounds/${sound}`);
}
