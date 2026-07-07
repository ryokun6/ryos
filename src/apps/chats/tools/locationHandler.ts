/**
 * Client-side handler for the approval-gated `getLocation` tool.
 *
 * Runs only after the user approves the in-chat permission card. Uses the
 * browser Geolocation API, reuses the weather module's Nominatim client for
 * the locality name, and shares the resolved coordinates with the weather
 * store so widgets/wallpaper benefit from the fresh position too.
 */

import i18n from "@/lib/i18n";
import { reverseGeocodeCity } from "@/lib/weather/openMeteo";
import { useWeatherStore } from "@/stores/useWeatherStore";
import type { GetLocationOutput } from "@/shared/tools/location";
import type { ToolOutputPayload } from "./types";

const GEOLOCATION_TIMEOUT_MS = 15_000;
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000;

export interface GetLocationInput {
  reason?: string;
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: GEOLOCATION_TIMEOUT_MS,
      maximumAge: GEOLOCATION_MAX_AGE_MS,
    });
  });
}

function describeGeolocationError(error: unknown): string {
  if (
    typeof GeolocationPositionError !== "undefined" &&
    error instanceof GeolocationPositionError
  ) {
    if (error.code === error.PERMISSION_DENIED) {
      return "The browser blocked the location request (permission denied).";
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return "The device position is currently unavailable.";
    }
    if (error.code === error.TIMEOUT) {
      return "Timed out while resolving the device position.";
    }
  }
  return error instanceof Error
    ? error.message
    : i18n.t("apps.chats.toolCalls.unknownError");
}

export async function handleGetLocation(
  _input: GetLocationInput,
  toolCallId: string,
  context: { addToolOutput: (result: ToolOutputPayload) => void }
): Promise<void> {
  let position: GeolocationPosition;
  try {
    position = await getCurrentPosition();
  } catch (error) {
    context.addToolOutput({
      tool: "getLocation",
      toolCallId,
      state: "output-error",
      errorText: describeGeolocationError(error),
    });
    return;
  }

  const { latitude, longitude, accuracy } = position.coords;

  // Share the fresh device position with the weather store (the same source
  // the dashboard widget and weather wallpaper read from).
  useWeatherStore.setState({
    geoCoords: { lat: latitude, lon: longitude },
    geoFailed: false,
  });

  const city = await reverseGeocodeCity(
    latitude,
    longitude,
    i18n.language
  ).catch(() => null);

  const output: GetLocationOutput = {
    success: true,
    message: city
      ? `User location: ${city} (${latitude.toFixed(4)}, ${longitude.toFixed(4)}).`
      : `User location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}.`,
    latitude,
    longitude,
    ...(Number.isFinite(accuracy) ? { accuracyMeters: Math.round(accuracy) } : {}),
    city: city ?? null,
  };

  context.addToolOutput({
    tool: "getLocation",
    toolCallId,
    output,
  });
}
