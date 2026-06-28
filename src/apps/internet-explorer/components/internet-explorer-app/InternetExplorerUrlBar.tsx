import type { CSSProperties, RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClockCounterClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { checkOfflineAndShowError } from "@/utils/offline";
import type { InternetExplorerSuggestionItem } from "./types";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("InternetExplorer");

export interface InternetExplorerUrlBarProps {
  urlInputRef: RefObject<HTMLInputElement | null>;
  localUrl: string;
  url: string;
  isOffline: boolean;
  isWindowsTheme: boolean;
  currentTheme: string;
  isUrlDropdownOpen: boolean;
  filteredSuggestions: InternetExplorerSuggestionItem[];
  selectedSuggestionIndex: number;
  dropdownStyle: CSSProperties;
  cachedYears: string[];
  isFetchingCachedYears: boolean;
  isSelectingText: boolean;
  setLocalUrl: (value: string) => void;
  setUrl: (value: string) => void;
  setIsUrlDropdownOpen: (open: boolean) => void;
  setIsSelectingText: (selecting: boolean) => void;
  setSelectedSuggestionIndex: (index: number) => void;
  setTimeMachineViewOpen: (open: boolean) => void;
  stripProtocol: (value: string) => string;
  isValidUrl: (value: string) => boolean;
  normalizeUrlInline: (value: string) => string;
  handleFilterSuggestions: (value: string) => void;
  handleNavigate: (navUrl: string, navYear?: string) => void;
  handleNavigateWithHistory: (navUrl: string, navYear?: string) => void;
}

export function InternetExplorerUrlBar({
  urlInputRef,
  localUrl,
  url,
  isOffline,
  isWindowsTheme,
  currentTheme,
  isUrlDropdownOpen,
  filteredSuggestions,
  selectedSuggestionIndex,
  dropdownStyle,
  cachedYears,
  isFetchingCachedYears,
  isSelectingText,
  setLocalUrl,
  setUrl,
  setIsUrlDropdownOpen,
  setIsSelectingText,
  setSelectedSuggestionIndex,
  setTimeMachineViewOpen,
  stripProtocol,
  isValidUrl,
  normalizeUrlInline,
  handleFilterSuggestions,
  handleNavigate,
  handleNavigateWithHistory,
}: InternetExplorerUrlBarProps) {
  const navigateFromSuggestion = (suggestion: InternetExplorerSuggestionItem) => {
    if (suggestion.type === "search") {
      const searchQuery = suggestion.url.substring(5);
      handleNavigateWithHistory(
        `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`,
        "current"
      );
    } else {
      handleNavigateWithHistory(suggestion.url, suggestion.year);
    }
  };

  return (
    <div className="flex-1 relative flex items-center">
      <Input
        ref={urlInputRef}
        value={localUrl}
        disabled={isOffline}
        onChange={(e) => {
          const strippedValue = stripProtocol(e.target.value);
          setLocalUrl(strippedValue);
          handleFilterSuggestions(strippedValue);
          setIsUrlDropdownOpen(true);
        }}
        onKeyDown={(e) => {
          if (isOffline && e.key === "Enter") {
            checkOfflineAndShowError(
              "Internet Explorer requires an internet connection to navigate"
            );
            return;
          }
          if (e.key === "Enter") {
            setIsUrlDropdownOpen(false);
            if (filteredSuggestions.length > 0) {
              navigateFromSuggestion(
                filteredSuggestions[selectedSuggestionIndex]
              );
            } else if (isValidUrl(localUrl)) {
              setUrl(localUrl);
              handleNavigate(localUrl);
            } else {
              setLocalUrl(stripProtocol(url));
            }
          } else if (e.key === "Escape") {
            setIsUrlDropdownOpen(false);
            setLocalUrl(stripProtocol(url));
          } else if (e.key === "ArrowDown" && filteredSuggestions.length > 0) {
            e.preventDefault();
            const nextIndex =
              selectedSuggestionIndex < 0
                ? 0
                : selectedSuggestionIndex === 0
                  ? 1
                  : Math.min(
                      selectedSuggestionIndex + 1,
                      filteredSuggestions.length - 1
                    );
            setSelectedSuggestionIndex(nextIndex);

            const dropdown = document.querySelector("[data-dropdown-content]");
            const items = dropdown?.querySelectorAll("[data-dropdown-item]");
            const targetItem = items?.[nextIndex] as HTMLElement;

            if (targetItem) targetItem.focus();
            else urlInputRef.current?.focus();
          }
        }}
        onBlur={(e) => {
          if (
            !e.relatedTarget ||
            !e.relatedTarget.hasAttribute("data-dropdown-item")
          ) {
            setTimeout(() => setIsUrlDropdownOpen(false), 150);
          }
          setIsSelectingText(false);
        }}
        onFocus={() => {
          if (!isSelectingText) {
            setIsSelectingText(true);
            setTimeout(() => {
              try {
                urlInputRef.current?.select();
              } catch (e) {
                log.debug("Could not select input text", e);
              }
            }, 0);
          }

          handleFilterSuggestions(localUrl);
          setIsUrlDropdownOpen(true);
        }}
        className={`flex-1 pl-2 pr-8 ${
          isWindowsTheme
            ? "!text-[11px]"
            : currentTheme === "macosx"
              ? "!text-[12px] h-[26px]"
              : "!text-[16px]"
        } `}
        style={
          currentTheme === "macosx"
            ? {
                paddingTop: "2px",
                paddingBottom: "2px",
              }
            : undefined
        }
        placeholder="Enter URL"
        spellCheck="false"
        autoComplete="off"
        autoCapitalize="off"
      />
      {isUrlDropdownOpen &&
        filteredSuggestions.length > 0 &&
        (localUrl.trim() === "" ||
          !(
            filteredSuggestions.length === 1 &&
            normalizeUrlInline(filteredSuggestions[0].url) ===
              normalizeUrlInline(localUrl)
          )) && (
          <div
            style={dropdownStyle}
            className="absolute top-full left-0 right-0 mt-[2px] bg-white border border-neutral-300 shadow-md rounded-md z-50 max-h-48 overflow-y-auto font-geneva-12"
            data-dropdown-content
          >
            {(() => {
              const suggestionKeyCounts = new Map<string, number>();
              return filteredSuggestions.map((suggestion, index) => {
                const baseKey = `${suggestion.type}-${suggestion.url}-${suggestion.year || "current"}-${suggestion.title}`;
                const count = (suggestionKeyCounts.get(baseKey) ?? 0) + 1;
                suggestionKeyCounts.set(baseKey, count);
                const suggestionKey = `${baseKey}-${count}`;
                return (
                  <div
                    key={suggestionKey}
                    className="px-2 py-1.5 hover:bg-neutral-100 focus:bg-neutral-200 cursor-pointer flex items-center gap-2 text-sm outline-none"
                    onClick={() => {
                      setSelectedSuggestionIndex(index);
                      navigateFromSuggestion(suggestion);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        navigateFromSuggestion(suggestion);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        const nextItem = e.currentTarget
                          .nextElementSibling as HTMLElement;
                        if (nextItem) {
                          setSelectedSuggestionIndex(index + 1);
                          nextItem.focus();
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        const prevItem = e.currentTarget
                          .previousElementSibling as HTMLElement;
                        if (prevItem) {
                          setSelectedSuggestionIndex(index - 1);
                          prevItem.focus();
                        } else urlInputRef.current?.focus();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsUrlDropdownOpen(false);
                        urlInputRef.current?.focus();
                      }
                    }}
                    onFocus={() => {
                      setIsUrlDropdownOpen(true);
                      setSelectedSuggestionIndex(index);
                    }}
                    tabIndex={0}
                    data-dropdown-item
                  >
                    {suggestion.type === "search" ? (
                      <MagnifyingGlass
                        className="size-4 text-neutral-400"
                        weight="bold"
                      />
                    ) : suggestion.favicon && !isOffline ? (
                      <img
                        src={suggestion.favicon}
                        alt=""
                        className="size-4"
                        onError={(e) => {
                          e.currentTarget.src = "/icons/default/ie-site.png";
                        }}
                      />
                    ) : (
                      <ThemedIcon
                        name="ie-site.png"
                        alt=""
                        className="size-4 [image-rendering:pixelated]"
                      />
                    )}
                    <div className="flex-1 truncate">
                      <div className="font-medium font-geneva-12 text-[11px]">
                        {suggestion.title}
                        {suggestion.year && suggestion.year !== "current" && (
                          <span className="font-normal text-neutral-500 ml-1">
                            ({suggestion.year})
                          </span>
                        )}
                      </div>
                      <div className="font-geneva-12 text-[10px] text-neutral-500 truncate">
                        {suggestion.type === "search"
                          ? "bing.com"
                          : stripProtocol(suggestion.url)}
                      </div>
                    </div>
                    <div className="font-geneva-12 text-[10px] ml-2 text-neutral-500 whitespace-nowrap hidden sm:block">
                      {suggestion.type === "favorite" && "Favorite"}
                      {suggestion.type === "history" && "History"}
                      {suggestion.type === "search" && "Search"}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTimeMachineViewOpen(true)}
            disabled={isFetchingCachedYears || cachedYears.length <= 1}
            className={`size-7 absolute right-1 top-1/2 -translate-y-1/2 focus-visible:ring-0 focus-visible:ring-offset-0 ${
              cachedYears.length > 1 ? "" : "opacity-50 cursor-not-allowed"
            }`}
            aria-label="Show cached versions (Time Machine)"
            style={{
              pointerEvents: cachedYears.length <= 1 ? "none" : "auto",
            }}
          >
            <ClockCounterClockwise
              className={`size-4 ${
                cachedYears.length > 1
                  ? "text-orange-500"
                  : "text-neutral-400"
              }`}
              weight="bold"
            />
          </Button>
        </TooltipTrigger>
        {cachedYears.length > 1 && (
          <TooltipContent side="bottom">
            <p>
              {cachedYears.length} Time Node
              {cachedYears.length !== 1 ? "s" : ""}
            </p>
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}
