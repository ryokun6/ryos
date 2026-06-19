import type { CSSProperties, RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowLeft, ArrowRight, Export } from "@phosphor-icons/react";
import type { Favorite } from "@/stores/useInternetExplorerStore";
import { InternetExplorerUrlBar } from "./InternetExplorerUrlBar";
import { InternetExplorerFavoritesBar } from "./InternetExplorerFavoritesBar";
import type { InternetExplorerSuggestionItem } from "./types";

export interface InternetExplorerToolbarProps {
  isWindowsTheme: boolean;
  currentTheme: string;
  isOffline: boolean;
  historyIndex: number;
  historyLength: number;
  url: string;
  year: string;
  pastYears: string[];
  futureYears: string[];
  favorites: Favorite[];
  hasMoreToScroll: boolean;
  urlInputRef: RefObject<HTMLInputElement | null>;
  favoritesContainerRef: RefObject<HTMLDivElement | null>;
  localUrl: string;
  isUrlDropdownOpen: boolean;
  filteredSuggestions: InternetExplorerSuggestionItem[];
  selectedSuggestionIndex: number;
  dropdownStyle: CSSProperties;
  cachedYears: string[];
  isFetchingCachedYears: boolean;
  isSelectingText: boolean;
  t: (key: string) => string;
  setLocalUrl: (value: string) => void;
  setUrl: (value: string) => void;
  setIsUrlDropdownOpen: (open: boolean) => void;
  setIsSelectingText: (selecting: boolean) => void;
  setSelectedSuggestionIndex: (index: number) => void;
  setTimeMachineViewOpen: (open: boolean) => void;
  stripProtocol: (value: string) => string;
  isValidUrl: (value: string) => boolean;
  normalizeUrlInline: (value: string) => string;
  normalizeUrlForHistory: (url: string) => string;
  handleFilterSuggestions: (value: string) => void;
  handleNavigate: (navUrl: string, navYear?: string) => void;
  handleNavigateWithHistory: (navUrl: string, navYear?: string) => void;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleSharePage: () => void;
}

export function InternetExplorerToolbar({
  isWindowsTheme,
  currentTheme,
  isOffline,
  historyIndex,
  historyLength,
  url,
  year,
  pastYears,
  futureYears,
  favorites,
  hasMoreToScroll,
  urlInputRef,
  favoritesContainerRef,
  localUrl,
  isUrlDropdownOpen,
  filteredSuggestions,
  selectedSuggestionIndex,
  dropdownStyle,
  cachedYears,
  isFetchingCachedYears,
  isSelectingText,
  t,
  setLocalUrl,
  setUrl,
  setIsUrlDropdownOpen,
  setIsSelectingText,
  setSelectedSuggestionIndex,
  setTimeMachineViewOpen,
  stripProtocol,
  isValidUrl,
  normalizeUrlInline,
  normalizeUrlForHistory,
  handleFilterSuggestions,
  handleNavigate,
  handleNavigateWithHistory,
  handleGoBack,
  handleGoForward,
  handleSharePage,
}: InternetExplorerToolbarProps) {
  return (
    <div
      className={`flex flex-col gap-1 p-1 ${
        isWindowsTheme
          ? "bg-transparent border-b border-[#919b9c]"
          : currentTheme === "macosx"
            ? "bg-transparent"
            : currentTheme === "system7"
              ? "bg-neutral-100 border-b border-black"
              : "bg-neutral-100 border-b border-neutral-300"
      }`}
      style={{
        borderBottom:
          currentTheme === "macosx"
            ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
            : undefined,
      }}
    >
      <div className="flex gap-2 items-center">
        <div className="flex gap-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoBack}
            disabled={isOffline || historyIndex >= historyLength - 1}
            className="size-8"
          >
            <ArrowLeft size={14} weight="bold" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoForward}
            disabled={isOffline || historyIndex <= 0}
            className="size-8"
          >
            <ArrowRight size={14} weight="bold" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSharePage}
                className="size-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="Share this page"
              >
                <Export size={14} weight="bold" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Share this page</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <InternetExplorerUrlBar
          urlInputRef={urlInputRef}
          localUrl={localUrl}
          url={url}
          isOffline={isOffline}
          isWindowsTheme={isWindowsTheme}
          currentTheme={currentTheme}
          isUrlDropdownOpen={isUrlDropdownOpen}
          filteredSuggestions={filteredSuggestions}
          selectedSuggestionIndex={selectedSuggestionIndex}
          dropdownStyle={dropdownStyle}
          cachedYears={cachedYears}
          isFetchingCachedYears={isFetchingCachedYears}
          isSelectingText={isSelectingText}
          setLocalUrl={setLocalUrl}
          setUrl={setUrl}
          setIsUrlDropdownOpen={setIsUrlDropdownOpen}
          setIsSelectingText={setIsSelectingText}
          setSelectedSuggestionIndex={setSelectedSuggestionIndex}
          setTimeMachineViewOpen={setTimeMachineViewOpen}
          stripProtocol={stripProtocol}
          isValidUrl={isValidUrl}
          normalizeUrlInline={normalizeUrlInline}
          handleFilterSuggestions={handleFilterSuggestions}
          handleNavigate={handleNavigate}
          handleNavigateWithHistory={handleNavigateWithHistory}
        />
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={(newYear) => handleNavigate(url, newYear)}>
            <SelectTrigger
              className={
                isWindowsTheme
                  ? "!text-[11px]"
                  : currentTheme === "macosx"
                    ? "!text-[12px]"
                    : "!text-[16px]"
              }
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="px-0">
              {futureYears.map((y) => (
                <SelectItem
                  key={y}
                  value={y}
                  className="text-md h-6 px-3 active:bg-os-selection-bg active:text-os-selection-text text-os-link"
                >
                  {y}
                </SelectItem>
              ))}
              <SelectItem
                value="current"
                className="text-md h-6 px-3 active:bg-os-selection-bg active:text-os-selection-text"
              >
                {t("apps.internet-explorer.now")}
              </SelectItem>
              {pastYears.map((y) => (
                <SelectItem
                  key={y}
                  value={y}
                  className={`text-md h-6 px-3 active:bg-os-selection-bg active:text-os-selection-text ${
                    parseInt(y) <= 1995 ? "text-os-link" : ""
                  }`}
                >
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <InternetExplorerFavoritesBar
        favorites={favorites}
        hasMoreToScroll={hasMoreToScroll}
        favoritesContainerRef={favoritesContainerRef}
        isOffline={isOffline}
        normalizeUrlForHistory={normalizeUrlForHistory}
        handleNavigateWithHistory={handleNavigateWithHistory}
      />
    </div>
  );
}
