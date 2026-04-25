import { describe, expect, test } from "bun:test";
import { formatCityLabel, getPopularCities, searchNominatimCities } from "../src/components/layout/dashboard/citySearch";

const translate = (key: string) => `translated:${key}`;

describe("dashboard city search helpers", () => {
  test("formats labels with optional state", () => {
    expect(
      formatCityLabel({
        name: "New York",
        state: "NY",
        country: "US",
        lat: 40.7128,
        lon: -74.006,
      })
    ).toBe("New York, NY, US");

    expect(
      formatCityLabel({
        name: "London",
        country: "GB",
        lat: 51.5074,
        lon: -0.1278,
      })
    ).toBe("London, GB");
  });

  test("builds the shared popular city list", () => {
    const cities = getPopularCities(translate);

    expect(cities).toHaveLength(11);
    expect(cities[0]).toEqual({
      name: "translated:apps.dashboard.cities.newYork",
      country: "US",
      state: "NY",
      lat: 40.7128,
      lon: -74.006,
      cityKey: "apps.dashboard.cities.newYork",
    });
    expect(cities[cities.length - 1]?.cityKey).toBe("apps.dashboard.cities.taipei");
  });

  test("searches city results with the same nominatim mapping", async () => {
    const originalFetch = globalThis.fetch;
    const rows = [
      { type: "city", class: "place", address: { city: "New York", state: "NY", country_code: "us" }, lat: "40.7128", lon: "-74.006" },
      { type: "town", class: "place", address: { town: "Hudson", country_code: "us" }, lat: "42.2529", lon: "-73.7909" },
      { type: "village", class: "place", address: { village: "Sleepy Hollow", country_code: "us" }, lat: "41.0857", lon: "-73.8585" },
      { type: "administrative", class: "boundary", display_name: "Queens, New York", lat: "40.7282", lon: "-73.7949" },
      { type: "city", class: "place", address: { city: "York", country_code: "gb" }, lat: "53.959", lon: "-1.0815" },
      { type: "city", class: "place", address: { city: "Extra", country_code: "us" }, lat: "1", lon: "2" },
      { type: "road", class: "highway", display_name: "Ignored Road", lat: "3", lon: "4" },
    ];

    globalThis.fetch = Object.assign(
      async (url: RequestInfo | URL) => {
        expect(String(url)).toContain("q=New%20York");
        return new Response(JSON.stringify(rows), { status: 200 });
      },
      originalFetch
    );

    try {
      const results = await searchNominatimCities("New York");
      expect(results).toHaveLength(5);
      expect(results[0]).toEqual({
        name: "New York",
        country: "US",
        state: "NY",
        lat: 40.7128,
        lon: -74.006,
      });
      expect(results[3]?.name).toBe("Queens");
      expect(results[4]?.name).toBe("York");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
