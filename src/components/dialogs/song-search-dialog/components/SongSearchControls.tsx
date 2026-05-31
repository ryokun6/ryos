import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ThemedTabsList,
  ThemedTabsTrigger,
} from "@/components/shared/ThemedTabs";
import type { AppleMusicSearchScope } from "../types";
import type { SongSearchDialogViewModel } from "../hooks/useSongSearchDialog";

type SongSearchControlsProps = Pick<
  SongSearchDialogViewModel,
  | "t"
  | "isMacTheme"
  | "dispatch"
  | "query"
  | "activeAppleMusicTab"
  | "isSearching"
  | "isAdding"
  | "isAppleMusicMode"
  | "isUrl"
  | "handleSearch"
  | "fontStyle"
  | "fontClass"
>;

export function SongSearchControls({
  t,
  isMacTheme,
  dispatch,
  query,
  activeAppleMusicTab,
  isSearching,
  isAdding,
  isAppleMusicMode,
  isUrl,
  handleSearch,
  fontStyle,
  fontClass,
}: SongSearchControlsProps) {
  return (
    <>
      {isAppleMusicMode && (
        <Tabs
          value={activeAppleMusicTab}
          onValueChange={(value) =>
            dispatch({
              type: "setActiveAppleMusicTab",
              tab: value as AppleMusicSearchScope,
            })
          }
          className="w-full"
        >
          <ThemedTabsList className="w-full mb-2">
            <ThemedTabsTrigger value="catalog" className="flex-1">
              {t("apps.ipod.dialogs.appleMusicSearchAppleMusic", "Apple Music")}
            </ThemedTabsTrigger>
            <ThemedTabsTrigger value="library" className="flex-1">
              {t("apps.ipod.dialogs.appleMusicSearchLibrary", "Library")}
            </ThemedTabsTrigger>
          </ThemedTabsList>
        </Tabs>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <Input
          autoFocus
          value={query}
          onChange={(e) =>
            dispatch({ type: "setQuery", query: e.target.value })
          }
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !isSearching && !isAdding) handleSearch();
          }}
          placeholder={
            isAppleMusicMode
              ? t(
                  "apps.ipod.dialogs.appleMusicSearchPlaceholder",
                  "Search Apple Music..."
                )
              : t("apps.ipod.dialogs.songSearchPlaceholder")
          }
          className={cn("shadow-none", fontClass)}
          style={fontStyle}
          disabled={isSearching || isAdding}
        />
        <Button
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={handleSearch}
          disabled={isSearching || isAdding || !query.trim()}
          className={cn("w-full", !isMacTheme && "h-7", fontClass)}
          style={fontStyle}
        >
          {isSearching || isAdding
            ? isUrl && !isAppleMusicMode
              ? t("apps.ipod.dialogs.songSearchAdding")
              : t("apps.ipod.dialogs.songSearchSearching")
            : isUrl && !isAppleMusicMode
              ? t("apps.ipod.dialogs.songSearchAdd")
              : t("apps.ipod.dialogs.songSearchSearch")}
        </Button>
      </div>
    </>
  );
}
