/**
 * Maps search tool schemas
 */

import { z } from "zod";

// Apple Maps Server API rejects requests that include both a point bias
// (`searchLocation`) and a region bias (`searchRegion`) at the same time. To
// avoid the surface area for that conflict, the public tool only accepts a
// point anchor (`near`). The server still falls back to the request's
// IP-derived coordinates when `near` is omitted.
const mapsCoordinateSchema = z.object({
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .describe("Latitude in decimal degrees, between -90 and 90."),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe("Longitude in decimal degrees, between -180 and 180."),
});

export const mapsSearchPlacesSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Free-form search query — a place name, address, business, or category (e.g. 'Blue Bottle Coffee', '350 Sutter St San Francisco', 'best ramen near Shibuya')."
    ),
  near: mapsCoordinateSchema
    .optional()
    .describe(
      "Optional approximate center used to bias the search. Pass the user's location or the visible map center when known. When omitted, the server falls back to the request's IP-derived coordinates."
    ),
  countries: z
    .array(z.string().regex(/^[A-Za-z]{2}$/, { message: "Use ISO 3166-1 alpha-2 country codes" }))
    .max(10)
    .optional()
    .describe("Optional ISO 3166-1 alpha-2 country codes to constrain results (e.g. ['US', 'JP'])."),
  language: z
    .string()
    .max(20)
    .optional()
    .describe("Optional BCP-47 language tag for response text (e.g. 'en', 'ja', 'zh-Hant')."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of results to return (1-10, default 5)."),
});
