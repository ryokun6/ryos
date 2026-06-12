import { useEffect, useState } from "react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import {
  menubarTextColorForLuminance,
  menubarTextForTone,
  menubarTextToneForLuminance,
  sampleWallpaperTopLuminance,
  type MenubarTextTone,
} from "@/themes/wallpaperMenubarText";

export interface WallpaperMenubarText {
  textColor: string;
  tone: MenubarTextTone;
}

function fallbackMenubarText(isDarkMode: boolean): WallpaperMenubarText {
  const tone: MenubarTextTone = isDarkMode ? "light" : "dark";
  return { textColor: menubarTextForTone(tone), tone };
}

/**
 * Samples the wallpaper region behind the menubar and picks a readable label
 * color. Only meaningful for Aqua Glass (transparent menubar); callers should
 * pass `enabled: isAquaGlass`.
 */
export function useWallpaperMenubarText(enabled: boolean): WallpaperMenubarText {
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();
  const { isDarkMode } = useThemeFlags();
  const [result, setResult] = useState<WallpaperMenubarText>(() =>
    fallbackMenubarText(isDarkMode)
  );

  useEffect(() => {
    if (!enabled) return;

    if (isVideoWallpaper || !wallpaperSource) {
      setResult(fallbackMenubarText(isDarkMode));
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";

    const applyLuminance = (luminance: number) => {
      if (cancelled) return;
      setResult({
        textColor: menubarTextColorForLuminance(luminance),
        tone: menubarTextToneForLuminance(luminance),
      });
    };

    img.onload = () => {
      try {
        applyLuminance(sampleWallpaperTopLuminance(img));
      } catch {
        if (!cancelled) setResult(fallbackMenubarText(isDarkMode));
      }
    };

    img.onerror = () => {
      if (!cancelled) setResult(fallbackMenubarText(isDarkMode));
    };

    img.src = wallpaperSource;
    return () => {
      cancelled = true;
    };
  }, [enabled, wallpaperSource, isVideoWallpaper, isDarkMode]);

  return result;
}
