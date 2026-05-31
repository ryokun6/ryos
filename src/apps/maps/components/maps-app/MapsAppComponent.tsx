import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { cn } from "@/lib/utils";
import type { AppProps } from "@/apps/base/types";
import { appMetadata } from "../..";
import { MapsMenuBar } from "../MapsMenuBar";
import { MapsPlacesDrawer } from "../MapsPlacesDrawer";
import { MapsPlaceCard } from "../MapsPlaceCard";
import type { SavedPlace } from "../../utils/types";
import { MAPS_ANALYTICS, track } from "@/utils/analytics";
import { MapsMapBottomChrome } from "./MapsMapBottomChrome";
import { MapsMapStatusOverlay } from "./MapsMapStatusOverlay";
import { MapsSearchResultsPanel } from "./MapsSearchResultsPanel";
import { useMapsAppController } from "./useMapsAppController";

export function MapsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOSTheme,
    isDarkMode,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    mapType,
    setMapType,
    hasToken,
    attachMapSurfaceRef,
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    selectedResultId,
    isShowingResults,
    isPlacesDrawerOpen,
    dispatchUi,
    homePlace,
    workPlace,
    favoritePlaces,
    recentPlaces,
    selectedPlace,
    setHomePlace,
    setWorkPlace,
    handleSelectResult,
    handleSelectSavedPlace,
    handleToggleFavorite,
    handleOpenPlaceDirections,
    handleClosePlaceCard,
    isPlaceFavorite,
    handleZoomIn,
    handleZoomOut,
    handleLocateMe,
    handleSearchKeyDown,
    canUseMap,
    overlayMessage,
  } = useMapsAppController({ isWindowOpen });

  const menuBar = (
    <MapsMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onLocateMe={handleLocateMe}
      mapType={mapType}
      onSetMapType={setMapType}
      canUseMap={canUseMap}
    />
  );

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: t("apps.maps.title", { defaultValue: "Maps" }),
        onClose,
        isForeground,
        appId: "maps",
        material: "notitlebar",
        skipInitialSound,
        instanceId,
        drawer: (
          <MapsPlacesDrawer
            isOpen={isPlacesDrawerOpen}
            onClose={() =>
              dispatchUi({ type: "setPlacesDrawerOpen", isOpen: false })
            }
            home={homePlace}
            work={workPlace}
            favorites={favoritePlaces}
            recents={recentPlaces}
            onSelectPlace={handleSelectSavedPlace}
            t={t}
          />
        ),
      }}
      trailing={
        <AppHelpAboutDialogs
          appId="maps"
          helpItems={translatedHelpItems}
          metadata={appMetadata}
          isHelpOpen={isHelpDialogOpen}
          onHelpOpenChange={setIsHelpDialogOpen}
          isAboutOpen={isAboutDialogOpen}
          onAboutOpenChange={setIsAboutDialogOpen}
        />
      }
    >
        <div className="relative size-full min-h-0 flex-1 overflow-hidden bg-transparent font-os-ui">
          <div
            ref={attachMapSurfaceRef}
            className={cn(
              "absolute inset-0",
              isDarkMode ? "bg-[#1c1c1e]" : "bg-[#e5e3df]"
            )}
            role="application"
            aria-label={t("apps.maps.mapAriaLabel", {
              defaultValue: "Map",
            })}
          />

          {overlayMessage && (
            <MapsMapStatusOverlay
              isDarkMode={isDarkMode}
              title={t("apps.maps.title", { defaultValue: "Maps" })}
              message={overlayMessage}
              showTokenHint={!hasToken}
              tokenHint={t("apps.maps.status.tokenHint", {
                defaultValue:
                  "The server signs short-lived MapKit tokens automatically once credentials are configured.",
              })}
            />
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[min(85%,100%)] min-h-0 w-full flex-col items-start justify-end gap-1.5 p-1.5">
            {isShowingResults && (
              <MapsSearchResultsPanel
                isMacOSTheme={isMacOSTheme}
                isDarkMode={isDarkMode}
                isSearching={isSearching}
                searchError={searchError}
                searchResults={searchResults}
                selectedResultId={selectedResultId}
                onSelectResult={handleSelectResult}
                noResultsLabel={t("apps.maps.noResults", {
                  defaultValue: "No results",
                })}
              />
            )}

            <MapsPlaceCard
              place={selectedPlace}
              isFavorite={
                selectedPlace ? isPlaceFavorite(selectedPlace.id) : false
              }
              isHome={
                !!selectedPlace &&
                !!homePlace &&
                homePlace.id === selectedPlace.id
              }
              isWork={
                !!selectedPlace &&
                !!workPlace &&
                workPlace.id === selectedPlace.id
              }
              savedHomePlace={homePlace}
              savedWorkPlace={workPlace}
              onSetHome={(p: SavedPlace) => {
                track(MAPS_ANALYTICS.HOME_WORK_SET, {
                  appId: "maps",
                  kind: "home",
                  category: p.category || "unknown",
                });
                setHomePlace(p);
              }}
              onSetWork={(p: SavedPlace) => {
                track(MAPS_ANALYTICS.HOME_WORK_SET, {
                  appId: "maps",
                  kind: "work",
                  category: p.category || "unknown",
                });
                setWorkPlace(p);
              }}
              onToggleFavorite={handleToggleFavorite}
              onDirections={handleOpenPlaceDirections}
              onClose={handleClosePlaceCard}
            />

            <MapsMapBottomChrome
              isMacOSTheme={isMacOSTheme}
              searchQuery={searchQuery}
              onSearchQueryChange={(value) => {
                dispatchUi({ type: "setSearchQuery", query: value });
                if (!value) {
                  dispatchUi({ type: "searchReset" });
                }
              }}
              onSearchKeyDown={handleSearchKeyDown}
              searchPlaceholder={t("apps.maps.searchPlaceholder", {
                defaultValue: "Search Maps",
              })}
              searchAriaLabel={t("apps.maps.searchPlaceholder", {
                defaultValue: "Search Maps",
              })}
              mapToolbarAriaLabel={t("apps.maps.mapToolbar", {
                defaultValue: "Map controls",
              })}
              zoomOutTitle={t("apps.maps.zoomOut", { defaultValue: "Zoom out" })}
              zoomInTitle={t("apps.maps.zoomIn", { defaultValue: "Zoom in" })}
              locateMeTitle={t("apps.maps.menu.locateMe", {
                defaultValue: "Locate Me",
              })}
              placesTitle={t("apps.maps.places.title", {
                defaultValue: "Places",
              })}
              canUseMap={canUseMap}
              isPlacesDrawerOpen={isPlacesDrawerOpen}
              onZoomOut={handleZoomOut}
              onZoomIn={handleZoomIn}
              onLocateMe={handleLocateMe}
              onTogglePlacesDrawer={() =>
                dispatchUi({ type: "togglePlacesDrawer" })
              }
            />
          </div>
        </div>
    </AppWindowShell>
  );
}
