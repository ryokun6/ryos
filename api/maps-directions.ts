import { z } from "zod";
import { apiHandler } from "./_utils/api-handler.js";
import {
  getDirections,
  listMapKitMissingEnv,
  type AppleDirectionsTransportType,
  type NormalizedDirectionsRoute,
} from "./_utils/_mapkit-server.js";

export const runtime = "nodejs";
export const maxDuration = 25;

const DIRECTIONS_TIMEOUT_MS = 18_000;

const appleTransportEnum = z.enum([
  "AUTOMOBILE",
  "WALKING",
  "TRANSIT",
  "CYCLING",
]);

const RequestSchema = z.object({
  origin: z.string().trim().min(1).max(512),
  destination: z.string().trim().min(1).max(512),
  transportType: appleTransportEnum.optional(),
  lang: z.string().trim().min(2).max(35).optional(),
});

interface DirectionsDestinationPayload {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

function summarizeDestination(data: {
  destination?: {
    name?: string;
    formattedAddressLines?: string[];
    center?: { latitude?: number; longitude?: number };
  };
}): DirectionsDestinationPayload {
  const d = data.destination;
  if (!d) return {};
  const lines = Array.isArray(d.formattedAddressLines)
    ? d.formattedAddressLines
    : [];
  const address = lines
    .map((l) => (typeof l === "string" ? l.trim() : ""))
    .filter((l) => l.length > 0)
    .join(", ");
  const lat = d.center?.latitude;
  const lng = d.center?.longitude;
  return {
    name: typeof d.name === "string" ? d.name : undefined,
    address: address || undefined,
    latitude:
      typeof lat === "number" && Number.isFinite(lat) ? lat : undefined,
    longitude:
      typeof lng === "number" && Number.isFinite(lng) ? lng : undefined,
  };
}

export default apiHandler(
  {
    methods: ["POST"],
    auth: "optional",
    parseJsonBody: true,
  },
  async ({ req, res, logger, startTime }) => {
    const parsed = RequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        success: false,
        error: "invalid_body",
        message: parsed.error.message,
      });
      return;
    }

    const missing = listMapKitMissingEnv();
    if (missing.length > 0) {
      logger.warn("[maps-directions] MapKit env incomplete", { missing });
      logger.response(503, Date.now() - startTime);
      res.status(503).json({
        success: false,
        error: "mapkit_not_configured",
        message:
          "Directions require Apple Maps Server credentials (same as Maps search).",
      });
      return;
    }

    const { origin, destination, transportType, lang } = parsed.data;

    try {
      const { raw, route } = await getDirections({
        origin,
        destination,
        ...(transportType
          ? { transportType: transportType as AppleDirectionsTransportType }
          : {}),
        ...(lang ? { lang } : {}),
        signal: AbortSignal.timeout(DIRECTIONS_TIMEOUT_MS),
      });

      const destinationInfo = summarizeDestination(raw);

      if (!route) {
        logger.response(200, Date.now() - startTime);
        res.status(200).json({
          success: true,
          routeAvailable: false,
          destination: destinationInfo,
          message: "No route returned for this origin and destination.",
        });
        return;
      }

      const payloadRoute: NormalizedDirectionsRoute = {
        ...route,
        steps: route.steps.filter((s) => {
          const hasText =
            typeof s.instructions === "string" && s.instructions.trim() !== "";
          return (
            hasText ||
            (s.distanceMeters ?? 0) > 0 ||
            (s.durationSeconds ?? 0) > 0
          );
        }),
      };

      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        success: true,
        routeAvailable: true,
        destination: destinationInfo,
        route: payloadRoute,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error("[maps-directions] request failed", error);
      logger.response(502, Date.now() - startTime);
      res.status(502).json({
        success: false,
        error: "directions_failed",
        message: detail,
      });
    }
  }
);
