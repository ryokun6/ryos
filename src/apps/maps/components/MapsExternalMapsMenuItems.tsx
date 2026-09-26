import { ArrowSquareOut } from "@phosphor-icons/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT } from "@/lib/aquaIconButton";
import {
  buildAppleMapsDirectionsUrl,
  buildAppleMapsPlaceUrl,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPlaceUrl,
  openExternalMapsUrl,
  type ExternalMapsTravelMode,
} from "../directions/externalMapsLinks";
import type { GeoPoint } from "../youbike/types";

export function MapsExternalMapsMenuItems({
  destination,
  origin,
  mode,
  placeName,
  asDirections,
  t,
}: {
  destination: GeoPoint;
  origin?: GeoPoint | null;
  mode?: ExternalMapsTravelMode;
  placeName?: string;
  asDirections: boolean;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const appleUrl = asDirections
    ? buildAppleMapsDirectionsUrl({ destination, origin, mode })
    : buildAppleMapsPlaceUrl({
        latitude: destination.latitude,
        longitude: destination.longitude,
        name: placeName,
      });
  const googleUrl = asDirections
    ? buildGoogleMapsDirectionsUrl({ destination, origin, mode })
    : buildGoogleMapsPlaceUrl({
        latitude: destination.latitude,
        longitude: destination.longitude,
        name: placeName,
      });

  return (
    <>
      <DropdownMenuItem onSelect={() => openExternalMapsUrl(appleUrl)}>
        <ArrowSquareOut weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT} />
        {t("apps.maps.placeCard.openInAppleMaps", {
          defaultValue: "Open in Apple Maps",
        })}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openExternalMapsUrl(googleUrl)}>
        <ArrowSquareOut weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT} />
        {t("apps.maps.placeCard.openInGoogleMaps", {
          defaultValue: "Open in Google Maps",
        })}
      </DropdownMenuItem>
    </>
  );
}
