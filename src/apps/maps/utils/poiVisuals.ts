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
  type Icon,
  Lightning,
  MapPin,
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

export interface PoiVisual {
  Icon: Icon;
  /** CSS color stop for top-left of the gradient. */
  from: string;
  /** CSS color stop for bottom-right of the gradient. */
  to: string;
}

const DEFAULT_VISUAL: PoiVisual = {
  Icon: MapPin,
  from: "#94a3b8",
  to: "#475569",
};

// Map MapKit's `pointOfInterestCategory` values to a phosphor icon and a
// gradient. Categories are camelCase strings as documented at
// https://developer.apple.com/documentation/mapkitjs/mapkit/pointofinterestcategory
const VISUALS: Record<string, PoiVisual> = {
  // Food & drink
  restaurant: { Icon: ForkKnife, from: "#fb923c", to: "#dc2626" },
  cafe: { Icon: Coffee, from: "#d97706", to: "#78350f" },
  bakery: { Icon: ForkKnife, from: "#fbbf24", to: "#d97706" },
  brewery: { Icon: BeerStein, from: "#f59e0b", to: "#92400e" },
  winery: { Icon: Wine, from: "#9f1239", to: "#581c87" },
  nightlife: { Icon: BeerStein, from: "#a855f7", to: "#ec4899" },
  foodMarket: { Icon: ShoppingCart, from: "#84cc16", to: "#16a34a" },

  // Shopping
  store: { Icon: Storefront, from: "#0ea5e9", to: "#06b6d4" },
  marina: { Icon: ShoppingBag, from: "#0ea5e9", to: "#1d4ed8" },

  // Money
  bank: { Icon: Bank, from: "#10b981", to: "#047857" },
  atm: { Icon: CurrencyDollar, from: "#10b981", to: "#047857" },

  // Lodging
  hotel: { Icon: Bed, from: "#6366f1", to: "#3b82f6" },
  campground: { Icon: Tent, from: "#65a30d", to: "#15803d" },

  // Health
  hospital: { Icon: FirstAid, from: "#ef4444", to: "#b91c1c" },
  pharmacy: { Icon: Pill, from: "#f43f5e", to: "#9f1239" },

  // Outdoors
  park: { Icon: Park, from: "#22c55e", to: "#15803d" },
  nationalPark: { Icon: Mountains, from: "#22c55e", to: "#065f46" },
  beach: { Icon: Sun, from: "#fbbf24", to: "#06b6d4" },

  // Culture
  museum: { Icon: Buildings, from: "#a855f7", to: "#7c3aed" },
  movieTheater: { Icon: FilmStrip, from: "#a855f7", to: "#6366f1" },
  theater: { Icon: MaskHappy, from: "#ec4899", to: "#7c3aed" },
  library: { Icon: Books, from: "#a16207", to: "#78350f" },

  // Transport
  airport: { Icon: Airplane, from: "#06b6d4", to: "#0284c7" },
  publicTransport: { Icon: Train, from: "#6366f1", to: "#3730a3" },
  parking: { Icon: Car, from: "#3b82f6", to: "#1d4ed8" },
  gasStation: { Icon: GasPump, from: "#f59e0b", to: "#b45309" },
  evCharger: { Icon: Lightning, from: "#22c55e", to: "#10b981" },
  carRental: { Icon: Car, from: "#3b82f6", to: "#1d4ed8" },

  // Civic
  postOffice: { Icon: Envelope, from: "#3b82f6", to: "#1d4ed8" },
  fireStation: { Icon: Fire, from: "#ef4444", to: "#b91c1c" },
  police: { Icon: Buildings, from: "#1e40af", to: "#1e3a8a" },
  school: { Icon: GraduationCap, from: "#3b82f6", to: "#1d4ed8" },
  university: { Icon: GraduationCap, from: "#6366f1", to: "#3730a3" },

  // Recreation
  fitnessCenter: { Icon: Barbell, from: "#ef4444", to: "#dc2626" },
  stadium: { Icon: Trophy, from: "#22c55e", to: "#15803d" },
  zoo: { Icon: PawPrint, from: "#22c55e", to: "#15803d" },
  aquarium: { Icon: Fish, from: "#06b6d4", to: "#0284c7" },
  amusementPark: { Icon: Trophy, from: "#ec4899", to: "#a855f7" },
  laundry: { Icon: Storefront, from: "#06b6d4", to: "#3b82f6" },

  // Generic place categories MapKit may return alongside POIs
  address: { Icon: MapPin, from: "#94a3b8", to: "#475569" },
  searchHistory: { Icon: MapPin, from: "#94a3b8", to: "#475569" },
};

export function getPoiVisual(category?: string | null): PoiVisual {
  if (!category) return DEFAULT_VISUAL;
  // MapKit sometimes returns category strings prefixed with "MKPOICategory" or
  // with a leading capital — normalize before lookup.
  const normalized = category.replace(/^MKPOICategory/, "");
  const key = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  return VISUALS[key] ?? DEFAULT_VISUAL;
}

export function poiVisualGradient(visual: PoiVisual): string {
  return `linear-gradient(to bottom, ${visual.from}, ${visual.to})`;
}
