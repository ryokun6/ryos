import { describe, expect, test } from "bun:test";
import { formatCityLabel, getPopularCities } from "../src/components/layout/dashboard/citySearch";

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
});
