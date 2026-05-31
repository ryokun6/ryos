import { MapPin, Minus, NavigationArrow, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";

export interface MapsMapBottomChromeProps {
  isMacOSTheme: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  mapToolbarAriaLabel: string;
  zoomOutTitle: string;
  zoomInTitle: string;
  locateMeTitle: string;
  placesTitle: string;
  canUseMap: boolean;
  isPlacesDrawerOpen: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onLocateMe: () => void;
  onTogglePlacesDrawer: () => void;
}

export function MapsMapBottomChrome({
  isMacOSTheme,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  searchPlaceholder,
  searchAriaLabel,
  mapToolbarAriaLabel,
  zoomOutTitle,
  zoomInTitle,
  locateMeTitle,
  placesTitle,
  canUseMap,
  isPlacesDrawerOpen,
  onZoomOut,
  onZoomIn,
  onLocateMe,
  onTogglePlacesDrawer,
}: MapsMapBottomChromeProps) {
  return (
    <div className="pointer-events-auto flex w-full min-w-0 items-center gap-2 bg-transparent">
      <SearchInput
        value={searchQuery}
        onChange={onSearchQueryChange}
        onKeyDown={onSearchKeyDown}
        placeholder={searchPlaceholder}
        ariaLabel={searchAriaLabel}
        className="min-w-0 flex-1"
      />
      <div
        className="flex shrink-0 items-center gap-2"
        role="toolbar"
        aria-label={mapToolbarAriaLabel}
      >
        <Button
          type="button"
          variant={isMacOSTheme ? "aqua" : "retro"}
          size="sm"
          onClick={onZoomOut}
          disabled={!canUseMap}
          title={zoomOutTitle}
          aria-label={zoomOutTitle}
          className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
        >
          <Minus size={12} weight="bold" />
        </Button>
        <Button
          type="button"
          variant={isMacOSTheme ? "aqua" : "retro"}
          size="sm"
          onClick={onZoomIn}
          disabled={!canUseMap}
          title={zoomInTitle}
          aria-label={zoomInTitle}
          className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
        >
          <Plus size={12} weight="bold" />
        </Button>
        <Button
          type="button"
          variant={isMacOSTheme ? "aqua" : "retro"}
          size="sm"
          onClick={onLocateMe}
          disabled={!canUseMap}
          title={locateMeTitle}
          aria-label={locateMeTitle}
          className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
        >
          <NavigationArrow size={12} weight="fill" />
        </Button>
        <Button
          type="button"
          variant={isMacOSTheme ? "aqua" : "retro"}
          size="sm"
          onClick={onTogglePlacesDrawer}
          aria-pressed={isPlacesDrawerOpen}
          title={placesTitle}
          aria-label={placesTitle}
          className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
        >
          <MapPin size={12} weight="fill" />
        </Button>
      </div>
    </div>
  );
}
