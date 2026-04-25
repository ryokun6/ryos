import type { TFunction } from "i18next";

export interface CityResult {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
  cityKey?: string;
}

interface NominatimCityResult {
  type: string;
  class: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country_code?: string;
  };
  display_name?: string;
  lat: string;
  lon: string;
}

const NOMINATIM_CITY_TYPES = ["city", "town", "village", "administrative"];

export function getPopularCities(t: TFunction): CityResult[] {
  return [
    { name: t("apps.dashboard.cities.newYork"), country: "US", state: "NY", lat: 40.7128, lon: -74.006, cityKey: "apps.dashboard.cities.newYork" },
    { name: t("apps.dashboard.cities.london"), country: "GB", lat: 51.5074, lon: -0.1278, cityKey: "apps.dashboard.cities.london" },
    { name: t("apps.dashboard.cities.tokyo"), country: "JP", lat: 35.6762, lon: 139.6503, cityKey: "apps.dashboard.cities.tokyo" },
    { name: t("apps.dashboard.cities.paris"), country: "FR", lat: 48.8566, lon: 2.3522, cityKey: "apps.dashboard.cities.paris" },
    { name: t("apps.dashboard.cities.sydney"), country: "AU", lat: -33.8688, lon: 151.2093, cityKey: "apps.dashboard.cities.sydney" },
    { name: t("apps.dashboard.cities.sanFrancisco"), country: "US", state: "CA", lat: 37.7749, lon: -122.4194, cityKey: "apps.dashboard.cities.sanFrancisco" },
    { name: t("apps.dashboard.cities.berlin"), country: "DE", lat: 52.52, lon: 13.405, cityKey: "apps.dashboard.cities.berlin" },
    { name: t("apps.dashboard.cities.singapore"), country: "SG", lat: 1.3521, lon: 103.8198, cityKey: "apps.dashboard.cities.singapore" },
    { name: t("apps.dashboard.cities.shanghai"), country: "CN", lat: 31.2304, lon: 121.4737, cityKey: "apps.dashboard.cities.shanghai" },
    { name: t("apps.dashboard.cities.hongKong"), country: "HK", lat: 22.3193, lon: 114.1694, cityKey: "apps.dashboard.cities.hongKong" },
    { name: t("apps.dashboard.cities.taipei"), country: "TW", lat: 25.033, lon: 121.5654, cityKey: "apps.dashboard.cities.taipei" },
  ];
}

export function formatCityLabel(city: CityResult): string {
  const parts = [city.name];
  if (city.state) parts.push(city.state);
  parts.push(city.country);
  return parts.join(", ");
}

export function mapNominatimCityResults(data: NominatimCityResult[]): CityResult[] {
  return data
    .filter((result) => NOMINATIM_CITY_TYPES.includes(result.type) || result.class === "place")
    .slice(0, 5)
    .map((result) => ({
      name:
        result.address?.city ||
        result.address?.town ||
        result.address?.village ||
        result.display_name?.split(",")[0] ||
        "",
      country: (result.address?.country_code || "").toUpperCase(),
      state: result.address?.state,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    }));
}

export async function searchNominatimCities(query: string): Promise<CityResult[] | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&featuretype=city`
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return mapNominatimCityResults(data);
}
