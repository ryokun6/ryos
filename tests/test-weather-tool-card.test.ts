import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSkyGradient } from "../src/lib/weather/skyGradient";
import { weatherCodeToFamily } from "../src/utils/dynamicWallpaper";

const specialContentSource = readFileSync(
  join(
    import.meta.dir,
    "../src/components/shared/tool-invocation-message/tryRenderToolInvocationSpecialContent.tsx"
  ),
  "utf8"
);
const weatherCardSource = readFileSync(
  join(import.meta.dir, "../src/components/shared/WeatherToolCard.tsx"),
  "utf8"
);
const weatherWidgetSource = readFileSync(
  join(
    import.meta.dir,
    "../src/components/layout/dashboard/WeatherWidget.tsx"
  ),
  "utf8"
);

describe("getSkyGradient", () => {
  test("day and night render different skies for the same code", () => {
    expect(getSkyGradient(0, true)).not.toBe(getSkyGradient(0, false));
  });

  test("clear and thunderstorm days render different skies", () => {
    expect(getSkyGradient(0, true)).not.toBe(getSkyGradient(95, true));
  });

  test("out-of-range codes fall back to the clear-sky gradient", () => {
    expect(getSkyGradient(12345, true)).toBe(getSkyGradient(0, true));
    expect(getSkyGradient(12345, false)).toBe(getSkyGradient(0, false));
  });
});

describe("weather tool card wiring", () => {
  test("special content renders WeatherToolCard for successful getWeather output", () => {
    expect(specialContentSource).toContain('toolName === "getWeather"');
    expect(specialContentSource).toContain("WeatherToolCard");
    // Failures must fall through to the default status row.
    expect(specialContentSource).toContain(
      "out && out.success === true && out.current"
    );
  });

  test("card uses the shared inline-card shell and the sky gradient", () => {
    expect(weatherCardSource).toContain("toolInlineCardShellClassName");
    expect(weatherCardSource).toContain("getSkyGradient");
    expect(weatherCardSource).toContain("getWeatherEmoji");
  });

  test("card inherits the themed font from the card shell (no hardcoded stacks)", () => {
    // The shell's font-geneva-12 resolves per theme (Lucida Grande on Aqua,
    // Geneva/Chicago pixel fonts elsewhere); the card must not override it.
    expect(weatherCardSource).not.toContain("Helvetica");
    expect(weatherCardSource).not.toContain("fontFamily");
  });

  test("card localizes the condition by weather-code family", () => {
    expect(weatherCardSource).toContain("weatherCodeToFamily");
    expect(weatherCardSource).toContain("apps.dashboard.weather.conditions.");
  });

  test("compact hosts can override the card chrome", () => {
    expect(specialContentSource).toContain("className={compactCardClassName}");
    expect(weatherCardSource).toContain("className?: string");
  });

  test("dashboard widget reuses the shared sky gradient helper", () => {
    expect(weatherWidgetSource).toContain(
      'from "@/lib/weather/skyGradient"'
    );
    expect(weatherWidgetSource).not.toContain("function getSkyGradient");
  });

  test("condition families all resolve to a known translation suffix", () => {
    const families = new Set(
      [0, 2, 45, 51, 63, 71, 95].map((code) => weatherCodeToFamily(code))
    );
    expect([...families].sort()).toEqual([
      "clear",
      "drizzle",
      "fog",
      "partlyCloudy",
      "rain",
      "snow",
      "thunderstorm",
    ]);
  });
});
