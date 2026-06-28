import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SongSearchDialogViewModel } from "../hooks/useSongSearchDialog";
import { SongSearchControls } from "./SongSearchControls";
import { SongSearchResultRow } from "./SongSearchResultRow";

type SongSearchDialogBodyProps = SongSearchDialogViewModel;

export function SongSearchDialogBody(vm: SongSearchDialogBodyProps) {
  const {
    t,
    isWindowsTheme,
    isMacTheme,
    dispatch,
    results,
    appleMusicResults,
    selectedIndex,
    isSearching,
    isAdding,
    error,
    isAppleMusicMode,
    handleAddSelected,
    handleSelectAndAdd,
    fontStyle,
    fontClass,
    displayedResults,
    hasResults,
    onOpenChange,
  } = vm;

  return (
    <div
      className={cn(
        isWindowsTheme ? "p-2 px-4" : "p-4 px-6",
        "overflow-hidden w-full box-border"
      )}
    >
      {!isAppleMusicMode && (
        <p className={cn("text-neutral-500 mb-2", fontClass)} style={fontStyle}>
          {t("apps.ipod.dialogs.songSearchDescription")}
        </p>
      )}

      <SongSearchControls {...vm} />

      {error && (
        <p className={cn("text-red-600 mb-2", fontClass)} style={fontStyle}>
          {error}
        </p>
      )}

      {hasResults && (
        <div style={{ marginBottom: "12px" }}>
          <p
            className={cn("text-neutral-500 mb-2", fontClass)}
            style={fontStyle}
          >
            {isAppleMusicMode
              ? t(
                  "apps.ipod.dialogs.appleMusicSearchSelectResult",
                  "Select a song to add:"
                )
              : t("apps.ipod.dialogs.songSearchSelectResult")}
          </p>
          <div
            style={{
              border: "1px solid var(--os-color-input-border)",
              borderRadius: "6px",
              backgroundColor: "var(--os-color-input-bg)",
              height: "280px",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {displayedResults.map((_, index) => (
              <SongSearchResultRow
                key={
                  isAppleMusicMode
                    ? appleMusicResults[index]?.id ?? index
                    : results[index]?.videoId ?? index
                }
                index={index}
                selected={selectedIndex === index}
                isAppleMusicMode={isAppleMusicMode}
                appleMusicResult={
                  isAppleMusicMode ? appleMusicResults[index] : undefined
                }
                youtubeResult={
                  !isAppleMusicMode ? results[index] : undefined
                }
                fontClass={fontClass}
                fontStyle={fontStyle}
                onSelectIndex={(i) =>
                  dispatch({ type: "setSelectedIndex", index: i })
                }
                onSelectAndAdd={handleSelectAndAdd}
              />
            ))}
          </div>
        </div>
      )}

      {hasResults && (
        <DialogFooter className="mt-4 gap-1.5 sm:justify-end">
          <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
            <Button
              variant={isMacTheme ? "secondary" : "retro"}
              onClick={() => onOpenChange(false)}
              disabled={isSearching}
              className={cn("w-full sm:w-auto", !isMacTheme && "h-7", fontClass)}
              style={fontStyle}
            >
              {t("common.dialog.cancel")}
            </Button>
            <Button
              variant={isMacTheme ? "default" : "retro"}
              onClick={() => void handleAddSelected()}
              disabled={isSearching || isAdding || selectedIndex < 0}
              className={cn("w-full sm:w-auto", !isMacTheme && "h-7", fontClass)}
              style={fontStyle}
            >
              {t("apps.ipod.dialogs.songSearchAddSelected")}
            </Button>
          </div>
        </DialogFooter>
      )}
    </div>
  );
}
