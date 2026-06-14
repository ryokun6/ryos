import { useReducer, useEffect, useRef, useMemo, useState } from "react";
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
import {
  Plus,
  Trash,
  Shuffle,
  MusicNotes,
  Sun,
} from "@phosphor-icons/react";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { loadWallpaperManifest } from "@/utils/wallpapers";
import type { WallpaperManifest as WallpaperManifestType } from "@/utils/wallpapers";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import {
  COVER_WALLPAPER,
  DAY_NIGHT_GRADIENT_WALLPAPER,
  buildShuffleDescriptor,
  getDayNightGradientCss,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
  isShuffleWallpaper,
  parseShuffleDescriptor,
} from "@/utils/dynamicWallpaper";
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
          boxShadow: isSelected
            ? "0 0 0 1px var(--os-color-selection-ring-gap), 0 0 0 3px var(--os-color-selection-bg)"
            : undefined,
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
          <div className="absolute inset-0 bg-neutral-700/30">
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
          className="absolute inset-0 size-full object-cover"
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
        boxShadow: isSelected
          ? "0 0 0 1px var(--os-color-selection-ring-gap), 0 0 0 3px var(--os-color-selection-bg)"
          : undefined,
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

interface SpecialTileProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  isTile?: boolean;
  /** Inline style for the tile background (gradient / cover / random art). */
  backgroundStyle?: React.CSSProperties;
  /** Optional muted looping video rendered as the tile background. */
  backgroundVideoUrl?: string;
  /**
   * Optional icon element centered in the space above the label. Rendered in
   * its own flex-grow row so the bottom label never shifts it off-center.
   */
  icon?: React.ReactNode;
  /**
   * Render a plain dark scrim (no blur) under the icon + label. Used for tiles
   * whose preview can be an arbitrary bright/busy photo (the Shuffle tiles) so
   * the white glyphs always stay legible.
   */
  scrim?: boolean;
}

/** Tile used for dynamic & shuffle wallpaper options (carries a text label). */
function SpecialTile({
  label,
  isSelected,
  onClick,
  isTile = false,
  backgroundStyle,
  backgroundVideoUrl,
  icon,
  scrim = false,
}: SpecialTileProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const handleClick = () => {
    playClick();
    onClick();
  };
  return (
    <button
      type="button"
      className={`preview-button relative w-full ${
        isTile ? "aspect-square" : "aspect-video"
      } cursor-pointer hover:opacity-90 flex flex-col overflow-hidden text-white`}
      style={{
        backgroundColor: "#2a2a32",
        ...backgroundStyle,
        boxShadow: isSelected
          ? "0 0 0 1px var(--os-color-selection-ring-gap), 0 0 0 3px var(--os-color-selection-bg)"
          : undefined,
      }}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {backgroundVideoUrl && (
        <video
          className="absolute inset-0 size-full object-cover"
          src={backgroundVideoUrl}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {scrim && (
        <>
          {/* Flat dark wash so the centered icon stays readable over any art. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-black/30"
          />
          {/* Stronger bottom-up gradient anchoring the label. No blur. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
            }}
          />
        </>
      )}
      {/* Icon occupies its own flex-grow row so it stays centered within the
          space that remains above the label (rather than the full tile). The
          row is always rendered — even when there's no icon — so the label
          keeps its position. */}
      <span
        className="relative flex min-h-0 flex-1 items-center justify-center text-white opacity-[0.85]"
        style={{
          // Uniform element opacity (not color alpha) so the tile art shows
          // through the glyph consistently. A simple drop-shadow keeps it
          // legible on dark gradients, bright covers and busy patterns alike.
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))",
        }}
      >
        {icon}
      </span>
      {/* White label dimmed via element opacity (matching the icon) with a
          single soft dark text-shadow. Crisp and readable on dark gradients,
          bright covers and busy patterns without any blend modes. */}
      <span
        className="relative w-full px-1 pt-1 pb-0.5 text-[10px] leading-tight text-center font-medium truncate text-white opacity-[0.85]"
        style={{
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        {label}
      </span>
    </button>
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
    wallpaperSource,
    setWallpaper,
    INDEXEDDB_PREFIX,
    loadCustomWallpapers,
    getWallpaperData,
  } = useWallpaper();
  const deleteCustomWallpaper = useDisplaySettingsStore(
    (s) => s.deleteCustomWallpaper
  );
  const customWallpapersRevision = useDisplaySettingsStore(
    (s) => s.customWallpapersRevision
  );

  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const displayMode = useDisplaySettingsStore((s) => s.displayMode);
  const setDisplayMode = useDisplaySettingsStore((s) => s.setDisplayMode);
  const { t } = useTranslation();
  const nowPlaying = useNowPlayingCover();
  // Preview the gradient for the current time of day (static within a session).
  const dayNightPreview = useMemo(() => getDayNightGradientCss(), []);
  const deriveCategoryFromWallpaper = (
    wallpaper: string
  ): "tiles" | PhotoCategory => {
    if (isDayNightGradientWallpaper(wallpaper) || isCoverWallpaper(wallpaper))
      return "dynamic";
    const shuffleTarget = parseShuffleDescriptor(wallpaper);
    if (shuffleTarget) {
      if (shuffleTarget.kind === "tiles") return "tiles";
      if (shuffleTarget.kind === "videos") return "videos";
      return shuffleTarget.category;
    }
    if (wallpaper.includes("/wallpapers/tiles/")) return "tiles";
    if (wallpaper.startsWith(INDEXEDDB_PREFIX)) return "custom";
    if (wallpaper.includes("/wallpapers/videos/")) return "videos";
    const match = wallpaper.match(/\/wallpapers\/photos\/([^/]+)\//);
    if (match) return match[1];
    return "tiles";
  };
  type PickerState = {
    customWallpaperRefs: string[];
    customWallpaperPreviews: Record<string, string>;
    selectedCategory: "tiles" | PhotoCategory;
  };
  type PickerAction =
    | {
        type: "setCustomData";
        refs: string[];
        previews: Record<string, string>;
      }
    | { type: "removeCustomWallpaper"; ref: string }
    | { type: "setSelectedCategory"; category: "tiles" | PhotoCategory };
  const initialState: PickerState = {
    customWallpaperRefs: [],
    customWallpaperPreviews: {},
    selectedCategory: deriveCategoryFromWallpaper(currentWallpaper),
  };
  const reducer = (state: PickerState, action: PickerAction): PickerState => {
    switch (action.type) {
      case "setCustomData":
        return {
          ...state,
          customWallpaperRefs: action.refs,
          customWallpaperPreviews: action.previews,
        };
      case "removeCustomWallpaper": {
        const nextPreviews = { ...state.customWallpaperPreviews };
        delete nextPreviews[action.ref];
        return {
          ...state,
          customWallpaperRefs: state.customWallpaperRefs.filter(
            (ref) => ref !== action.ref
          ),
          customWallpaperPreviews: nextPreviews,
        };
      }
      case "setSelectedCategory":
        return { ...state, selectedCategory: action.category };
      default:
        return state;
    }
  };
  const [state, dispatch] = useReducer(reducer, initialState);
  const { customWallpaperRefs, customWallpaperPreviews, selectedCategory } =
    state;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manifest, setManifest] = useState<WallpaperManifestType | null>(null);
  useEffect(() => {
    loadWallpaperManifest()
      .then(setManifest)
      .catch((err) => console.error("Failed to load wallpaper manifest", err));
  }, []);

  const tileWallpapers = useMemo(
    () =>
      manifest
        ? (manifest.tiles as string[]).map((p: string) => `/wallpapers/${p}`)
        : [],
    [manifest]
  );
  const videoWallpapers = useMemo(
    () =>
      manifest
        ? (manifest.videos as string[]).map((p: string) => `/wallpapers/${p}`)
        : [],
    [manifest]
  );
  const photoWallpapers = useMemo(() => {
    if (!manifest) return {} as Record<string, string[]>;
    const r: Record<string, string[]> = {};
    for (const [cat, arr] of Object.entries(
      manifest.photos as Record<string, string[]>
    )) {
      r[cat] = arr.map((p: string) => `/wallpapers/${p}`);
    }
    return r;
  }, [manifest]);

  // Pick a stable random preview per category so the Shuffle tile hints at the
  // art it will cycle through. Keyed on the source arrays so it only re-rolls
  // when the manifest (or selected category) changes — not on every render.
  const pickRandom = (arr: string[]): string | undefined =>
    arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
  const randomTileShuffleArt = useMemo(
    () => pickRandom(tileWallpapers),
    [tileWallpapers]
  );
  const randomVideoShuffleArt = useMemo(
    () => pickRandom(videoWallpapers),
    [videoWallpapers]
  );
  const randomPhotoShuffleArt = useMemo(
    () => pickRandom(photoWallpapers[selectedCategory] ?? []),
    [photoWallpapers, selectedCategory]
  );

  // When a category's shuffle is the *active* wallpaper, mirror the concrete
  // asset the desktop currently shows (and rotates every 2 min) so the tile
  // stays in sync. `wallpaperSource` is the live resolved asset; ignore it
  // while it's still an unresolved shuffle:// descriptor.
  const liveShuffleSource = isShuffleWallpaper(wallpaperSource)
    ? undefined
    : wallpaperSource;

  /** Leopard-era photo groups shown together, followed by Patterns and the remaining categories. */
  const MACOS9_PHOTO_ORDER = [
    "aqua",
    "nature",
    "plants",
    "black_and_white",
  ] as const;

  const photoCategoriesLeopardPrefix = useMemo(() => {
    const cats = Object.keys(photoWallpapers).filter(
      (c) => c !== "custom" && c !== "videos"
    );
    return MACOS9_PHOTO_ORDER.filter((c) => cats.includes(c));
  }, [photoWallpapers]);

  const photoCategoriesOther = useMemo(() => {
    const cats = Object.keys(photoWallpapers).filter(
      (c) => c !== "custom" && c !== "videos"
    );
    const mac = new Set<string>([...MACOS9_PHOTO_ORDER]);
    return cats.filter((c) => !mac.has(c)).sort((a, b) => a.localeCompare(b));
  }, [photoWallpapers]);

  // Load custom wallpapers from IndexedDB (just the references)
  useEffect(() => {
    let isActive = true;

    const fetchCustomWallpapers = async () => {
      try {
        const refs = await loadCustomWallpapers();
        if (!isActive) return;

        // Load preview data in parallel
        const previewEntries = await Promise.all(
          refs.map(async (ref) => {
            const data = await getWallpaperData(ref);
            return data ? ([ref, data] as const) : null;
          })
        );

        if (!isActive) return;

        const previews = Object.fromEntries(
          previewEntries.filter(
            (
              entry
            ): entry is readonly [string, string] => entry !== null
          )
        ) as Record<string, string>;

        dispatch({ type: "setCustomData", refs, previews });
      } catch (error) {
        if (!isActive) return;
        console.error("Error fetching custom wallpapers:", error);
      }
    };

    fetchCustomWallpapers();

    return () => {
      isActive = false;
    };
  }, [loadCustomWallpapers, getWallpaperData, INDEXEDDB_PREFIX, customWallpapersRevision]);

  const handleWallpaperSelect = (path: string) => {
    setWallpaper(path);
    playClick();
    if (onSelect) {
      onSelect(path);
    }
  };

  const handleDeleteWallpaper = async (
    e: React.MouseEvent,
    ref: string
  ) => {
    e.stopPropagation();
    playClick();
    await deleteCustomWallpaper(ref);
    dispatch({ type: "removeCustomWallpaper", ref });
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const file = event.target.files[0];
    const isImage = file.type.startsWith("image/");

    if (!isImage) {
      alert(t("apps.control-panels.alerts.selectImageFile"));
      return;
    }

    try {
      // Upload directly using the setWallpaper method which now accepts File objects
      await setWallpaper(file);

      // Refresh the custom wallpapers list
      const refs = await loadCustomWallpapers();

      // Refresh previews in one batch to avoid sequential requests and rerenders
      const previewEntries = await Promise.all(
        refs.map(async (ref) => {
          const data = await getWallpaperData(ref);
          return data ? ([ref, data] as const) : null;
        })
      );

      const previews = Object.fromEntries(
        previewEntries.filter(
          (entry): entry is readonly [string, string] => entry !== null
        )
      ) as Record<string, string>;
      dispatch({ type: "setCustomData", refs, previews });

      // Switch to custom category
      dispatch({ type: "setSelectedCategory", category: "custom" });
    } catch (error) {
      console.error("Error uploading wallpaper:", error);
      alert(t("apps.control-panels.alerts.errorUploadingWallpaper"));
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Force rerender when wallpaper changes
  useEffect(() => {
    dispatch({
      type: "setSelectedCategory",
      category: deriveCategoryFromWallpaper(currentWallpaper),
    });
  }, [currentWallpaper, INDEXEDDB_PREFIX]);

  const formatCategoryLabel = (category: string) => {
    const key = `apps.control-panels.wallpaperCategories.${category}`;
    const translated = t(key);
    if (translated !== key) return translated;
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
              dispatch({
                type: "setSelectedCategory",
                category: value as typeof selectedCategory,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("apps.control-panels.selectACategory")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">{t("apps.control-panels.custom")}</SelectItem>
              <SelectItem value="dynamic">
                {t("apps.control-panels.wallpaperCategories.dynamic")}
              </SelectItem>
              <SelectSeparator
                className="-mx-1 my-1 h-px"
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.15)",
                  border: "none",
                  margin: "4px 0",
                  height: "1px",
                }}
              />
              {photoCategoriesLeopardPrefix.map((category) => (
                <SelectItem key={category} value={category}>
                  {formatCategoryLabel(category)}
                </SelectItem>
              ))}
              {photoCategoriesOther.length > 0 && (
                <SelectSeparator
                  className="-mx-1 my-1 h-px"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.15)",
                    border: "none",
                    margin: "4px 0",
                    height: "1px",
                  }}
                />
              )}
              <SelectItem value="videos">{t("common.menu.videos")}</SelectItem>
              <SelectItem value="tiles">{t("apps.control-panels.patterns")}</SelectItem>
              {photoCategoriesOther.map((category) => (
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
          {selectedCategory === "dynamic" ? (
            <>
              <SpecialTile
                label={t("apps.control-panels.dynamicWallpapers.dayNight")}
                isSelected={isDayNightGradientWallpaper(currentWallpaper)}
                onClick={() =>
                  handleWallpaperSelect(DAY_NIGHT_GRADIENT_WALLPAPER)
                }
                backgroundStyle={{ backgroundImage: dayNightPreview }}
                icon={<Sun className="size-6 text-white" weight="fill" />}
              />
              <SpecialTile
                label={t("apps.control-panels.dynamicWallpapers.nowPlaying")}
                isSelected={isCoverWallpaper(currentWallpaper)}
                onClick={() => handleWallpaperSelect(COVER_WALLPAPER)}
                backgroundStyle={
                  nowPlaying.coverUrl
                    ? {
                        backgroundImage: `url("${nowPlaying.coverUrl}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
                icon={
                  nowPlaying.coverUrl ? null : (
                    <MusicNotes className="size-6 text-white" weight="fill" />
                  )
                }
              />
            </>
          ) : selectedCategory === "tiles" ? (
            <>
              <SpecialTile
                label={t("apps.control-panels.dynamicWallpapers.shuffle")}
                isSelected={currentWallpaper === buildShuffleDescriptor("tiles")}
                onClick={() =>
                  handleWallpaperSelect(buildShuffleDescriptor("tiles"))
                }
                isTile
                scrim
                backgroundStyle={(() => {
                  const active =
                    currentWallpaper === buildShuffleDescriptor("tiles");
                  const art =
                    (active && liveShuffleSource) || randomTileShuffleArt;
                  return art
                    ? {
                        backgroundImage: `url("${art}")`,
                        backgroundSize: "64px 64px",
                        backgroundRepeat: "repeat",
                      }
                    : undefined;
                })()}
                icon={<Shuffle className="size-5 text-white" weight="bold" />}
              />
              {tileWallpapers.map((path) => (
                <WallpaperItem
                  key={path}
                  path={path}
                  isSelected={currentWallpaper === path}
                  onClick={() => handleWallpaperSelect(path)}
                  isTile
                />
              ))}
            </>
          ) : selectedCategory === "videos" ? (
            <>
              <SpecialTile
                label={t("apps.control-panels.dynamicWallpapers.shuffle")}
                isSelected={
                  currentWallpaper === buildShuffleDescriptor("videos")
                }
                onClick={() =>
                  handleWallpaperSelect(buildShuffleDescriptor("videos"))
                }
                scrim
                backgroundVideoUrl={
                  (currentWallpaper === buildShuffleDescriptor("videos") &&
                    liveShuffleSource) ||
                  randomVideoShuffleArt
                }
                icon={<Shuffle className="size-6 text-white" weight="bold" />}
              />
              {videoWallpapers.map((path) => (
                <WallpaperItem
                  key={path}
                  path={path}
                  isSelected={currentWallpaper === path}
                  onClick={() => handleWallpaperSelect(path)}
                  isVideo
                />
              ))}
            </>
          )           : selectedCategory === "custom" ? (
            <>
              <button
                type="button"
                className="preview-button w-full aspect-video !border-[2px] !border-dotted !border-neutral-400 cursor-pointer hover:opacity-90 flex items-center justify-center"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <Plus className="size-5 text-neutral-500" weight="bold" />
              </button>
              {customWallpaperRefs.length > 0 ? (
                customWallpaperRefs.map((path) => (
                  <div key={path} className="relative group">
                    <WallpaperItem
                      path={path}
                      previewUrl={customWallpaperPreviews[path]}
                      isSelected={currentWallpaper === path}
                      onClick={() => handleWallpaperSelect(path)}
                      isVideo={isVideoWallpaper(
                        path,
                        customWallpaperPreviews[path]
                      )}
                    />
                    <button
                      type="button"
                      className="absolute top-1 right-1 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-red-600/80"
                      onClick={(e) => handleDeleteWallpaper(e, path)}
                    >
                      <Trash className="size-3.5" weight="bold" />
                    </button>
                  </div>
                ))
              ) : (
                <></>
              )}
            </>
          ) : photoWallpapers[selectedCategory] ? (
            <>
              <SpecialTile
                label={t("apps.control-panels.dynamicWallpapers.shuffle")}
                isSelected={
                  currentWallpaper ===
                  buildShuffleDescriptor(selectedCategory)
                }
                onClick={() =>
                  handleWallpaperSelect(
                    buildShuffleDescriptor(selectedCategory)
                  )
                }
                scrim
                backgroundStyle={(() => {
                  const active =
                    currentWallpaper ===
                    buildShuffleDescriptor(selectedCategory);
                  const art =
                    (active && liveShuffleSource) || randomPhotoShuffleArt;
                  return art
                    ? {
                        backgroundImage: `url("${art}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined;
                })()}
                icon={<Shuffle className="size-6 text-white" weight="bold" />}
              />
              {photoWallpapers[selectedCategory].map((path) => (
                <WallpaperItem
                  key={path}
                  path={path}
                  isSelected={currentWallpaper === path}
                  onClick={() => handleWallpaperSelect(path)}
                />
              ))}
            </>
          ) : (
            <div className="col-span-4 text-center py-8 text-neutral-500">
              {t("apps.control-panels.noWallpapers")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
