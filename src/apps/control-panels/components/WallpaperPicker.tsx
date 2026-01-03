import { useState, useEffect, useRef, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useSound, Sounds } from "@/hooks/useSound";
import type { DisplayMode } from "@/utils/displayMode";
import { Plus } from "@phosphor-icons/react";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { loadWallpaperManifest } from "@/utils/wallpapers";
import type { WallpaperManifest as WallpaperManifestType } from "@/utils/wallpapers";
import { useTranslation } from "react-i18next";

// Remove unused constants
interface WallpaperItemProps {
  path: string;
  isSelected: boolean;
  onClick: () => void;
  isTile?: boolean;
  isVideo?: boolean;
  previewUrl?: string; // For IndexedDB references
}

function WallpaperItem({
  path,
  isSelected,
  onClick,
  isTile = false,
  isVideo = false,
  previewUrl,
}: WallpaperItemProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(isVideo);
  const displayUrl = previewUrl || path;

  const handleClick = () => {
    playClick();
    onClick();
  };

  useEffect(() => {
    if (isVideo && videoRef.current) {
      if (isSelected) {
        videoRef.current
          .play()
          .catch((err) => console.error("Error playing video:", err));
      } else {
        videoRef.current.pause();
      }

      // Check if video is already cached/loaded
      if (videoRef.current.readyState >= 3) {
        // HAVE_FUTURE_DATA or better
        setIsLoading(false);
      }
    }
  }, [isSelected, isVideo]);

  const handleVideoLoaded = () => {
    setIsLoading(false);
  };

  const handleCanPlayThrough = () => {
    setIsLoading(false);
  };

  if (isVideo) {
    return (
      <button
        type="button"
        className="preview-button w-full aspect-video cursor-pointer hover:opacity-90 relative overflow-hidden"
        style={{
          boxShadow: isSelected ? "0 0 0 1px #fff, 0 0 0 3px var(--os-color-selection-bg)" : undefined,
        }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-gray-700/30">
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50"
              style={{
                backgroundSize: "200% 100%",
                animation: "shimmer 2.5s infinite ease-in-out",
              }}
            />
          </div>
        )}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          src={displayUrl}
          loop
          muted
          playsInline
          onLoadedData={handleVideoLoaded}
          onCanPlayThrough={handleCanPlayThrough}
          style={{
            objectPosition: "center center",
            opacity: isLoading ? 0 : 1,
            transition: "opacity 0.5s ease-in-out",
          }}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`preview-button w-full ${
        isTile ? "aspect-square" : "aspect-video"
      } cursor-pointer hover:opacity-90`}
      style={{
        backgroundImage: `url(${displayUrl})`,
        backgroundSize: isTile ? "64px 64px" : "cover",
        backgroundPosition: isTile ? undefined : "center",
        backgroundRepeat: isTile ? "repeat" : undefined,
        boxShadow: isSelected ? "0 0 0 1px #fff, 0 0 0 3px var(--os-color-selection-bg)" : undefined,
      }}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    />
  );
}

type PhotoCategory = string;

// Wallpaper data will be loaded from the generated manifest at runtime.
interface WallpaperPickerProps {
  onSelect?: (path: string) => void;
}

export function WallpaperPicker({ onSelect }: WallpaperPickerProps) {
  const {
    currentWallpaper,
    setWallpaper,
    INDEXEDDB_PREFIX,
    loadCustomWallpapers,
    getWallpaperData,
  } = useWallpaper();

  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const displayMode = useDisplaySettingsStore((s) => s.displayMode);
  const setDisplayMode = useDisplaySettingsStore((s) => s.setDisplayMode);
  const { t } = useTranslation();
  const [customWallpaperRefs, setCustomWallpaperRefs] = useState<string[]>([]);
  const [customWallpaperPreviews, setCustomWallpaperPreviews] = useState<
    Record<string, string>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manifest, setManifest] = useState<WallpaperManifestType | null>(null);
  useEffect(() => {
    loadWallpaperManifest()
      .then(setManifest)
      .catch((err) => console.error("Failed to load wallpaper manifest", err));
  }, []);

  const tileWallpapers = useMemo(
    () => (manifest ? manifest.tiles.map((p) => `/wallpapers/${p}`) : []),
    [manifest]
  );
  const videoWallpapers = useMemo(
    () => (manifest ? manifest.videos.map((p) => `/wallpapers/${p}`) : []),
    [manifest]
  );
  const photoWallpapers = useMemo(() => {
    if (!manifest) return {} as Record<string, string[]>;
    const r: Record<string, string[]> = {};
    for (const [cat, arr] of Object.entries(manifest.photos)) {
      r[cat] = arr.map((p) => `/wallpapers/${p}`);
    }
    return r;
  }, [manifest]);
  const photoCategories = Object.keys(photoWallpapers);
  const photoCategoriesSorted = useMemo(
    () =>
      photoCategories
        .filter((cat) => cat !== "custom" && cat !== "videos")
        .sort((a, b) => a.localeCompare(b)),
    [photoCategories]
  );

  const [selectedCategory, setSelectedCategory] = useState<
    "tiles" | PhotoCategory
  >(() => {
    if (currentWallpaper.includes("/wallpapers/tiles/")) return "tiles";
    if (currentWallpaper.startsWith(INDEXEDDB_PREFIX)) return "custom";
    if (currentWallpaper.includes("/wallpapers/videos/")) return "videos";
    const match = currentWallpaper.match(/\/wallpapers\/photos\/([^/]+)\//);
    if (match) return match[1];
    return "tiles";
  });

  // Load custom wallpapers from IndexedDB (just the references)
  useEffect(() => {
    const fetchCustomWallpapers = async () => {
      try {
        const refs = await loadCustomWallpapers();
        setCustomWallpaperRefs(refs);

        // Load preview data for each reference
        const previews: Record<string, string> = {};
        for (const ref of refs) {
          const data = await getWallpaperData(ref);
          if (data) {
            previews[ref] = data;
          }
        }
        setCustomWallpaperPreviews(previews);
      } catch (error) {
        console.error("Error fetching custom wallpapers:", error);
      }
    };

    fetchCustomWallpapers();
  }, [loadCustomWallpapers, getWallpaperData, INDEXEDDB_PREFIX]);

  const handleWallpaperSelect = (path: string) => {
    setWallpaper(path);
    playClick();
    if (onSelect) {
      onSelect(path);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const file = event.target.files[0];
    const isImage = file.type.startsWith("image/");

    if (!isImage) {
      alert("Please select an image file. Videos are not supported.");
      return;
    }

    try {
      // Upload directly using the setWallpaper method which now accepts File objects
      await setWallpaper(file);

      // Refresh the custom wallpapers list
      const refs = await loadCustomWallpapers();
      setCustomWallpaperRefs(refs);

      // Load preview for the new wallpaper
      for (const ref of refs) {
        if (!customWallpaperPreviews[ref]) {
          const data = await getWallpaperData(ref);
          if (data) {
            setCustomWallpaperPreviews((prev) => ({
              ...prev,
              [ref]: data,
            }));
          }
        }
      }

      // Switch to custom category
      setSelectedCategory("custom");
    } catch (error) {
      console.error("Error uploading wallpaper:", error);
      alert("Error uploading wallpaper. Please try again with a smaller file.");
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Force rerender when wallpaper changes
  useEffect(() => {
    if (currentWallpaper.includes("/wallpapers/tiles/")) {
      setSelectedCategory("tiles");
    } else if (currentWallpaper.startsWith(INDEXEDDB_PREFIX)) {
      setSelectedCategory("custom");
    } else if (currentWallpaper.includes("/wallpapers/videos/")) {
      setSelectedCategory("videos");
    } else {
      const match = currentWallpaper.match(/\/wallpapers\/photos\/([^/]+)\//);
      if (match) setSelectedCategory(match[1]);
    }
  }, [currentWallpaper, INDEXEDDB_PREFIX]);

  const formatCategoryLabel = (category: string) => {
    return category
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Determine if a wallpaper is a video
  const isVideoWallpaper = (path: string, previewUrl?: string) => {
    const url = previewUrl || path;
    return (
      url.endsWith(".mp4") ||
      url.includes("video/") ||
      (url.startsWith("https://") && /\.(mp4|webm|ogg)($|\?)/.test(url))
    );
  };

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex items-center gap-2">
        <div className="flex-[3]">
          <Select
            value={selectedCategory}
            onValueChange={(value) =>
              setSelectedCategory(value as typeof selectedCategory)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("apps.control-panels.selectACategory")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="videos">{t("common.menu.videos")}</SelectItem>
              <SelectItem value="tiles">{t("apps.control-panels.patterns")}</SelectItem>
              <SelectItem value="custom">{t("apps.control-panels.custom")}</SelectItem>
              <SelectSeparator
                className="-mx-1 my-1 h-px"
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.15)",
                  border: "none",
                  margin: "4px 0",
                  height: "1px",
                }}
              />
              {photoCategoriesSorted.map((category) => (
                <SelectItem key={category} value={category}>
                  {formatCategoryLabel(category)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select
          value={displayMode}
          onValueChange={(value) => setDisplayMode(value as DisplayMode)}
        >
          <SelectTrigger className="w-[120px] flex-shrink-0">
            <SelectValue placeholder={t("apps.control-panels.displayMode")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="color">{t("apps.control-panels.color")}</SelectItem>
            <SelectItem value="monotone">{t("apps.control-panels.mono")}</SelectItem>
            <SelectItem value="crt">{t("apps.control-panels.crt")}</SelectItem>
            <SelectItem value="sepia">{t("apps.control-panels.sepia")}</SelectItem>
            <SelectItem value="high-contrast">{t("apps.control-panels.highContrast")}</SelectItem>
            <SelectItem value="dream">{t("apps.control-panels.dream")}</SelectItem>
            <SelectItem value="invert">{t("apps.control-panels.invert")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedCategory === "custom" && (
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      )}

      <div className="flex-1">
        <div
          className={`grid gap-2 py-1 ${
            selectedCategory === "tiles" ? "grid-cols-8" : "grid-cols-3"
          }`}
        >
          {selectedCategory === "tiles" ? (
            tileWallpapers.map((path) => (
              <WallpaperItem
                key={path}
                path={path}
                isSelected={currentWallpaper === path}
                onClick={() => handleWallpaperSelect(path)}
                isTile
              />
            ))
          ) : selectedCategory === "videos" ? (
            videoWallpapers.map((path) => (
              <WallpaperItem
                key={path}
                path={path}
                isSelected={currentWallpaper === path}
                onClick={() => handleWallpaperSelect(path)}
                isVideo
              />
            ))
          )           : selectedCategory === "custom" ? (
            <>
              <button
                type="button"
                className="preview-button w-full aspect-video !border-[2px] !border-dotted !border-gray-400 cursor-pointer hover:opacity-90 flex items-center justify-center"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <Plus className="h-5 w-5 text-gray-500" weight="bold" />
              </button>
              {customWallpaperRefs.length > 0 ? (
                customWallpaperRefs.map((path) => (
                  <WallpaperItem
                    key={path}
                    path={path}
                    previewUrl={customWallpaperPreviews[path]}
                    isSelected={currentWallpaper === path}
                    onClick={() => handleWallpaperSelect(path)}
                    isVideo={isVideoWallpaper(
                      path,
                      customWallpaperPreviews[path]
                    )}
                  />
                ))
              ) : (
                <></>
              )}
            </>
          ) : photoWallpapers[selectedCategory] ? (
            photoWallpapers[selectedCategory].map((path) => (
              <WallpaperItem
                key={path}
                path={path}
                isSelected={currentWallpaper === path}
                onClick={() => handleWallpaperSelect(path)}
              />
            ))
          ) : (
            <div className="col-span-4 text-center py-8 text-gray-500">
              No wallpapers
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
