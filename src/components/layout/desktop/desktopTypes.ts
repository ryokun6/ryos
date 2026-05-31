import type { AnyApp } from "@/apps/base/types";
import type { AppId } from "@/config/appRegistry";
import type { LaunchOriginRect } from "@/stores/useAppStore";

export interface DesktopStyles {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
  transition?: string;
}

export interface DesktopProps {
  apps: AnyApp[];
  toggleApp: (
    appId: AppId,
    initialData?: unknown,
    launchOrigin?: LaunchOriginRect
  ) => void;
  onClick?: () => void;
  desktopStyles?: DesktopStyles;
}

export type DesktopItemId = string;

export interface DesktopItemDefinition {
  id: DesktopItemId;
  kind: "app" | "shortcut";
}
