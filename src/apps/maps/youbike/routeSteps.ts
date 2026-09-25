import { isValidCoordinate, regionFittingPoints, type FittedMapRegion } from "./geo";
import type {
  GeoPoint,
  YouBikeRoutePlan,
  YouBikeRouteStep,
  YouBikeStepManeuver,
} from "./types";

/** Keeps the maneuver above the route card that covers the bottom of the map. */
const STEP_CAMERA_CARD_BIAS = 0.22;
const STEP_POINT_SPAN_DEG = 0.008;

type StepTranslate = (
  key: string,
  options?: { defaultValue?: string; direction?: string }
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
  step: Pick<YouBikeRouteStep, "instruction" | "streetName" | "maneuver">,
  translate: StepTranslate
): string {
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
  return plan.legs.flatMap((leg) => leg.steps ?? []);
}

/** Farther than this from the route, step progress stays off so the list is not dimmed. */
export const YOUBIKE_STEP_OFF_ROUTE_METERS = 80;
/** At a maneuver, a slightly later step wins so arrival advances the highlight. */
const STEP_PROGRESS_TIE_METERS = 8;
const METERS_PER_DEG_LAT = 111195;

function distanceToSegmentMeters(user: GeoPoint, start: GeoPoint, end: GeoPoint): number {
  const midLat = ((start.latitude + end.latitude) / 2) * (Math.PI / 180);
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(midLat);
  const bx = (end.longitude - start.longitude) * metersPerDegLng;
  const by = (end.latitude - start.latitude) * METERS_PER_DEG_LAT;
  const ux = (user.longitude - start.longitude) * metersPerDegLng;
  const uy = (user.latitude - start.latitude) * METERS_PER_DEG_LAT;
  const len2 = bx * bx + by * by;
  let t = 0;
  if (len2 > 1) {
    t = (ux * bx + uy * by) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  return Math.hypot(ux - bx * t, uy - by * t);
}

function distanceToStepMeters(user: GeoPoint, step: YouBikeRouteStep): number | null {
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

/**
 * Step the rider is currently on. Earlier steps are past; the returned index
 * is the one to highlight. Null when location is off the route or unknown.
 */
export function youbikeNextStepIndex(
  steps: YouBikeRouteStep[],
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
