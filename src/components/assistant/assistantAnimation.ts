import type { AgentData } from "./ClippySprite";
import type { AssistantCharacterId } from "./characters";

export type AssistantAnimationIntent =
  | "greeting"
  | "thinking"
  | "speaking"
  | "processing"
  | "searching"
  | "reading"
  | "writing"
  | "success"
  | "error"
  | "attention"
  | "acknowledge"
  | "goodbye"
  | "idle";

export type AssistantAnimationLifecycleEvent =
  | "characterLoad"
  | "bubbleOpen"
  | "bubbleClose"
  | "quit";

export type AssistantToolPhase = "running" | "complete" | "error";

export interface AssistantToolActivity {
  name: string;
  phase: AssistantToolPhase;
}

const ENTRANCE_ANIMATION_CANDIDATES = [
  "Show",
  "Appear",
  "AppearQuick",
  "Entrance",
] as const;
const EXIT_ANIMATION_CANDIDATES = [
  "GoodBye",
  "Goodbye",
  "Hide",
  "HideQuick",
] as const;

const ANIMATION_CANDIDATES = {
  // Entrance clips (Show/Appear/…) are intentionally NOT candidates here:
  // they only play through the dedicated entrance sequence plan, so a random
  // greeting pick can never replay the character's entry animation.
  greeting: [
    "Greeting",
    "Greet",
    "Wave",
    "Announce",
    "GetAttention",
  ],
  thinking: [
    "Thinking",
    "Think",
    "CheckingSomething",
    "Processing",
    "Process",
    "Explain",
    "Suggest",
    "GetWizardy",
    "Hearing_1",
  ],
  // Conversational gestures while reply text is streaming in.
  speaking: [
    "Explain",
    "Announce",
    "Suggest",
    "Acknowledge",
    "Pleased",
    "GestureUp",
  ],
  processing: [
    "Processing",
    "Process",
    "DoMagic1",
    "DoMagic2",
    "GetTechy",
    "GetArtsy",
    "GetWizardy",
    "Explain",
    "Thinking",
    "Think",
  ],
  searching: [
    "Searching",
    "Search",
    "ImageSearching",
    "CheckingSomething",
    "Thinking",
    "Think",
  ],
  reading: [
    "Reading",
    "Read",
    "CheckingSomething",
    "Thinking",
    "Think",
  ],
  writing: [
    "Writing",
    "Write",
    "Processing",
    "Process",
    "Thinking",
    "Think",
  ],
  success: [
    "Congratulate",
    "Congratulate_2",
    "CharacterSucceeds",
    "Pleased",
    "Acknowledge",
    "Wave",
  ],
  error: [
    "Sad",
    "Confused",
    "DontRecognize",
    "Uncertain",
    "Decline",
    "Alert",
    "Embarrassed",
    "Surprised",
  ],
  attention: [
    "ClickedOn",
    "GetAttentionMinor",
    "GetAttention",
    "Wave",
    "Acknowledge",
    "Announce",
    "GestureUp",
    "GestureLeft",
    "GestureRight",
    "GestureDown",
  ],
  // Brief nod: bubble dismissal and mid-turn tool completions.
  acknowledge: ["Acknowledge", "Pleased", "GestureDown", "Blink"],
  goodbye: EXIT_ANIMATION_CANDIDATES,
  idle: ["RestPose"],
} satisfies Record<AssistantAnimationIntent, readonly string[]>;

const ENTRANCE_ANIMATION_NAMES = new Set<string>(
  ENTRANCE_ANIMATION_CANDIDATES
);
const EXIT_ANIMATION_NAMES = new Set<string>(EXIT_ANIMATION_CANDIDATES);

export function isAssistantEntranceAnimation(animationName: string): boolean {
  return ENTRANCE_ANIMATION_NAMES.has(animationName);
}

function isAssistantExitAnimation(animationName: string): boolean {
  return EXIT_ANIMATION_NAMES.has(animationName);
}

export function getAssistantLifecycleAnimationIntent(
  event: AssistantAnimationLifecycleEvent
): AssistantAnimationIntent | null {
  const intents = {
    characterLoad: "greeting",
    bubbleOpen: "attention",
    bubbleClose: "acknowledge",
    quit: "goodbye",
  } satisfies Record<
    AssistantAnimationLifecycleEvent,
    AssistantAnimationIntent | null
  >;
  return intents[event];
}

const SEARCH_TOOL_NAMES = new Set([
  "list",
  "searchSongs",
  "songLibraryControl",
  "webFetch",
  "mapsSearchPlaces",
  "listCursorCloudAgentRuns",
]);

const READ_TOOL_NAMES = new Set(["read", "memoryRead", "open"]);

const WRITE_TOOL_NAMES = new Set([
  "write",
  "edit",
  "generateHtml",
  "memoryWrite",
  "memoryDelete",
  "stickiesControl",
  "documentsControl",
]);

/**
 * Tools that play multi-part read/write animation sequences (applet + TextEdit).
 * - read: fetches /Applets/, /Documents/, /Applets Store/ content
 * - write: creates/updates TextEdit documents under /Documents/
 * - edit: patches /Documents/ or /Applets/ files
 * - generateHtml: creates/overwrites HTML applets (server-side)
 *
 * Other read/write-ish tools (open, list, memoryRead, memoryWrite) keep the
 * single-animation intent path only.
 */
export const READ_SEQUENCE_TOOL_NAMES = new Set(["read"]);

export const WRITE_SEQUENCE_TOOL_NAMES = new Set([
  "write",
  "edit",
  "generateHtml",
]);

/** Skip ReadContinued / WriteContinued when total runtime exceeds this. */
const MAX_CONTINUED_ANIMATION_MS = 3500;

const READ_INTRO_CANDIDATES = ["Reading", "Read"] as const;
const WRITE_INTRO_CANDIDATES = ["Writing", "Write"] as const;
const READ_RETURN_CANDIDATES = ["ReadReturn", "RestPose"] as const;
const WRITE_RETURN_CANDIDATES = ["WriteReturn", "RestPose"] as const;

export interface DocumentToolSequencePlan {
  kind: "read" | "write";
  intro: string;
  /** Middle hold loop while the tool is still running; omitted when unavailable or too long. */
  continued: string | null;
  returnAnim: string;
}

export function isDocumentSequenceTool(toolName: string): boolean {
  return (
    READ_SEQUENCE_TOOL_NAMES.has(toolName) ||
    WRITE_SEQUENCE_TOOL_NAMES.has(toolName)
  );
}

export function getDocumentToolSequenceKind(
  toolName: string
): "read" | "write" | null {
  if (READ_SEQUENCE_TOOL_NAMES.has(toolName)) return "read";
  if (WRITE_SEQUENCE_TOOL_NAMES.has(toolName)) return "write";
  return null;
}

function pickFirstAvailableAnimation(
  data: AgentData,
  candidates: readonly string[]
): string | null {
  for (const name of candidates) {
    if (data.animations[name] !== undefined) return name;
  }
  return null;
}

export interface AssistantEntranceSequencePlan {
  first: string;
  followUp: string | null;
}

/**
 * Follow-up gestures that continue from the visible rest pose. "Greeting" is
 * intentionally absent: Microsoft Agent "Greeting" clips are alternate
 * entrances whose first frames are (nearly) empty, so chaining one after Show
 * pops the character in, blanks it, and materializes it a second time.
 */
const ENTRANCE_FOLLOW_UP_CANDIDATES = [
  "Greet",
  "Wave",
  "GetAttention",
  "Announce",
] as const;

/**
 * Prefer the agent's real entrance clip, then a separate greeting gesture.
 * Characters without an entrance clip appear in their static default pose.
 */
export function resolveAssistantEntranceSequencePlan(
  data: AgentData
): AssistantEntranceSequencePlan | null {
  const entrance = pickFirstAvailableAnimation(
    data,
    ENTRANCE_ANIMATION_CANDIDATES
  );
  const greeting = pickFirstAvailableAnimation(
    data,
    ENTRANCE_FOLLOW_UP_CANDIDATES
  );

  if (entrance) {
    return { first: entrance, followUp: greeting };
  }

  return { first: "RestPose", followUp: null };
}

export function getAnimationTotalDuration(
  data: AgentData,
  animationName: string
): number {
  const animation = data.animations[animationName];
  if (!animation) return 0;
  return animation.frames.reduce((total, frame) => {
    const duration = frame.duration;
    const validDuration =
      typeof duration === "number" &&
      Number.isFinite(duration) &&
      duration > 0
        ? duration
        : 0;
    return total + validDuration;
  }, 0);
}

const DEFAULT_EXIT_ANIMATION_TIMEOUT_MS = 500;
const EXIT_ANIMATION_TIMEOUT_BUFFER_MS = 250;
const MAX_EXIT_ANIMATION_TIMEOUT_MS = 10_000;

/**
 * Safety timeout for exit clips. Normal completion unmounts sooner via the
 * sprite callback; this cap handles malformed or endlessly branching data.
 */
export function getAssistantExitAnimationTimeout(
  data: AgentData,
  animationName: string
): number {
  const duration = getAnimationTotalDuration(data, animationName);
  if (duration <= 0) return DEFAULT_EXIT_ANIMATION_TIMEOUT_MS;
  return Math.min(
    Math.max(
      duration + EXIT_ANIMATION_TIMEOUT_BUFFER_MS,
      DEFAULT_EXIT_ANIMATION_TIMEOUT_MS
    ),
    MAX_EXIT_ANIMATION_TIMEOUT_MS
  );
}

/**
 * Resolve an ordered read/write sequence for the current character.
 * Returns null when no intro animation exists (caller falls back to single pick).
 */
export function resolveDocumentToolSequencePlan(
  data: AgentData,
  kind: "read" | "write"
): DocumentToolSequencePlan | null {
  const intro = pickFirstAvailableAnimation(
    data,
    kind === "read" ? READ_INTRO_CANDIDATES : WRITE_INTRO_CANDIDATES
  );
  if (!intro) return null;

  const continuedName = kind === "read" ? "ReadContinued" : "WriteContinued";
  let continued: string | null = null;
  if (data.animations[continuedName] !== undefined) {
    const duration = getAnimationTotalDuration(data, continuedName);
    if (duration <= MAX_CONTINUED_ANIMATION_MS) {
      continued = continuedName;
    }
  }

  const returnAnim =
    pickFirstAvailableAnimation(
      data,
      kind === "read" ? READ_RETURN_CANDIDATES : WRITE_RETURN_CANDIDATES
    ) ?? "RestPose";

  return { kind, intro, continued, returnAnim };
}

/** Idle loops that are too long for ambient rotation. */
const MEGA_IDLE_ANIMATIONS = new Set(["Idle"]);

/**
 * Prepended when a specific tool is actively running. Entrance/exit clips
 * (Show, Hide, GoodBye, …) are not usable here — `getAnimationCandidates`
 * filters them out for every non-lifecycle intent.
 */
const TOOL_SPECIFIC_ANIMATIONS: Record<string, readonly string[]> = {
  mediaControl: ["Hearing_1", "StartListening"],
  launchApp: ["GetAttention", "Announce"],
  closeApp: ["Wave", "GestureDown"],
  settings: ["GetWizardy", "DoMagic1", "DoMagic2"],
  generateHtml: ["DoMagic1", "GetWizardy"],
  aquarium: ["DoMagic1", "GetArtsy"],
  infiniteMacControl: ["GetTechy", "DoMagic1"],
  cursorCloudAgent: ["GetTechy", "Writing"],
};

/** Rover-only topic animations keyed by active tool name. */
const ROVER_TOOL_ANIMATIONS: Record<string, readonly string[]> = {
  mapsSearchPlaces: ["Travel"],
  searchSongs: ["Celebrity"],
  songLibraryControl: ["Sports"],
  list: ["Books"],
  read: ["Books"],
  write: ["Writing"],
  edit: ["Writing"],
  webFetch: ["Searching"],
  mediaControl: ["Sports"],
};

/**
 * Every tool name the animation layer references. Exists so tests can assert
 * these stay in sync with the real tool registry (`api/chat/tools`) — tool
 * renames silently killed animations before (e.g. switchTheme → settings).
 */
export function getAssistantAnimationMappedToolNames(): string[] {
  return [
    ...new Set([
      ...SEARCH_TOOL_NAMES,
      ...READ_TOOL_NAMES,
      ...WRITE_TOOL_NAMES,
      ...READ_SEQUENCE_TOOL_NAMES,
      ...WRITE_SEQUENCE_TOOL_NAMES,
      ...Object.keys(TOOL_SPECIFIC_ANIMATIONS),
      ...Object.keys(ROVER_TOOL_ANIMATIONS),
    ]),
  ];
}

const EXTRA_IDLE_CANDIDATES = [
  "LookLeft",
  "LookRight",
  "LookUp",
  "LookDown",
  "GetAttentionMinor",
  "Blink",
] as const;

function dedupeCandidates(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of candidates) {
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

export function getAnimationCandidates(
  intent: AssistantAnimationIntent,
  options?: {
    characterId?: AssistantCharacterId;
    toolName?: string;
  }
): readonly string[] {
  let candidates: readonly string[] = ANIMATION_CANDIDATES[intent];

  if (options?.toolName && TOOL_SPECIFIC_ANIMATIONS[options.toolName]) {
    candidates = [
      ...TOOL_SPECIFIC_ANIMATIONS[options.toolName],
      ...candidates,
    ];
  }

  if (
    options?.characterId === "rover" &&
    options?.toolName &&
    ROVER_TOOL_ANIMATIONS[options.toolName]
  ) {
    candidates = [
      ...ROVER_TOOL_ANIMATIONS[options.toolName],
      ...candidates,
    ];
  }

  // Entrance clips only ever play via the entrance sequence plan; exit clips
  // only via the quit flow. Filtering both here guarantees a random pick can
  // never duplicate the entry animation or hide the character mid-session.
  return dedupeCandidates(candidates).filter(
    (name) =>
      !isAssistantEntranceAnimation(name) &&
      (intent === "goodbye" || !isAssistantExitAnimation(name))
  );
}

export function getToolAnimationIntent(
  toolName: string
): "searching" | "reading" | "writing" | "processing" {
  if (SEARCH_TOOL_NAMES.has(toolName)) return "searching";
  if (READ_TOOL_NAMES.has(toolName)) return "reading";
  if (WRITE_TOOL_NAMES.has(toolName)) return "writing";
  return "processing";
}

export function getAssistantAnimationIntent({
  isLoading,
  hasError,
  toolActivity,
  hasVisibleReply = false,
}: {
  isLoading: boolean;
  hasError: boolean;
  toolActivity: AssistantToolActivity | null;
  /** True once the in-flight turn has streamed visible reply text. */
  hasVisibleReply?: boolean;
}): AssistantAnimationIntent {
  if (hasError || toolActivity?.phase === "error") return "error";
  if (!isLoading) return "idle";
  if (toolActivity?.phase === "running") {
    return getToolAnimationIntent(toolActivity.name);
  }
  if (hasVisibleReply) return "speaking";
  return "thinking";
}

export function getAvailableAnimations(
  data: AgentData,
  intent: AssistantAnimationIntent,
  options?: {
    characterId?: AssistantCharacterId;
    toolName?: string;
  }
): string[] {
  return getAnimationCandidates(intent, options).filter(
    (name) => data.animations[name] !== undefined
  );
}

export function getIdleAnimationPool(data: AgentData): string[] {
  return [
    ...Object.keys(data.animations).filter(
      (name) =>
        name.toLowerCase().startsWith("idle") &&
        !MEGA_IDLE_ANIMATIONS.has(name) &&
        !name.toLowerCase().startsWith("deepidle")
    ),
    ...EXTRA_IDLE_CANDIDATES.filter(
      (name) => data.animations[name] !== undefined
    ),
  ];
}

/** Continuous idle time after which deep-idle (sleep) clips become eligible. */
export const DEEP_IDLE_AFTER_MS = 2 * 60 * 1000;

/**
 * Long "falls asleep" clips reserved for prolonged inactivity. Not every
 * character ships DeepIdle clips; callers fall back to the ambient pool.
 */
export function getDeepIdleAnimationPool(data: AgentData): string[] {
  return Object.keys(data.animations).filter((name) =>
    name.toLowerCase().startsWith("deepidle")
  );
}

// --- Pointing / directional attention ---------------------------------------

export type AssistantPointingDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "upLeft"
  | "upRight"
  | "downLeft"
  | "downRight";

/**
 * Microsoft Agent Gesture and Look clip names use the viewer's screen
 * perspective (GestureLeft points toward the left edge of the screen).
 * Diagonal Look clips exist on some characters only, so each diagonal falls
 * back to its horizontal and vertical components.
 */
const POINTING_ANIMATION_CANDIDATES: Record<
  AssistantPointingDirection,
  readonly string[]
> = {
  left: ["GestureLeft", "LookLeft"],
  right: ["GestureRight", "LookRight"],
  up: ["GestureUp", "LookUp"],
  down: ["GestureDown", "LookDown"],
  upLeft: ["LookUpLeft", "GestureLeft", "LookLeft", "LookUp"],
  upRight: ["LookUpRight", "GestureRight", "LookRight", "LookUp"],
  downLeft: ["LookDownLeft", "GestureLeft", "LookLeft", "LookDown"],
  downRight: ["LookDownRight", "GestureRight", "LookRight", "LookDown"],
};

export interface AssistantPointingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Center-to-center offsets below this are too small to point at. */
const POINTING_MIN_OFFSET_PX = 48;
/** Secondary-axis share of the primary axis that upgrades to a diagonal. */
const POINTING_DIAGONAL_RATIO = 0.5;

/**
 * Direction from the assistant toward a target window, from the viewer's
 * perspective. Returns null when the target is too close to point at.
 */
export function getAssistantPointingDirection(
  assistant: AssistantPointingRect,
  target: AssistantPointingRect
): AssistantPointingDirection | null {
  const dx =
    target.x + target.width / 2 - (assistant.x + assistant.width / 2);
  const dy =
    target.y + target.height / 2 - (assistant.y + assistant.height / 2);
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < POINTING_MIN_OFFSET_PX && absY < POINTING_MIN_OFFSET_PX) {
    return null;
  }

  const horizontal: AssistantPointingDirection = dx < 0 ? "left" : "right";
  const vertical: AssistantPointingDirection = dy < 0 ? "up" : "down";
  const diagonal: AssistantPointingDirection =
    vertical === "up"
      ? horizontal === "left"
        ? "upLeft"
        : "upRight"
      : horizontal === "left"
        ? "downLeft"
        : "downRight";

  if (absX >= absY) {
    const isDiagonal =
      absY >= POINTING_MIN_OFFSET_PX && absY >= absX * POINTING_DIAGONAL_RATIO;
    return isDiagonal ? diagonal : horizontal;
  }
  const isDiagonal =
    absX >= POINTING_MIN_OFFSET_PX && absX >= absY * POINTING_DIAGONAL_RATIO;
  return isDiagonal ? diagonal : vertical;
}

/**
 * Best available pointing/look clip toward a direction, or null when the
 * character has none (e.g. Rover lacks right-facing clips).
 */
export function selectAssistantPointingAnimation(
  data: AgentData,
  direction: AssistantPointingDirection
): string | null {
  return pickFirstAvailableAnimation(
    data,
    POINTING_ANIMATION_CANDIDATES[direction]
  );
}

export function selectAssistantAnimation({
  data,
  intent,
  characterId,
  toolName,
  randomValue = Math.random(),
}: {
  data: AgentData;
  intent: AssistantAnimationIntent;
  characterId?: AssistantCharacterId;
  toolName?: string;
  randomValue?: number;
}): string {
  const available = getAvailableAnimations(data, intent, {
    characterId,
    toolName,
  });
  const fallback =
    data.animations.RestPose !== undefined
      ? "RestPose"
      : Object.keys(data.animations)[0] ?? "";
  if (available.length === 0) return fallback;

  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.999999)
    : 0;
  return available[Math.floor(boundedRandom * available.length)] ?? fallback;
}
