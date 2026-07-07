/**
 * Client-side handler for the approval-gated `getPreciseLocation` tool.
 *
 * Runs only after the user approves the in-chat permission card. Uses the
 * browser Geolocation API, reuses the weather module's Nominatim client for
 * the locality name, and shares the resolved coordinates with the weather
 * store so widgets/wallpaper benefit from the fresh position too.
 */

import i18n from "@/lib/i18n";
import { reverseGeocodeCity } from "@/lib/weather/openMeteo";
import { useWeatherStore } from "@/stores/useWeatherStore";
import type { GetPreciseLocationOutput } from "@/shared/tools/preciseLocation";
import { aiChatLog as log } from "../logging";
import type { ToolOutputPayload } from "./types";

const GEOLOCATION_TIMEOUT_MS = 15_000;
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000;

export interface GetPreciseLocationInput {
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

export async function handleGetPreciseLocation(
  _input: GetPreciseLocationInput,
  toolCallId: string,
  context: { addToolOutput: (result: ToolOutputPayload) => void }
): Promise<void> {
  log.debug("Resolving device geolocation", { toolCallId });
  let position: GeolocationPosition;
  try {
    position = await getCurrentPosition();
  } catch (error) {
    log.warn("Geolocation failed", { toolCallId, error });
    context.addToolOutput({
      tool: "getPreciseLocation",
      toolCallId,
      state: "output-error",
      errorText: describeGeolocationError(error),
    });
    return;
  }

  const { latitude, longitude, accuracy } = position.coords;
  // Coarsen coordinates in logs (~1km) — debug output is meant to be shared.
  log.debug("Geolocation resolved", {
    toolCallId,
    latitude: latitude.toFixed(2),
    longitude: longitude.toFixed(2),
    accuracyMeters: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
  });

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
  ).catch((error) => {
    log.debug("Reverse geocode failed; continuing without a city", {
      toolCallId,
      error,
    });
    return null;
  });

  const output: GetPreciseLocationOutput = {
    success: true,
    message: city
      ? `User location: ${city} (${latitude.toFixed(4)}, ${longitude.toFixed(4)}).`
      : `User location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}.`,
    latitude,
    longitude,
    ...(Number.isFinite(accuracy) ? { accuracyMeters: Math.round(accuracy) } : {}),
    city: city ?? null,
  };

  log.debug("Reporting location tool output", {
    toolCallId,
    city: city ?? null,
  });
  context.addToolOutput({
    tool: "getPreciseLocation",
    toolCallId,
    output,
  });
}
