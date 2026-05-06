/**
 * Order must match each row of `helpItems` in `src/apps/maps/index.tsx`.
 * `useTranslatedHelpItems` uses these segments for `apps.maps.help.<key>.*`.
 */
export const MAPS_HELP_I18N_KEYS = [
  "searchPlaces",
  "dropPins",
  "locateMe",
  "directions",
  "mapTypes",
  "poweredByApple",
] as const satisfies readonly string[];
