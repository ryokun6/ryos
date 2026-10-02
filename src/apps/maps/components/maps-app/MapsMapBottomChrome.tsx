import {
  GpsFix,
  MapPin,
  Minus,
  NavigationArrow,
  Plus,
} from "@phosphor-icons/react";
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
  locateMePressed?: boolean;
  /** Locate Me is on but the user panned away; offers a one-tap resume. */
  showRecenter?: boolean;
  recenterTitle: string;
  placesTitle: string;
  canUseMap: boolean;
  isPlacesDrawerOpen: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onLocateMe: () => void;
  onRecenter: () => void;
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
  locateMePressed = false,
  showRecenter = false,
  recenterTitle,
  placesTitle,
  canUseMap,
  isPlacesDrawerOpen,
  onZoomOut,
  onZoomIn,
  onLocateMe,
  onRecenter,
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
        {showRecenter ? (
          <Button
            type="button"
            variant={isMacOSTheme ? "aqua" : "retro"}
            size="sm"
            onClick={onRecenter}
            disabled={!canUseMap}
            title={recenterTitle}
            aria-label={recenterTitle}
            className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
          >
            <GpsFix size={12} weight="bold" className="text-os-link" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant={isMacOSTheme ? "aqua" : "retro"}
          size="sm"
          onClick={onLocateMe}
          disabled={!canUseMap}
          title={locateMeTitle}
          aria-label={locateMeTitle}
          aria-pressed={locateMePressed}
          className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
        >
          <NavigationArrow
            size={12}
            weight={locateMePressed && showRecenter ? "bold" : "fill"}
            className={locateMePressed ? "text-os-link" : undefined}
          />
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
