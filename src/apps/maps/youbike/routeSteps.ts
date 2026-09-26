import {
  haversineMeters,
  isValidCoordinate,
  regionFittingPoints,
  type FittedMapRegion,
} from "./geo";
import type {
  GeoPoint,
  YouBikeArrivalRole,
  YouBikeLegMode,
  YouBikeRoutePlan,
  YouBikeRouteStep,
  YouBikeStepManeuver,
} from "./types";

/** Keeps the maneuver above the route card that covers the bottom of the map. */
const STEP_CAMERA_CARD_BIAS = 0.22;
const STEP_POINT_SPAN_DEG = 0.008;

type StepTranslate = (
  key: string,
  options?: { defaultValue?: string; direction?: string; place?: string }
) => string;

const MANEUVER_PHRASES: Record<
  string,
  { withDirection: string; plain: string; fallback: string; fallbackPlain: string }
> = {
  depart: {
    withDirection: "apps.maps.youbike.maneuver.depart",
    plain: "apps.maps.youbike.maneuver.departPlain",
    fallback: "Head {{direction}}",
    fallbackPlain: "Head",
  },
  arrive: {
    withDirection: "apps.maps.youbike.maneuver.arrive",
    plain: "apps.maps.youbike.maneuver.arrive",
    fallback: "Arrive",
    fallbackPlain: "Arrive",
  },
  continue: {
    withDirection: "apps.maps.youbike.maneuver.continue",
    plain: "apps.maps.youbike.maneuver.continuePlain",
    fallback: "Continue {{direction}}",
    fallbackPlain: "Continue",
  },
  roundabout: {
    withDirection: "apps.maps.youbike.maneuver.roundabout",
    plain: "apps.maps.youbike.maneuver.roundabout",
    fallback: "Roundabout",
    fallbackPlain: "Roundabout",
  },
  merge: {
    withDirection: "apps.maps.youbike.maneuver.merge",
    plain: "apps.maps.youbike.maneuver.mergePlain",
    fallback: "Merge {{direction}}",
    fallbackPlain: "Merge",
  },
  fork: {
    withDirection: "apps.maps.youbike.maneuver.fork",
    plain: "apps.maps.youbike.maneuver.fork",
    fallback: "Keep {{direction}}",
    fallbackPlain: "Fork",
  },
  turn: {
    withDirection: "apps.maps.youbike.maneuver.turn",
    plain: "apps.maps.youbike.maneuver.turnPlain",
    fallback: "Turn {{direction}}",
    fallbackPlain: "Turn",
  },
};

const DIRECTION_KEYS: Record<string, string> = {
  right: "right",
  left: "left",
  straight: "straight",
  "slight right": "slightRight",
  "slight left": "slightLeft",
  "sharp right": "sharpRight",
  "sharp left": "sharpLeft",
  uturn: "uturn",
  north: "north",
  northeast: "northeast",
  east: "east",
  southeast: "southeast",
  south: "south",
  southwest: "southwest",
  west: "west",
  northwest: "northwest",
};

function maneuverPhraseKey(type: string): string {
  switch (type) {
    case "depart":
    case "arrive":
    case "continue":
    case "new name":
      return type === "new name" ? "continue" : type;
    case "roundabout":
    case "rotary":
    case "exit roundabout":
    case "exit rotary":
      return "roundabout";
    case "merge":
      return "merge";
    case "fork":
      return "fork";
    case "end of road":
    case "turn":
      return "turn";
    default:
      return "continue";
  }
}

function fillDirection(template: string, direction: string): string {
  return template.replaceAll("{{direction}}", direction);
}

/** MapKit/OSRM reuse “arrived at the destination” for every leg end. */
const GENERIC_ARRIVAL_INSTRUCTION =
  /^(you have )?arriv(e|ed)(\s+at(\s+(the|your)\s+)?destination)?\.?$/iu;
const ARRIVED_AT_PLACE = /^(you have )?arriv(e|ed)\s+at\b/iu;
const LOCALIZED_DESTINATION_ARRIVAL =
  /目的地.*(到|達|着)|到达目的地|抵達目的地|到着.*(目的地)?|목적지에?\s*도착|arriv[ée].*destination|destination.*arriv|ziel.*(angekommen|erreicht)|(llegad|chegad).*destino|arrivato.*destinazione|прибыл.*(назначения|пункт)/iu;

function interpolatePlace(template: string, place: string): string {
  return template.replaceAll("{{place}}", place);
}

/** True when a step is a generic arrival, not a turn onto a named street. */
export function isGenericArrivalStep(
  step: Pick<YouBikeRouteStep, "instruction" | "maneuver">
): boolean {
  const type = step.maneuver?.type.trim().toLowerCase();
  if (type === "arrive") return true;
  const instruction = step.instruction.trim();
  if (!instruction) return false;
  return (
    GENERIC_ARRIVAL_INSTRUCTION.test(instruction) ||
    ARRIVED_AT_PLACE.test(instruction) ||
    LOCALIZED_DESTINATION_ARRIVAL.test(instruction)
  );
}

/** Pickup dock, drop-off dock, or the actual place — last leg is always the place. */
export function youbikeArrivalRoleForLeg(
  legs: ReadonlyArray<{ mode: YouBikeLegMode }>,
  index: number
): YouBikeArrivalRole {
  const leg = legs[index];
  const next = legs[index + 1];
  if (!next) return "place";
  if (leg?.mode === "walk" && next.mode === "bike") return "pickup";
  if (leg?.mode === "bike" && next.mode === "walk") return "dock";
  return "place";
}

function tripDestinationLabel(plan: YouBikeRoutePlan): string {
  for (let i = plan.legs.length - 1; i >= 0; i -= 1) {
    const label = plan.legs[i]?.toLabel.trim();
    if (label) return label;
  }
  return "Destination";
}

function localizeArrivalStep(
  step: Pick<YouBikeRouteStep, "arrivalRole" | "arrivalPlace">,
  translate: StepTranslate
): string | null {
  if (step.arrivalRole === "pickup") {
    return translate("apps.maps.youbike.maneuver.pickUpBike", {
      defaultValue: "Pick up bike",
    });
  }
  if (step.arrivalRole === "dock") {
    return translate("apps.maps.youbike.maneuver.dockBike", {
      defaultValue: "Dock bike",
    });
  }
  if (step.arrivalRole === "place") {
    const place = step.arrivalPlace?.trim();
    if (place) {
      return translate("apps.maps.youbike.maneuver.arrivedAtPlace", {
        place,
        defaultValue: interpolatePlace("Arrived at {{place}}", place),
      });
    }
    return translate("apps.maps.youbike.maneuver.arrive", {
      defaultValue: "Arrive",
    });
  }
  return null;
}

/** Localized OSRM maneuver. MapKit instructions are already in the map language. */
export function youbikeManeuverPhrase(
  maneuver: YouBikeStepManeuver,
  translate: StepTranslate
): string {
  const type = maneuver.type.trim().toLowerCase();
  const modifier = maneuver.modifier
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .toLowerCase();
  const phrase = MANEUVER_PHRASES[maneuverPhraseKey(type)] ?? MANEUVER_PHRASES.continue;
  if (!modifier) {
    return translate(phrase.plain, { defaultValue: phrase.fallbackPlain });
  }
  const directionKey = DIRECTION_KEYS[modifier];
  const direction = directionKey
    ? translate(`apps.maps.youbike.maneuver.direction.${directionKey}`, {
        defaultValue: modifier,
      })
    : modifier;
  return translate(phrase.withDirection, {
    direction,
    defaultValue: fillDirection(phrase.fallback, direction),
  });
}

export function localizeYouBikeStepLabel(
  step: Pick<
    YouBikeRouteStep,
    "instruction" | "streetName" | "maneuver" | "arrivalRole" | "arrivalPlace"
  >,
  translate: StepTranslate
): string {
  const arrival = localizeArrivalStep(step, translate);
  if (arrival) return arrival;
  const instruction = step.maneuver
    ? youbikeManeuverPhrase(step.maneuver, translate)
    : step.instruction;
  return formatYouBikeStepLabel({ instruction, streetName: step.streetName });
}

function stepPoints(step: Pick<YouBikeRouteStep, "location" | "path">): GeoPoint[] {
  const path = (step.path ?? []).filter(isValidCoordinate);
  if (path.length >= 2) return path;
  if (step.location && isValidCoordinate(step.location)) return [step.location];
  if (path.length === 1) return path;
  return [];
}

/** Camera for a tapped step. Biased south so the turn stays above the route card. */
export function youbikeStepFocusRegion(
  step: Pick<YouBikeRouteStep, "location" | "path">
): FittedMapRegion | null {
  const points = stepPoints(step);
  if (points.length === 0) return null;
  const fitted =
    points.length >= 2
      ? regionFittingPoints(points, {
          padFactor: 0.45,
          minSpanDeg: 0.005,
          maxSpanDeg: 0.04,
        })
      : {
          center: points[0]!,
          latitudeDelta: STEP_POINT_SPAN_DEG,
          longitudeDelta: STEP_POINT_SPAN_DEG,
        };
  if (!fitted) return null;
  return {
    ...fitted,
    center: {
      latitude: fitted.center.latitude - fitted.latitudeDelta * STEP_CAMERA_CARD_BIAS,
      longitude: fitted.center.longitude,
    },
  };
}

/** One line for a turn: maneuver plus street when the street is not already in the text. */
export function formatYouBikeStepLabel(step: {
  instruction: string;
  streetName: string;
}): string {
  const instruction = step.instruction.trim();
  const street = step.streetName.trim();
  if (!street) return instruction;
  if (!instruction) return street;
  if (instruction.toLowerCase().includes(street.toLowerCase())) return instruction;
  return `${instruction} · ${street}`;
}

export function listYouBikeRouteSteps(plan: YouBikeRoutePlan): YouBikeRouteStep[] {
  const arrivalPlace = tripDestinationLabel(plan);
  return plan.legs.flatMap((leg, legIndex) => {
    const steps = leg.steps ?? [];
    const arrivalRole = youbikeArrivalRoleForLeg(plan.legs, legIndex);
    return steps.map((step) => {
      if (!isGenericArrivalStep(step)) return step;
      return {
        ...step,
        arrivalRole,
        arrivalPlace,
      };
    });
  });
}

/** Farther than this from the route, step progress stays off so the list is not dimmed. */
export const YOUBIKE_STEP_OFF_ROUTE_METERS = 80;
/** At a maneuver, a slightly later step wins so arrival advances the highlight. */
const STEP_PROGRESS_TIE_METERS = 8;
const METERS_PER_DEG_LAT = 111195;

function projectUserOnSegment(
  user: GeoPoint,
  start: GeoPoint,
  end: GeoPoint
): { distance: number; t: number; length: number } {
  const midLat = ((start.latitude + end.latitude) / 2) * (Math.PI / 180);
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(midLat);
  const bx = (end.longitude - start.longitude) * metersPerDegLng;
  const by = (end.latitude - start.latitude) * METERS_PER_DEG_LAT;
  const ux = (user.longitude - start.longitude) * metersPerDegLng;
  const uy = (user.latitude - start.latitude) * METERS_PER_DEG_LAT;
  const length = Math.hypot(bx, by);
  const len2 = bx * bx + by * by;
  let t = 0;
  if (len2 > 1) {
    t = (ux * bx + uy * by) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  return {
    distance: Math.hypot(ux - bx * t, uy - by * t),
    t,
    length,
  };
}

function distanceToSegmentMeters(user: GeoPoint, start: GeoPoint, end: GeoPoint): number {
  return projectUserOnSegment(user, start, end).distance;
}

function distanceToStepMeters(
  user: GeoPoint,
  step: Pick<YouBikeRouteStep, "location" | "path">
): number | null {
  const points = stepPoints(step);
  if (points.length === 0) return null;
  if (points.length === 1) {
    return distanceToSegmentMeters(user, points[0]!, points[0]!);
  }
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const distance = distanceToSegmentMeters(user, points[i - 1]!, points[i]!);
    if (distance < best) best = distance;
  }
  return best;
}

/** Meters left on this step's path. Null when the user is unknown or off the step. */
export function youbikeStepRemainingMeters(
  step: Pick<YouBikeRouteStep, "location" | "path">,
  user: GeoPoint | null
): number | null {
  if (!user || !isValidCoordinate(user)) return null;
  const points = stepPoints(step);
  if (points.length === 0) return null;
  if (points.length === 1) return haversineMeters(user, points[0]!);

  let bestDistance = Infinity;
  let bestIndex = 0;
  let bestT = 0;
  let bestLength = 0;
  for (let i = 1; i < points.length; i += 1) {
    const projection = projectUserOnSegment(user, points[i - 1]!, points[i]!);
    if (projection.distance < bestDistance) {
      bestDistance = projection.distance;
      bestIndex = i - 1;
      bestT = projection.t;
      bestLength = projection.length;
    }
  }
  if (bestDistance > YOUBIKE_STEP_OFF_ROUTE_METERS) return null;

  let remaining = (1 - bestT) * bestLength;
  for (let i = bestIndex + 2; i < points.length; i += 1) {
    remaining += haversineMeters(points[i - 1]!, points[i]!);
  }
  return remaining;
}

/**
 * Step the rider is currently on. Earlier steps are past; the returned index
 * is the one to highlight. Null when location is off the route or unknown.
 */
export function youbikeNextStepIndex(
  steps: Array<Pick<YouBikeRouteStep, "location" | "path">>,
  user: GeoPoint
): number | null {
  if (!isValidCoordinate(user) || steps.length === 0) return null;
  let bestDistance = Infinity;
  let bestIndex = -1;
  for (let index = 0; index < steps.length; index += 1) {
    const distance = distanceToStepMeters(user, steps[index]!);
    if (distance == null || !Number.isFinite(distance)) continue;
    if (bestIndex < 0 || distance + STEP_PROGRESS_TIE_METERS < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    } else if (
      index > bestIndex &&
      distance <= bestDistance + STEP_PROGRESS_TIE_METERS
    ) {
      if (distance < bestDistance) bestDistance = distance;
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestDistance > YOUBIKE_STEP_OFF_ROUTE_METERS) return null;
  return bestIndex;
}
