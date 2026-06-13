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
import {
  toolInlineCardListClassName,
  toolInlineCardListRowClassName,
  toolInlineCardShellClassName,
} from "@/components/shared/toolInlineCardShell";
import { osSubtleIconButtonClassName } from "@/components/shared/osThemePrimitives";

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
  const { isMacOSTheme, isXpTheme, isSystem7Theme, isWin98 } = useThemeFlags();
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

  const emptyShell = cn(
    toolInlineCardShellClassName({
      isMacOSTheme,
      isSystem7Theme,
      isXpTheme,
      isWin98,
    }),
    "px-2.5 py-2 text-[12px]",
    isMacOSTheme && "text-os-text-secondary"
  );

  if (!results || results.length === 0) {
    return (
      <div className={emptyShell}>
        <p className="text-os-text-secondary">
          {t("apps.chats.toolCalls.maps.noResults", {
            defaultValue: 'No places found for "{{query}}".',
            query,
          })}
        </p>
      </div>
    );
  }

  return (
    <div
      className={toolInlineCardShellClassName({
        isMacOSTheme,
        isSystem7Theme,
        isXpTheme,
        isWin98,
      })}
    >
      <ul
        className={toolInlineCardListClassName({ isMacOSTheme })}
      >
        {results.map((place) => {
          const visual = getPoiVisual(place.category);
          const Icon = visual.Icon;
          return (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => handleOpenInMaps(place)}
                className={toolInlineCardListRowClassName({
                  isMacOSTheme,
                })}
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
                  <div className="truncate text-[13px] font-semibold leading-tight text-os-text-primary">
                    {place.name}
                  </div>
                  {place.address && (
                    <div className="line-clamp-2 text-[11px] leading-snug text-os-text-secondary">
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
                    "focus:outline-none focus-visible:ring-1",
                    osSubtleIconButtonClassName()
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
