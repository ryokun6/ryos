import { useEffect, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { osToolbarSurfaceClassName } from "@/components/shared/osThemePrimitives";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
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
  /** Theme flags so the toolbar chrome is translated per OS theme. */
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isWindowsTheme: boolean;
  isWin98: boolean;
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
  isMacOSTheme,
  isSystem7Theme,
  isWindowsTheme,
  isWin98,
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

  const backLabel = t("apps.control-panels.toolbar.back");
  const forwardLabel = t("apps.control-panels.toolbar.forward");
  const showAllLabel = t("apps.control-panels.toolbar.showAll");

  // Aqua renders metal-inset toolbar buttons; the classic Mac / Windows themes
  // use the shared ghost/player buttons (matching Finder's legacy toolbar) so
  // the chrome reads native in each OS.
  const renderNavButtons = () => {
    if (isMacOSTheme) {
      return (
        <>
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              onClick={onGoBack}
              disabled={!canGoBack}
              aria-label={backLabel}
              title={backLabel}
            >
              <CaretLeft
                size={14}
                weight="fill"
                className="scale-x-150 scale-y-90"
              />
            </ToolbarButton>
            <ToolbarButton
              icon
              onClick={onGoForward}
              disabled={!canGoForward}
              aria-label={forwardLabel}
              title={forwardLabel}
            >
              <CaretRight
                size={14}
                weight="fill"
                className="scale-x-150 scale-y-90"
              />
            </ToolbarButton>
          </ToolbarButtonGroup>

          <ToolbarButtonGroup>
            <ToolbarButton
              onClick={onShowAll}
              aria-label={showAllLabel}
              title={showAllLabel}
            >
              {showAllLabel}
            </ToolbarButton>
          </ToolbarButtonGroup>
        </>
      );
    }

    // Every non-Aqua theme uses simple flat (ghost) icon buttons for the
    // back/forward nav — System 7 included (no beveled "player" chrome).
    const buttonVariant = "ghost";
    const iconButtonClassName = cn(
      "size-6 px-0",
      isWindowsTheme && "text-black"
    );

    return (
      <>
        <Button
          variant={buttonVariant}
          size="icon"
          className={iconButtonClassName}
          onClick={onGoBack}
          disabled={!canGoBack}
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft size={16} weight="bold" />
        </Button>
        <Button
          variant={buttonVariant}
          size="icon"
          className={iconButtonClassName}
          onClick={onGoForward}
          disabled={!canGoForward}
          aria-label={forwardLabel}
          title={forwardLabel}
        >
          <ArrowRight size={16} weight="bold" />
        </Button>
        <Button
          variant={buttonVariant}
          className={cn(
            "h-6 px-2 text-[11px] font-geneva-12",
            isWindowsTheme && "text-black"
          )}
          onClick={onShowAll}
          aria-label={showAllLabel}
          title={showAllLabel}
        >
          {showAllLabel}
        </Button>
      </>
    );
  };

  return (
    <div
      className={cn(
        "control-panels-mac-toolbar flex items-stretch gap-2 px-2 py-0 shrink-0",
        osToolbarSurfaceClassName(
          {
            isMacOSTheme,
            isSystem7Theme,
            isWindowsTheme,
            isWin98,
          },
          { border: "bottom" }
        )
      )}
    >
      <div className="control-panels-mac-toolbar-nav flex items-center gap-1.5 min-w-0 flex-1">
        {renderNavButtons()}
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
