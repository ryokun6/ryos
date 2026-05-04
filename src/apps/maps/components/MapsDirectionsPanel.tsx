import { CaretRight, X } from "@phosphor-icons/react";
import { motion, AnimatePresence, type Transition } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import {
  AQUA_ICON_BUTTON_PADDING_CLASS,
} from "@/lib/aquaIconButton";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { getPoiVisual, poiVisualGradient } from "../utils/poiVisuals";
import type { SavedPlace } from "../utils/types";
import type {
  MapsDirectionsRoutePayload,
  MapsDirectionsTransportType,
} from "../utils/mapsDirectionsApi";

const PANEL_TRANSITION: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 30,
  mass: 0.7,
};

function formatDistanceMeters(
  meters: number,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters >= 1000) {
    const km = meters / 1000;
    return t("apps.maps.directions.distanceKm", {
      value: km >= 10 ? km.toFixed(0) : km.toFixed(1),
      defaultValue: "{{value}} km",
    });
  }
  return t("apps.maps.directions.distanceM", {
    value: Math.round(meters),
    defaultValue: "{{value}} m",
  });
}

function formatDuration(
  seconds: number,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds / 60);
  if (total < 1) {
    return t("apps.maps.directions.durationUnderMinute", {
      defaultValue: "< 1 min",
    });
  }
  return t("apps.maps.directions.durationMinutes", {
    count: total,
    defaultValue_one: "{{count}} min",
    defaultValue_other: "{{count}} mins",
  });
}

function transportLabel(
  mode: MapsDirectionsTransportType,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  switch (mode) {
    case "WALKING":
      return t("apps.maps.directions.mode.walking", { defaultValue: "Walking" });
    case "TRANSIT":
      return t("apps.maps.directions.mode.transit", { defaultValue: "Transit" });
    case "CYCLING":
      return t("apps.maps.directions.mode.cycling", { defaultValue: "Cycling" });
    case "AUTOMOBILE":
    default:
      return t("apps.maps.directions.mode.driving", { defaultValue: "Driving" });
  }
}

export interface DirectionsStartResultRow {
  id: string;
  name: string;
  subtitle: string;
  category?: string;
  latitude: number;
  longitude: number;
}

export interface MapsDirectionsPanelProps {
  destination: SavedPlace;
  transportType: MapsDirectionsTransportType;
  onTransportTypeChange: (mode: MapsDirectionsTransportType) => void;
  startMode: "current" | "custom";
  onStartModeChange: (mode: "current" | "custom") => void;
  userLocationReady: boolean;
  userLocationHint: string;
  customStartQuery: string;
  onCustomStartQueryChange: (q: string) => void;
  customStartResults: DirectionsStartResultRow[];
  selectedCustomStartId: string | null;
  onSelectCustomStart: (row: DirectionsStartResultRow) => void;
  isSearchingCustomStart: boolean;
  customStartSearchError: string | null;
  route: MapsDirectionsRoutePayload | null;
  routeAttempted: boolean;
  routeAvailable: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onFetchRoute: () => void;
  onOpenHandoff: () => void;
}

const TRANSPORT_MODES: MapsDirectionsTransportType[] = [
  "AUTOMOBILE",
  "WALKING",
  "TRANSIT",
  "CYCLING",
];

export function MapsDirectionsPanel({
  destination,
  transportType,
  onTransportTypeChange,
  startMode,
  onStartModeChange,
  userLocationReady,
  userLocationHint,
  customStartQuery,
  onCustomStartQueryChange,
  customStartResults,
  selectedCustomStartId,
  onSelectCustomStart,
  isSearchingCustomStart,
  customStartSearchError,
  route,
  routeAttempted,
  routeAvailable,
  loading,
  error,
  onClose,
  onFetchRoute,
  onOpenHandoff,
}: MapsDirectionsPanelProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isXpTheme, isSystem7Theme } = useThemeFlags();
  const variant = isMacOSTheme ? "aqua" : "retro";

  const destLine =
    destination.subtitle && destination.subtitle.trim().length > 0
      ? destination.subtitle
      : t("apps.maps.directions.destinationCoords", {
          defaultValue: "{{lat}}, {{lng}}",
          lat: destination.latitude.toFixed(4),
          lng: destination.longitude.toFixed(4),
        });

  const canFetch =
    startMode === "current"
      ? userLocationReady
      : Boolean(selectedCustomStartId && customStartQuery.trim().length > 0);

  return (
    <AnimatePresence>
      <motion.div
        key="directions-panel"
        role="region"
        aria-label={t("apps.maps.directions.regionLabel", {
          defaultValue: "Directions",
        })}
        className="pointer-events-auto relative w-full min-w-0 select-none"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={PANEL_TRANSITION}
      >
        <div
          className={cn(
            "flex max-h-[min(52vh,22rem)] flex-col gap-2 p-3",
            isMacOSTheme &&
              "maps-place-card-aqua rounded-[0.5rem] text-black",
            !isMacOSTheme &&
              isSystem7Theme &&
              "rounded border-2 border-black bg-white text-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]",
            !isMacOSTheme &&
              !isSystem7Theme &&
              isXpTheme &&
              "rounded-[0.4rem] border-2 border-[#0054E3] bg-[#ECE9D8] text-black shadow-md",
            !isMacOSTheme &&
              !isSystem7Theme &&
              !isXpTheme &&
              "rounded border border-black/30 bg-white text-black shadow-md"
          )}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-black/50">
                {t("apps.maps.directions.title", { defaultValue: "Directions" })}
              </div>
              <div className="truncate text-[13px] font-semibold leading-tight text-black">
                {destination.name}
              </div>
              <div className="line-clamp-2 text-[11px] leading-snug text-black/60">
                {destLine}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "shrink-0 -mr-0.5 -mt-0.5 flex h-6 w-6 items-center justify-center rounded-full",
                "text-black/55 hover:bg-black/10 hover:text-black/85",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-black/30"
              )}
              aria-label={t("apps.maps.directions.close", {
                defaultValue: "Close directions",
              })}
            >
              <X size={12} weight="bold" />
            </button>
          </div>

          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label={t("apps.maps.directions.travelModeGroup", {
              defaultValue: "Travel mode",
            })}
          >
            {TRANSPORT_MODES.map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={variant}
                size="sm"
                aria-pressed={transportType === mode}
                onClick={() => onTransportTypeChange(mode)}
                className={cn(
                  "!h-7 !min-h-0 !px-2 !py-0 text-[11px]",
                  transportType === mode && "!ring-1 !ring-black/35"
                )}
              >
                {transportLabel(mode, t)}
              </Button>
            ))}
          </div>

          <fieldset className="space-y-1.5 border-0 p-0">
            <legend className="sr-only">
              {t("apps.maps.directions.startLabel", { defaultValue: "Start" })}
            </legend>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="maps-dir-start"
                  className="accent-black"
                  checked={startMode === "current"}
                  onChange={() => onStartModeChange("current")}
                />
                <span>
                  {t("apps.maps.directions.startCurrent", {
                    defaultValue: "Current location",
                  })}
                </span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="maps-dir-start"
                  className="accent-black"
                  checked={startMode === "custom"}
                  onChange={() => onStartModeChange("custom")}
                />
                <span>
                  {t("apps.maps.directions.startCustom", {
                    defaultValue: "Start from…",
                  })}
                </span>
              </label>
            </div>
            {startMode === "current" && (
              <p
                className={cn(
                  "text-[11px] leading-snug",
                  userLocationReady ? "text-black/55" : "text-amber-800"
                )}
              >
                {userLocationHint}
              </p>
            )}
            {startMode === "custom" && (
              <div className="space-y-1">
                <SearchInput
                  value={customStartQuery}
                  onChange={onCustomStartQueryChange}
                  placeholder={t("apps.maps.directions.startSearchPlaceholder", {
                    defaultValue: "Search for a start place",
                  })}
                  ariaLabel={t("apps.maps.directions.startSearchPlaceholder", {
                    defaultValue: "Search for a start place",
                  })}
                  className="w-full"
                />
                {customStartSearchError && (
                  <div className="text-[11px] text-red-700">{customStartSearchError}</div>
                )}
                <div
                  className={cn(
                    "max-h-[9rem] overflow-y-auto rounded border border-black/15",
                    customStartResults.length === 0 &&
                      !isSearchingCustomStart &&
                      !customStartSearchError &&
                      customStartQuery.trim().length >= 2 &&
                      "p-2 text-[11px] text-black/45"
                  )}
                >
                  {isSearchingCustomStart &&
                    customStartQuery.trim().length >= 2 && (
                      <div className="p-2 text-[11px] text-black/50">
                        {t("apps.maps.directions.startSearching", {
                          defaultValue: "Searching…",
                        })}
                      </div>
                    )}
                  {customStartResults.length === 0 &&
                    !isSearchingCustomStart &&
                    !customStartSearchError &&
                    customStartQuery.trim().length >= 2 && (
                      <span>
                        {t("apps.maps.directions.startNoResults", {
                          defaultValue: "No matches — try another query.",
                        })}
                      </span>
                    )}
                  {customStartResults.length > 0 && (
                    <ul className="divide-y divide-black/10">
                      {customStartResults.map((row) => {
                        const visual = getPoiVisual(row.category);
                        const Icon = visual.Icon;
                        const selected = selectedCustomStartId === row.id;
                        return (
                          <li key={row.id}>
                            <button
                              type="button"
                              onClick={() => onSelectCustomStart(row)}
                              className={cn(
                                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px]",
                                "hover:bg-black/5",
                                selected && "bg-black/5"
                              )}
                            >
                              <div
                                className="aqua-icon-badge flex h-6 w-6 shrink-0 items-center justify-center text-white"
                                style={{
                                  backgroundImage: poiVisualGradient(visual),
                                }}
                                aria-hidden
                              >
                                <Icon size={14} weight="fill" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-black">
                                  {row.name}
                                </div>
                                {row.subtitle && (
                                  <div className="truncate text-black/55">
                                    {row.subtitle}
                                  </div>
                                )}
                              </div>
                              <CaretRight
                                className="shrink-0 text-black/35"
                                size={14}
                                weight="bold"
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant={variant}
              size="sm"
              disabled={!canFetch || loading}
              onClick={onFetchRoute}
              className={AQUA_ICON_BUTTON_PADDING_CLASS}
            >
              <span>
                {loading
                  ? t("apps.maps.directions.loadingRoute", {
                      defaultValue: "Getting route…",
                    })
                  : t("apps.maps.directions.getRoute", {
                      defaultValue: "Get route",
                    })}
              </span>
            </Button>
            <Button
              type="button"
              variant={variant}
              size="sm"
              onClick={onOpenHandoff}
              className={AQUA_ICON_BUTTON_PADDING_CLASS}
              title={t("apps.maps.directions.handoffTitle", {
                defaultValue: "Open in Apple Maps",
              })}
            >
              <span>
                {t("apps.maps.directions.openAppleMaps", {
                  defaultValue: "Open in Maps…",
                })}
              </span>
            </Button>
          </div>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-900">
              {error}
            </div>
          )}

          {routeAttempted && !loading && !error && !routeAvailable && (
            <div className="rounded border border-black/15 bg-black/[0.03] px-2 py-1.5 text-[11px] text-black/75">
              {t("apps.maps.directions.noRouteDetail", {
                defaultValue:
                  "Apple Maps couldn’t build a turn-by-turn route for this trip in ryOS. Check start and destination, try another travel mode, or open Maps for full routing.",
              })}
            </div>
          )}

          {route && routeAttempted && routeAvailable && (
            <div className="min-h-0 space-y-1.5 border-t border-black/10 pt-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-black/80">
                <span className="font-medium text-black">
                  {transportLabel(
                    (route.transportType as MapsDirectionsTransportType) ||
                      transportType,
                    t
                  )}
                </span>
                <span>
                  {t("apps.maps.directions.eta", {
                    defaultValue: "~{{time}}",
                    time: formatDuration(route.durationSeconds, t),
                  })}
                </span>
                <span>{formatDistanceMeters(route.distanceMeters, t)}</span>
                {route.hasTolls && (
                  <span className="text-amber-900">
                    {t("apps.maps.directions.tolls", {
                      defaultValue: "Tolls possible",
                    })}
                  </span>
                )}
              </div>
              {route.name && (
                <div className="text-[11px] text-black/55">
                  {t("apps.maps.directions.via", {
                    defaultValue: "Via {{name}}",
                    name: route.name,
                  })}
                </div>
              )}
              {route.steps.filter((s) => s.instructions?.trim()).length > 0 ? (
                <ol className="max-h-[11rem] list-decimal space-y-1 overflow-y-auto pl-4 text-[11px] leading-snug text-black/85">
                  {route.steps.map((step, i) => {
                    const text = step.instructions?.trim();
                    if (!text) return null;
                    const seg =
                      step.distanceMeters > 0 || step.durationSeconds > 0
                        ? ` (${formatDistanceMeters(step.distanceMeters, t)}, ${formatDuration(step.durationSeconds, t)})`
                        : "";
                    return (
                      <li key={`${i}-${text.slice(0, 24)}`}>
                        {text}
                        {seg}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-[11px] text-black/55">
                  {t("apps.maps.directions.stepsUnavailable", {
                    defaultValue:
                      "Step-by-step instructions weren’t returned for this route. Use Open in Maps… for full guidance.",
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
