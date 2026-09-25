import {
  BIKE_SPEED_MPS,
  WALK_SPEED_MPS,
  estimateDurationSeconds,
  haversineMeters,
  interpolateGreatCircle,
} from "./geo";
import {
  DEFAULT_MAX_STATION_WALK_METERS,
  rankNearbyStations,
} from "./nearestStations";
import type {
  GeoPoint,
  YouBikeRouteLeg,
  YouBikeRoutePlan,
  YouBikeStation,
} from "./types";

export interface PlanYouBikeTripInput {
  origin: GeoPoint;
  destination: GeoPoint;
  originLabel?: string;
  destinationLabel?: string;
  stations: YouBikeStation[];
  maxStationWalkMeters?: number;
  language?: string;
}

const SAME_PLACE_WALK_METERS = 180;
const PREFER_WALK_METERS = 450;

function pointOf(station: YouBikeStation): GeoPoint {
  return { latitude: station.latitude, longitude: station.longitude };
}

function sumDistance(legs: YouBikeRouteLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
}

function sumDuration(legs: YouBikeRouteLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
}

function walkLeg(
  from: GeoPoint,
  to: GeoPoint,
  fromLabel: string,
  toLabel: string
): YouBikeRouteLeg {
  const distanceMeters = haversineMeters(from, to);
  return {
    mode: "walk",
    from,
    to,
    fromLabel,
    toLabel,
    distanceMeters,
    durationSeconds: estimateDurationSeconds(distanceMeters, WALK_SPEED_MPS),
    path: [from, to],
  };
}

function bikeLeg(
  from: GeoPoint,
  to: GeoPoint,
  fromLabel: string,
  toLabel: string
): YouBikeRouteLeg {
  const distanceMeters = haversineMeters(from, to);
  return {
    mode: "bike",
    from,
    to,
    fromLabel,
    toLabel,
    distanceMeters,
    durationSeconds: estimateDurationSeconds(distanceMeters, BIKE_SPEED_MPS),
    path: interpolateGreatCircle(from, to),
  };
}

function walkOnlyPlan(
  input: PlanYouBikeTripInput,
  warnings: string[]
): YouBikeRoutePlan {
  const originLabel = input.originLabel ?? "Start";
  const destinationLabel = input.destinationLabel ?? "Destination";
  const legs = [
    walkLeg(input.origin, input.destination, originLabel, destinationLabel),
  ];
  return {
    kind: "walk",
    origin: input.origin,
    destination: input.destination,
    originStation: null,
    destinationStation: null,
    legs,
    totalDistanceMeters: sumDistance(legs),
    totalDurationSeconds: sumDuration(legs),
    warnings,
  };
}

function stationLabel(
  station: YouBikeStation,
  language: string | undefined
): string {
  const useChinese =
    !!language &&
    (language.toLowerCase().startsWith("zh") ||
      language.toLowerCase().includes("hant") ||
      language.toLowerCase().includes("hans"));
  return useChinese ? station.name : station.nameEn || station.name;
}

/**
 * Build a YouBike-aware trip: walk to a nearby station with bikes, bike to
 * a station with docks near the destination, then walk the last block.
 *
 * MapKit has no cycling transport type, so bike-leg geometry is a geodesic
 * estimate. Walk legs start as straight-line estimates; the Maps controller
 * replaces their path/duration with MapKit walking directions when available.
 */
export function planYouBikeTrip(
  input: PlanYouBikeTripInput
): YouBikeRoutePlan | { error: string } {
  const maxWalk = input.maxStationWalkMeters ?? DEFAULT_MAX_STATION_WALK_METERS;
  const originLabel = input.originLabel ?? "Start";
  const destinationLabel = input.destinationLabel ?? "Destination";
  const directMeters = haversineMeters(input.origin, input.destination);

  if (directMeters <= SAME_PLACE_WALK_METERS) {
    return walkOnlyPlan(input, ["destination_too_close"]);
  }

  const originWithBikes = rankNearbyStations(input.origin, input.stations, {
    maxDistanceMeters: maxWalk,
    requireBikes: true,
  });
  const originAny = rankNearbyStations(input.origin, input.stations, {
    maxDistanceMeters: maxWalk,
  });
  const destWithDocks = rankNearbyStations(input.destination, input.stations, {
    maxDistanceMeters: maxWalk,
    requireDocks: true,
  });
  const destAny = rankNearbyStations(input.destination, input.stations, {
    maxDistanceMeters: maxWalk,
  });

  const originCandidates =
    originWithBikes.length > 0 ? originWithBikes : originAny;
  const destCandidates = destWithDocks.length > 0 ? destWithDocks : destAny;

  if (originCandidates.length === 0) {
    return { error: "no_origin_station" };
  }
  if (destCandidates.length === 0) {
    return { error: "no_destination_station" };
  }

  let best: YouBikeRoutePlan | null = null;

  for (const originHit of originCandidates) {
    for (const destHit of destCandidates) {
      const sameStation = originHit.station.id === destHit.station.id;
      if (sameStation) {
        continue;
      }

      const fromName = stationLabel(originHit.station, input.language);
      const toName = stationLabel(destHit.station, input.language);
      const legs: YouBikeRouteLeg[] = [];

      if (originHit.distanceMeters > 25) {
        legs.push(
          walkLeg(input.origin, pointOf(originHit.station), originLabel, fromName)
        );
      }
      legs.push(
        bikeLeg(pointOf(originHit.station), pointOf(destHit.station), fromName, toName)
      );
      if (destHit.distanceMeters > 25) {
        legs.push(
          walkLeg(
            pointOf(destHit.station),
            input.destination,
            toName,
            destinationLabel
          )
        );
      }

      const warnings: string[] = [];
      if (originHit.station.bikesAvailable <= 0) {
        warnings.push("origin_station_no_bikes");
      }
      if (destHit.station.docksAvailable <= 0) {
        warnings.push("destination_station_no_docks");
      }

      const plan: YouBikeRoutePlan = {
        kind: "youbike",
        origin: input.origin,
        destination: input.destination,
        originStation: originHit.station,
        destinationStation: destHit.station,
        legs,
        totalDistanceMeters: sumDistance(legs),
        totalDurationSeconds: sumDuration(legs),
        warnings,
      };

      if (!best || plan.totalDurationSeconds < best.totalDurationSeconds) {
        best = plan;
      }
    }
  }

  if (!best) {
    if (directMeters <= PREFER_WALK_METERS) {
      return walkOnlyPlan(input, ["same_station_walk"]);
    }
    return { error: "no_distinct_stations" };
  }

  if (
    directMeters <= PREFER_WALK_METERS &&
    estimateDurationSeconds(directMeters, WALK_SPEED_MPS) + 120 <
      best.totalDurationSeconds
  ) {
    return walkOnlyPlan(input, ["walk_faster_than_youbike"]);
  }

  return best;
}

export function isYouBikeRouteError(
  value: YouBikeRoutePlan | { error: string }
): value is { error: string } {
  return "error" in value;
}
