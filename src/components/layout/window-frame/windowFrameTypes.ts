import type { AppId } from "@/config/appIds";

export interface WindowFrameProps {
  children: React.ReactNode;
  title: string;
  onClose?: () => void;
  isForeground?: boolean;
  appId: AppId;
  isShaking?: boolean;
  /** Window material style: "default" (opaque), "transparent" (translucent bg), "notitlebar" (immersive, titlebar on hover), "brushedmetal" (macOS brushed aluminum) */
  material?: "default" | "transparent" | "notitlebar" | "brushedmetal";
  skipInitialSound?: boolean;
  windowConstraints?: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number | string;
    maxHeight?: number | string;
  };
  // Instance support
  instanceId?: string;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
  // Close interception support
  interceptClose?: boolean;
  menuBar?: React.ReactNode; // Add menuBar prop
  // Keep content mounted when minimized (useful for audio/video apps)
  keepMountedWhenMinimized?: boolean;
  // Fullscreen toggle callback (for apps like iPod and Karaoke that support fullscreen)
  onFullscreenToggle?: () => void;
  /** Cover Flow toggle (shown left of fullscreen when set; iPod / Karaoke). */
  onCoverFlowToggle?: () => void;
  isCoverFlowActive?: boolean;
  // Disable auto-hide for notitlebar material (keeps titlebar always visible)
  disableTitlebarAutoHide?: boolean;
  // Custom content for the right side of the titlebar (replaces fullscreen button if provided)
  titleBarRightContent?: React.ReactNode;
  /**
   * Optional classic-Mac-OS-X-style drawer rendered attached to the
   * window's right edge. The drawer is positioned inside the same
   * coordinate space as the window content so it pins to the window
   * during drag/resize. The component is responsible for its own
   * open/closed animation; WindowFrame just provides the slot.
   */
  drawer?: React.ReactNode;
}
