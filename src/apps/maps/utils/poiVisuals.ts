import {
  Airplane,
  Bank,
  Barbell,
  Bed,
  BeerStein,
  Books,
  Buildings,
  Car,
  Coffee,
  CurrencyDollar,
  Envelope,
  FilmStrip,
  Fire,
  FirstAid,
  Fish,
  ForkKnife,
  GasPump,
  GraduationCap,
  House,
  type Icon,
  Lightning,
  MapPin,
  Briefcase,
  MaskHappy,
  Mountains,
  Park,
  PawPrint,
  Pill,
  ShoppingBag,
  ShoppingCart,
  Storefront,
  Sun,
  Tent,
  Train,
  Trophy,
  Wine,
} from "@phosphor-icons/react";

const ICONS = {
  ForkKnife,
  Coffee,
  BeerStein,
  Wine,
  ShoppingCart,
  Storefront,
  ShoppingBag,
  Bank,
  CurrencyDollar,
  Bed,
  Tent,
  FirstAid,
  Pill,
  Park,
  Mountains,
  Sun,
  Buildings,
  FilmStrip,
  MaskHappy,
  Books,
  Airplane,
  Train,
  Car,
  GasPump,
  Lightning,
  Envelope,
  Fire,
  GraduationCap,
  Barbell,
  Trophy,
  PawPrint,
  Fish,
  MapPin,
  House,
  Briefcase,
} as const;

export type PoiIconKey = keyof typeof ICONS;

export interface PoiVisual {
  iconKey: PoiIconKey;
  /** CSS color stop for top-left of the gradient. */
  from: string;
  /** CSS color stop for bottom-right of the gradient. */
  to: string;
}

const DEFAULT_VISUAL: PoiVisual = {
  iconKey: "MapPin",
  from: "#94a3b8",
  to: "#475569",
};

// Map MapKit's `pointOfInterestCategory` values to a phosphor icon and a
// gradient. Categories are camelCase strings as documented at
// https://developer.apple.com/documentation/mapkitjs/mapkit/pointofinterestcategory
const VISUALS: Record<string, PoiVisual> = {
  // Food & drink
  restaurant: { iconKey: "ForkKnife", from: "#fb923c", to: "#dc2626" },
  cafe: { iconKey: "Coffee", from: "#d97706", to: "#78350f" },
  bakery: { iconKey: "ForkKnife", from: "#fbbf24", to: "#d97706" },
  brewery: { iconKey: "BeerStein", from: "#f59e0b", to: "#92400e" },
  winery: { iconKey: "Wine", from: "#9f1239", to: "#581c87" },
  nightlife: { iconKey: "BeerStein", from: "#a855f7", to: "#ec4899" },
  foodMarket: { iconKey: "ShoppingCart", from: "#84cc16", to: "#16a34a" },

  // Shopping
  store: { iconKey: "Storefront", from: "#0ea5e9", to: "#06b6d4" },
  marina: { iconKey: "ShoppingBag", from: "#0ea5e9", to: "#1d4ed8" },

  // Money
  bank: { iconKey: "Bank", from: "#10b981", to: "#047857" },
  atm: { iconKey: "CurrencyDollar", from: "#10b981", to: "#047857" },

  // Lodging
  hotel: { iconKey: "Bed", from: "#6366f1", to: "#3b82f6" },
  campground: { iconKey: "Tent", from: "#65a30d", to: "#15803d" },

  // Health
  hospital: { iconKey: "FirstAid", from: "#ef4444", to: "#b91c1c" },
  pharmacy: { iconKey: "Pill", from: "#f43f5e", to: "#9f1239" },

  // Outdoors
  park: { iconKey: "Park", from: "#22c55e", to: "#15803d" },
  nationalPark: { iconKey: "Mountains", from: "#22c55e", to: "#065f46" },
  beach: { iconKey: "Sun", from: "#fbbf24", to: "#06b6d4" },

  // Culture
  museum: { iconKey: "Buildings", from: "#a855f7", to: "#7c3aed" },
  movieTheater: { iconKey: "FilmStrip", from: "#a855f7", to: "#6366f1" },
  theater: { iconKey: "MaskHappy", from: "#ec4899", to: "#7c3aed" },
  library: { iconKey: "Books", from: "#a16207", to: "#78350f" },

  // Transport
  airport: { iconKey: "Airplane", from: "#06b6d4", to: "#0284c7" },
  publicTransport: { iconKey: "Train", from: "#6366f1", to: "#3730a3" },
  parking: { iconKey: "Car", from: "#3b82f6", to: "#1d4ed8" },
  gasStation: { iconKey: "GasPump", from: "#f59e0b", to: "#b45309" },
  evCharger: { iconKey: "Lightning", from: "#22c55e", to: "#10b981" },
  carRental: { iconKey: "Car", from: "#3b82f6", to: "#1d4ed8" },

  // Civic
  postOffice: { iconKey: "Envelope", from: "#3b82f6", to: "#1d4ed8" },
  fireStation: { iconKey: "Fire", from: "#ef4444", to: "#b91c1c" },
  police: { iconKey: "Buildings", from: "#1e40af", to: "#1e3a8a" },
  school: { iconKey: "GraduationCap", from: "#3b82f6", to: "#1d4ed8" },
  university: { iconKey: "GraduationCap", from: "#6366f1", to: "#3730a3" },

  // Recreation
  fitnessCenter: { iconKey: "Barbell", from: "#ef4444", to: "#dc2626" },
  stadium: { iconKey: "Trophy", from: "#22c55e", to: "#15803d" },
  zoo: { iconKey: "PawPrint", from: "#22c55e", to: "#15803d" },
  aquarium: { iconKey: "Fish", from: "#06b6d4", to: "#0284c7" },
  amusementPark: { iconKey: "Trophy", from: "#ec4899", to: "#a855f7" },
  laundry: { iconKey: "Storefront", from: "#06b6d4", to: "#3b82f6" },

  // Generic place categories MapKit may return alongside POIs
  address: { iconKey: "MapPin", from: "#94a3b8", to: "#475569" },
  searchHistory: { iconKey: "MapPin", from: "#94a3b8", to: "#475569" },
};

export function poiVisualWithIcon(
  visual: PoiVisual
): PoiVisual & { Icon: Icon } {
  return { ...visual, Icon: ICONS[visual.iconKey] };
}

export function getPoiVisual(
  category?: string | null
): PoiVisual & { Icon: Icon } {
  let visual = DEFAULT_VISUAL;
  if (category) {
    const normalized = category.replace(/^MKPOICategory/, "");
    const key = normalized.charAt(0).toLowerCase() + normalized.slice(1);
    visual = VISUALS[key] ?? DEFAULT_VISUAL;
  }
  return poiVisualWithIcon(visual);
}

/**
 * Background for circular POI badges in the Maps app. Apple Maps keeps the
 * fill mostly flat — only a slight shift toward the gradient end color —
 * instead of a high-contrast glossy ramp.
 */
export function poiVisualGradient(visual: PoiVisual): string {
  return `linear-gradient(180deg, ${visual.from} 0%, color-mix(in srgb, ${visual.from} 82%, ${visual.to}) 100%)`;
}
