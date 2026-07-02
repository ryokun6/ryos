import { useMemo, useRef, useState, type CSSProperties } from "react";
import { TrafficLightButton } from "@/components/shared/TrafficLightButton";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useWallpaper } from "@/hooks/useWallpaper";
import { resolveStaticWallpaperRenderUrl } from "@/utils/staticWallpaperUrl";
import { INDEXEDDB_PREFIX } from "@/stores/useDisplaySettingsStore";
import {
  getDayNightGradientCss,
  isDayNightGradientWallpaper,
  isDynamicWallpaper,
} from "@/utils/dynamicWallpaper";
import { cn } from "@/lib/utils";
import { AppearancePreviewTabGroup } from "./AppearancePreviewTabGroup";

const noopClick = () => {};

/** Fixed design canvas — cropped at native scale from the top-left. */
export const MACOSX_PREVIEW_CANVAS_WIDTH = 480;
export const MACOSX_PREVIEW_CANVAS_HEIGHT = 320;
/** Inset from preview well edges (0 = edge-to-edge inside the well). */
export const MACOSX_PREVIEW_INSET = 0;
/** Document window width on the fixed design canvas. */
export const MACOSX_PREVIEW_WINDOW_WIDTH = 300;

/** Horizontally center the preview window within the visible (cropped) canvas area. */
export function computeMacosxPreviewWindowLeft(
  hostWidth: number,
  scale: number,
  windowWidth = MACOSX_PREVIEW_WINDOW_WIDTH,
  inset = MACOSX_PREVIEW_INSET
): number {
  if (hostWidth <= 0) {
    return (MACOSX_PREVIEW_CANVAS_WIDTH - windowWidth) / 2;
  }
  const availableWidth = hostWidth - inset * 2;
  const visibleCanvasWidth = availableWidth / scale;
  return Math.max(0, (visibleCanvasWidth - windowWidth) / 2);
}

export type AppearanceMacosxPreviewSceneProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  aquaMaterial: "classic" | "glass";
};

function isStaticImageWallpaper(source: string, isVideo: boolean): boolean {
  if (!source) return false;
  if (isVideo) return false;
  if (source.startsWith(INDEXEDDB_PREFIX)) return false;
  if (isDynamicWallpaper(source)) return false;
  return true;
}

export function AppearanceMacosxPreviewScene({
  t,
  aquaMaterial,
}: AppearanceMacosxPreviewSceneProps) {
  const { isAquaGlass } = useThemeFlags();
  const isGlass = aquaMaterial === "glass" && isAquaGlass;
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();

  const scaleHostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [hostWidth, setHostWidth] = useState(0);

  useResizeObserverWithRef(scaleHostRef, (entry) => {
    const { width } = entry.contentRect;
    if (width <= 0) return;
    setHostWidth(width);
    const availableWidth = width - MACOSX_PREVIEW_INSET * 2;
    // Never shrink below native — crop overflow instead of fitting the whole scene.
    const next = Math.max(1, availableWidth / MACOSX_PREVIEW_CANVAS_WIDTH);
    setScale(next);
  });

  const windowLeft = useMemo(
    () => computeMacosxPreviewWindowLeft(hostWidth, scale),
    [hostWidth, scale]
  );

  const wallpaperStyle = useMemo((): CSSProperties => {
    if (isStaticImageWallpaper(wallpaperSource, isVideoWallpaper)) {
      const isTiled = wallpaperSource.includes("/wallpapers/tiles/");
      const renderSource = resolveStaticWallpaperRenderUrl(wallpaperSource);
      return {
        backgroundImage: `url("${renderSource}")`,
        backgroundSize: isTiled ? "64px 64px" : "cover",
        backgroundRepeat: isTiled ? "repeat" : "no-repeat",
        backgroundPosition: "center",
      };
    }
    if (isDayNightGradientWallpaper(wallpaperSource)) {
      return { backgroundImage: getDayNightGradientCss() };
    }
    return {
      backgroundColor: "var(--os-color-window-bg)",
      backgroundImage: "var(--os-pinstripe-window)",
    };
  }, [wallpaperSource, isVideoWallpaper]);

  const titleBarStyle: CSSProperties = isGlass
    ? { background: "transparent" }
    : {
        backgroundColor: "var(--os-color-window-bg)",
        backgroundImage:
          "var(--os-pinstripe-titlebar), var(--os-pinstripe-window)",
        borderBottom:
          "1px solid var(--os-color-titlebar-border, rgba(0, 0, 0, 0.1))",
      };

  const listStyle = {
    "--os-color-selection-bg": "var(--os-accent-list-gradient, #3875d7)",
  } as CSSProperties;

  return (
    <div
      ref={scaleHostRef}
      className="control-panels-theme-preview-scale-host"
      aria-hidden="true"
    >
      <div
        className="control-panels-theme-preview-canvas"
        style={{
          width: MACOSX_PREVIEW_CANVAS_WIDTH,
          height: MACOSX_PREVIEW_CANVAS_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        <div
          className="control-panels-theme-preview-desktop-live desktop-background"
          style={wallpaperStyle}
        />
        <div
          className={cn(
            "window control-panels-theme-preview-window-live is-foreground relative flex flex-col overflow-hidden rounded-os border-[length:var(--os-metrics-border-width)] border-os-window bg-os-window-bg shadow-os-window",
            isGlass && "window-material-glass"
          )}
          style={{ left: windowLeft }}
        >
              <div
                className="title-bar relative z-50 flex h-6 min-h-[1.25rem] shrink-0 cursor-default select-none items-center px-[0.1rem] py-[0.1rem]"
                style={titleBarStyle}
              >
                <div
                  className="group/traffic relative ml-1.5 flex items-center gap-1.5"
                  data-titlebar-controls
                >
                  <TrafficLightButton
                    color="red"
                    onClick={noopClick}
                    isForeground
                    showResizers={false}
                    ariaLabel=""
                  />
                  <TrafficLightButton
                    color="yellow"
                    onClick={noopClick}
                    isForeground
                    showResizers={false}
                    ariaLabel=""
                  />
                  <TrafficLightButton
                    color="green"
                    onClick={noopClick}
                    isForeground
                    showResizers={false}
                    ariaLabel=""
                  />
                </div>
                <span
                  className="pointer-events-none absolute left-1/2 flex h-full max-w-[calc(100%-72px)] -translate-x-1/2 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap px-2 text-[11px] font-medium text-os-titlebar-active-text"
                  style={{ textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)" }}
                >
                  <span className="truncate">
                    {t("apps.control-panels.themePreviewWindowTitle")}
                  </span>
                </span>
              </div>

              <div className="window-body control-panels-theme-preview-window-body-live flex min-h-0 flex-1 flex-col">
                <AppearancePreviewTabGroup t={t}>
                  <div
                    className="control-panels-theme-preview-list-live"
                    style={listStyle}
                  >
                    <div className="control-panels-theme-preview-list-row-live">
                      {t("apps.control-panels.themePreviewFirstItem")}
                    </div>
                    <div className="control-panels-theme-preview-list-row-live control-panels-theme-preview-list-row-live-selected">
                      {t("apps.control-panels.themePreviewSelectedItem")}
                    </div>
                  </div>
                </AppearancePreviewTabGroup>
              </div>
            </div>
      </div>
    </div>
  );
}
