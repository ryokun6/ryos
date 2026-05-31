import { cn } from "@/lib/utils";
import { getPoiVisual, poiVisualGradient } from "../../utils/poiVisuals";
import type { MapsSearchResult } from "./mapsUiState";

export interface MapsSearchResultsPanelProps {
  isMacOSTheme: boolean;
  isDarkMode: boolean;
  isSearching: boolean;
  searchError: string | null;
  searchResults: MapsSearchResult[];
  selectedResultId: string | null;
  onSelectResult: (result: MapsSearchResult) => void;
  noResultsLabel: string;
}

export function MapsSearchResultsPanel({
  isMacOSTheme,
  isDarkMode,
  isSearching,
  searchError,
  searchResults,
  selectedResultId,
  onSelectResult,
  noResultsLabel,
}: MapsSearchResultsPanelProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto min-h-0 w-full min-w-0 overflow-y-auto rounded-[0.4rem] shadow-md",
        "max-h-[min(50vh,24rem)]",
        isMacOSTheme
          ? "maps-place-card-aqua border-transparent text-os-text-primary"
          : "border border-black/40 bg-white/95 backdrop-blur-sm"
      )}
    >
      {/*
       * No "Searching…" row: while a search is in flight we
       * keep showing the previous results (if any) so the
       * dropdown doesn't flicker between "Searching…" and the
       * real results. If there are no prior results yet, the
       * dropdown is empty until the first hit lands.
       */}
      {!isSearching && searchError && (
        <div
          className={cn(
            "px-3 py-2 text-[11px]",
            isMacOSTheme && isDarkMode ? "text-red-300" : "text-red-700"
          )}
        >
          {searchError}
        </div>
      )}
      {!isSearching && !searchError && searchResults.length === 0 && (
        <div className={cn("px-3 py-2 text-[11px] text-os-text-secondary")}>
          {noResultsLabel}
        </div>
      )}
      {searchResults.length > 0 && (
        <ul
          className={cn(
            "divide-y",
            isMacOSTheme && isDarkMode
              ? "divide-[color:var(--os-color-separator)]"
              : "divide-black/10"
          )}
        >
          {searchResults.map((result) => {
            const isSelected = selectedResultId === result.id;
            const visual = getPoiVisual(result.category);
            const Icon = visual.Icon;
            return (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => onSelectResult(result)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-[12px]",
                    isMacOSTheme && isDarkMode
                      ? "hover:bg-white/8"
                      : "hover:bg-black/5",
                    isSelected &&
                      (isMacOSTheme && isDarkMode
                        ? "bg-white/10"
                        : "bg-black/5")
                  )}
                >
                  <div
                    className="aqua-icon-badge flex size-7 shrink-0 items-center justify-center text-white"
                    style={{
                      backgroundImage: poiVisualGradient(visual),
                    }}
                    aria-hidden="true"
                  >
                    <Icon size={17} weight="fill" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-os-text-primary">
                      {result.name}
                    </div>
                    {result.subtitle && (
                      <div className="truncate text-[11px] text-os-text-secondary">
                        {result.subtitle}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
