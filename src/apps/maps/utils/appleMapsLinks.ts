/**
 * Apple / Google Maps deep links. Implementation lives under `directions/`
 * so place cards and in-map routes share one URL builder.
 */
export {
  buildAppleMapsDirectionsUrl,
  buildAppleMapsDrivingDirectionsUrl,
  buildAppleMapsPlaceUrl,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPlaceUrl,
  openExternalMapsUrl,
} from "../directions/externalMapsLinks";
