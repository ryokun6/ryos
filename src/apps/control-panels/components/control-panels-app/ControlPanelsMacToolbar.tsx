import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { osToolbarSurfaceClassName } from "@/components/shared/osThemePrimitives";
import { SearchInput } from "@/components/ui/search-input";
import {
  ToolbarButton,
  ToolbarButtonGroup,
} from "@/components/ui/toolbar-button";
import type { ControlPanelPaneId } from "./controlPanelsCategories";
import type { ControlPanelSearchResult } from "./controlPanelsSearch";

export type ControlPanelsMacToolbarProps = {
  t: (key: string) => string;
  onShowAll: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchResults: ControlPanelSearchResult[];
  /** Navigate to a result's pane (click or Enter). */
  onSelectResult: (paneId: ControlPanelPaneId) => void;
  /** Highlight (spotlight) a result's pane, or clear with null. */
  onFocusResult: (paneId: ControlPanelPaneId | null) => void;
};

export function ControlPanelsMacToolbar({
  t,
  onShowAll,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  searchValue,
  onSearchChange,
  searchResults,
  onSelectResult,
  onFocusResult,
}: ControlPanelsMacToolbarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasQuery = searchValue.trim().length > 0;
  const isMenuOpen = isSearchFocused && hasQuery;

  // Keep the highlighted index in range as results change, and spotlight it.
  useEffect(() => {
    setHighlightedIndex((prev) => {
      if (searchResults.length === 0) return 0;
      return Math.min(prev, searchResults.length - 1);
    });
  }, [searchResults]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const focused = searchResults[highlightedIndex];
    onFocusResult(focused ? focused.paneId : null);
  }, [isMenuOpen, highlightedIndex, searchResults, onFocusResult]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const commitResult = (paneId: ControlPanelPaneId) => {
    onSelectResult(paneId);
    setIsSearchFocused(false);
    onFocusResult(null);
    searchInputRef.current?.blur();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        searchResults.length === 0 ? 0 : (prev + 1) % searchResults.length
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        searchResults.length === 0
          ? 0
          : (prev - 1 + searchResults.length) % searchResults.length
      );
    } else if (e.key === "Enter") {
      const selected = searchResults[highlightedIndex];
      if (selected) {
        e.preventDefault();
        commitResult(selected.paneId);
      }
    } else if (e.key === "Escape") {
      if (hasQuery) {
        e.preventDefault();
        onSearchChange("");
        onFocusResult(null);
      }
    }
  };

  return (
    <div
      className={cn(
        "control-panels-mac-toolbar flex items-stretch gap-2 px-2 py-0 shrink-0",
        osToolbarSurfaceClassName(
          { isMacOSTheme: true, isSystem7Theme: false, isWindowsTheme: false },
          { border: "bottom" }
        )
      )}
    >
      <div className="control-panels-mac-toolbar-nav flex items-center gap-1.5 min-w-0 flex-1">
        <ToolbarButtonGroup>
          <ToolbarButton
            icon
            onClick={onGoBack}
            disabled={!canGoBack}
            aria-label={t("apps.control-panels.toolbar.back")}
            title={t("apps.control-panels.toolbar.back")}
          >
            <CaretLeft size={14} weight="fill" className="scale-x-150 scale-y-90" />
          </ToolbarButton>
          <ToolbarButton
            icon
            onClick={onGoForward}
            disabled={!canGoForward}
            aria-label={t("apps.control-panels.toolbar.forward")}
            title={t("apps.control-panels.toolbar.forward")}
          >
            <CaretRight size={14} weight="fill" className="scale-x-150 scale-y-90" />
          </ToolbarButton>
        </ToolbarButtonGroup>

        <ToolbarButtonGroup>
          <ToolbarButton
            onClick={onShowAll}
            aria-label={t("apps.control-panels.toolbar.showAll")}
            title={t("apps.control-panels.toolbar.showAll")}
          >
            {t("apps.control-panels.toolbar.showAll")}
          </ToolbarButton>
        </ToolbarButtonGroup>
      </div>

      <div className="control-panels-mac-toolbar-search relative flex items-center shrink-0">
        <SearchInput
          inputRef={searchInputRef}
          value={searchValue}
          onChange={onSearchChange}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => {
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
            setIsSearchFocused(true);
          }}
          onBlur={() => {
            // Delay so a click on a result row registers before the menu closes.
            blurTimeoutRef.current = setTimeout(() => {
              setIsSearchFocused(false);
              onFocusResult(null);
            }, 120);
          }}
          width="150px"
          placeholder={t("apps.control-panels.toolbar.search")}
          ariaLabel={t("apps.control-panels.toolbar.search")}
          clearAriaLabel={t("apps.control-panels.toolbar.search")}
        />
        {isMenuOpen && (
          <div
            className="control-panels-search-menu"
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
          >
            {searchResults.length === 0 ? (
              <div className="control-panels-search-empty">
                {t("apps.control-panels.noMatchingPreferences")}
              </div>
            ) : (
              searchResults.map((result, index) => (
                <button
                  key={`${result.paneId}:${result.label}`}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={cn(
                    "control-panels-search-item",
                    index === highlightedIndex && "is-highlighted"
                  )}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => commitResult(result.paneId)}
                >
                  {result.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
