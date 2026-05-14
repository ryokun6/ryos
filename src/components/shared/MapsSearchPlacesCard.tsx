import { ArrowSquareOut } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useMapsStore } from "@/stores/useMapsStore";
import {
  getPoiVisual,
  poiVisualGradient,
} from "@/apps/maps/utils/poiVisuals";
import type { SavedPlace } from "@/apps/maps/utils/types";
import { cn } from "@/lib/utils";

/**
 * Result returned by the `mapsSearchPlaces` server tool. Mirrors
 * `MapsSearchPlaceResult` from `api/chat/tools/types.ts`. We re-declare the
 * shape here so the chat UI doesn't import server-only code.
 */
export interface MapsSearchPlaceCardData {
  id: string;
  placeId?: string;
  name: string;
  address: string;
  addressLines?: string[];
  latitude: number;
  longitude: number;
  category?: string;
  country?: string;
  countryCode?: string;
  appleMapsUrl: string;
}

export interface MapsSearchPlacesCardProps {
  query: string;
  results: MapsSearchPlaceCardData[];
}

/**
 * Inline chat card rendered when the assistant calls `mapsSearchPlaces`.
 *
 * Each row mirrors the look of the in-app `MapsPlaceCard`: square POI badge
 * with the category gradient + Phosphor glyph, a one-line title, and a
 * truncated address. Tapping a row plots the place in ryOS Maps; the
 * external-link affordance opens the same place in the user's system Maps
 * app via `appleMapsUrl`.
 */
export function MapsSearchPlacesCard({
  query,
  results,
}: MapsSearchPlacesCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isXpTheme, isSystem7Theme } = useThemeFlags();
  const launchApp = useLaunchApp();

  const handleOpenInMaps = useCallback(
    (place: MapsSearchPlaceCardData) => {
      const saved: SavedPlace = {
        id: place.id,
        name: place.name,
        subtitle: place.address || undefined,
        latitude: place.latitude,
        longitude: place.longitude,
        category: place.category,
        placeId: place.placeId,
      };
      const store = useMapsStore.getState();
      store.recordRecent(saved);
      store.setSelectedPlace(saved);
      launchApp("maps");
    },
    [launchApp]
  );

  if (!results || results.length === 0) {
    return (
      <div
        className={cn(
          "my-1 px-2.5 py-2 text-[12px] text-black/70",
          isMacOSTheme
            ? "rounded-[0.5rem] bg-white/85 shadow-sm"
            : isSystem7Theme
              ? "rounded border-2 border-black bg-white shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]"
              : isXpTheme
                ? "rounded-[0.4rem] border-2 border-[#0054E3] bg-[#ECE9D8]"
                : "rounded border border-black/30 bg-white"
        )}
      >
        {t("apps.chats.toolCalls.maps.noResults", {
          defaultValue: 'No places found for "{{query}}".',
          query,
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-1 overflow-hidden",
        // Theme shells mirror the in-app place card so the chat surface
        // looks like a sibling of the real Maps UI.
        isMacOSTheme &&
          "maps-place-card-aqua rounded-[0.5rem] text-black",
        !isMacOSTheme &&
          isSystem7Theme &&
          "rounded border-2 border-black bg-white text-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]",
        !isMacOSTheme &&
          !isSystem7Theme &&
          isXpTheme &&
          "rounded-[0.4rem] border-2 border-[#0054E3] bg-[#ECE9D8] text-black",
        !isMacOSTheme && !isSystem7Theme && !isXpTheme &&
          "rounded border border-black/30 bg-white text-black shadow-md"
      )}
    >
      <ul className="divide-y divide-black/10">
        {results.map((place) => {
          const visual = getPoiVisual(place.category);
          const Icon = visual.Icon;
          return (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => handleOpenInMaps(place)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 text-left",
                  "hover:bg-black/5 active:bg-black/10",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-black/30"
                )}
                aria-label={t("apps.chats.toolCalls.maps.openInMaps", {
                  defaultValue: "Open {{name}} in Maps",
                  name: place.name,
                })}
              >
                <div
                  className="aqua-icon-badge flex size-9 shrink-0 items-center justify-center text-white"
                  style={{ backgroundImage: poiVisualGradient(visual) }}
                  aria-hidden="true"
                >
                  <Icon size={20} weight="fill" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold leading-tight text-black">
                    {place.name}
                  </div>
                  {place.address && (
                    <div className="line-clamp-2 text-[11px] leading-snug text-black/60">
                      {place.address}
                    </div>
                  )}
                </div>
                <a
                  href={place.appleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "shrink-0 -mr-0.5 flex size-7 items-center justify-center rounded-full",
                    "text-black/55 hover:bg-black/10 hover:text-black/85",
                    "focus:outline-none focus-visible:ring-1 focus-visible:ring-black/30"
                  )}
                  aria-label={t("apps.chats.toolCalls.maps.openInAppleMaps", {
                    defaultValue: "Open in Apple Maps",
                  })}
                  title={t("apps.chats.toolCalls.maps.openInAppleMaps", {
                    defaultValue: "Open in Apple Maps",
                  })}
                >
                  <ArrowSquareOut size={14} weight="bold" />
                </a>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
