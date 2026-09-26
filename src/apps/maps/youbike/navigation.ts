/** Speak the upcoming maneuver when this close to the end of the current step. */
export const YOUBIKE_NAV_APPROACH_METERS = 35;
/** Ignore repeat start/advance/approach cues inside this window. */
export const YOUBIKE_NAV_SPEAK_COOLDOWN_MS = 5000;

export type YouBikeNavAnnounceKind = "start" | "advance" | "approach";

export interface YouBikeNavAnnounceInput {
  isStarting: boolean;
  /** Then / Next tap — speak the new step even inside the GPS cooldown. */
  isManualAdvance?: boolean;
  focusedIndex: number;
  stepCount: number;
  remainingMeters: number | null;
  lastSpokenIndex: number | null;
  lastApproachIndex: number | null;
  lastSpeakAtMs: number;
  nowMs: number;
}

export interface YouBikeNavAnnounceResult {
  kind: YouBikeNavAnnounceKind | null;
  /** Step whose label should be spoken (`approach` speaks the next step). */
  speakIndex: number | null;
  lastSpokenIndex: number | null;
  lastApproachIndex: number | null;
  lastSpeakAtMs: number;
}

function clampStepIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  if (index < 0) return 0;
  if (index > stepCount - 1) return stepCount - 1;
  return index;
}

/** GPS step when on-route; a Then tap ahead of GPS wins until GPS catches up. */
export function youbikeNavigationFocusedIndex(options: {
  stepCount: number;
  gpsIndex: number | null;
  manualIndex: number;
}): number {
  const { stepCount, gpsIndex, manualIndex } = options;
  if (stepCount <= 0) return 0;
  const manual = clampStepIndex(manualIndex, stepCount);
  if (gpsIndex != null && gpsIndex >= 0 && gpsIndex < stepCount) {
    return Math.max(gpsIndex, manual);
  }
  return manual;
}

function idleAnnounce(
  input: YouBikeNavAnnounceInput
): YouBikeNavAnnounceResult {
  return {
    kind: null,
    speakIndex: null,
    lastSpokenIndex: input.lastSpokenIndex,
    lastApproachIndex: input.lastApproachIndex,
    lastSpeakAtMs: input.lastSpeakAtMs,
  };
}

/**
 * Decide whether to speak, and which step. Start and advance speak the
 * focused step; approach speaks the following step once. Cooldown and
 * already-spoken approach cues prevent spam.
 */
export function youbikeNavAnnounce(
  input: YouBikeNavAnnounceInput
): YouBikeNavAnnounceResult {
  const focusedIndex = clampStepIndex(input.focusedIndex, input.stepCount);
  const nextIndex =
    focusedIndex + 1 < input.stepCount ? focusedIndex + 1 : null;
  const coolingDown =
    input.lastSpeakAtMs > 0 &&
    input.nowMs - input.lastSpeakAtMs < YOUBIKE_NAV_SPEAK_COOLDOWN_MS;

  if (input.isStarting && input.stepCount > 0) {
    return {
      kind: "start",
      speakIndex: focusedIndex,
      lastSpokenIndex: focusedIndex,
      lastApproachIndex: input.lastApproachIndex,
      lastSpeakAtMs: input.nowMs,
    };
  }

  if (input.isManualAdvance && input.stepCount > 0) {
    return {
      kind: "advance",
      speakIndex: focusedIndex,
      lastSpokenIndex: focusedIndex,
      lastApproachIndex: input.lastApproachIndex,
      lastSpeakAtMs: input.nowMs,
    };
  }

  if (
    input.lastSpokenIndex != null &&
    focusedIndex > input.lastSpokenIndex
  ) {
    if (input.lastApproachIndex === focusedIndex) {
      return {
        kind: null,
        speakIndex: null,
        lastSpokenIndex: focusedIndex,
        lastApproachIndex: input.lastApproachIndex,
        lastSpeakAtMs: input.lastSpeakAtMs,
      };
    }
    if (coolingDown) return idleAnnounce(input);
    return {
      kind: "advance",
      speakIndex: focusedIndex,
      lastSpokenIndex: focusedIndex,
      lastApproachIndex: input.lastApproachIndex,
      lastSpeakAtMs: input.nowMs,
    };
  }

  if (
    nextIndex != null &&
    input.remainingMeters != null &&
    input.remainingMeters <= YOUBIKE_NAV_APPROACH_METERS &&
    input.lastApproachIndex !== nextIndex
  ) {
    if (coolingDown) return idleAnnounce(input);
    return {
      kind: "approach",
      speakIndex: nextIndex,
      lastSpokenIndex: input.lastSpokenIndex,
      lastApproachIndex: nextIndex,
      lastSpeakAtMs: input.nowMs,
    };
  }

  return idleAnnounce(input);
}
