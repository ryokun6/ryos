import type { AgentData } from "./ClippySprite";
import type { AssistantCharacterId } from "./characters";

export type AssistantAnimationIntent =
  | "greeting"
  | "thinking"
  | "processing"
  | "searching"
  | "reading"
  | "writing"
  | "success"
  | "error"
  | "attention"
  | "goodbye"
  | "idle";

export type AssistantToolPhase = "running" | "complete" | "error";

export interface AssistantToolActivity {
  name: string;
  phase: AssistantToolPhase;
}

const ANIMATION_CANDIDATES = {
  greeting: [
    "Greeting",
    "Greet",
    "Show",
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
    "Show",
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
    "Show",
    "Wave",
    "Acknowledge",
    "Announce",
    "GestureUp",
    "GestureLeft",
    "GestureRight",
    "GestureDown",
  ],
  goodbye: ["GoodBye", "Goodbye", "Hide", "HideQuick"],
  idle: ["RestPose"],
} satisfies Record<AssistantAnimationIntent, readonly string[]>;

const SEARCH_TOOL_NAMES = new Set([
  "list",
  "searchSongs",
  "songLibrary",
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

export function getAnimationTotalDuration(
  data: AgentData,
  animationName: string
): number {
  const animation = data.animations[animationName];
  if (!animation) return 0;
  return animation.frames.reduce(
    (total, frame) => total + (frame.duration ?? 0),
    0
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

/** Prepended when a specific tool is actively running. */
const TOOL_SPECIFIC_ANIMATIONS: Record<string, readonly string[]> = {
  mediaControl: ["Hearing_1", "StartListening"],
  launchApp: ["Show", "GetAttention"],
  closeApp: ["Hide", "Goodbye", "GoodBye"],
  switchTheme: ["GetWizardy", "DoMagic1", "DoMagic2"],
  generateHtml: ["DoMagic1", "GetWizardy"],
};

/** Rover-only topic animations keyed by active tool name. */
const ROVER_TOOL_ANIMATIONS: Record<string, readonly string[]> = {
  mapsSearchPlaces: ["Travel"],
  searchSongs: ["Celebrity"],
  songLibrary: ["Sports"],
  list: ["Books"],
  read: ["Books"],
  write: ["Writing"],
  edit: ["Writing"],
  webFetch: ["Searching"],
  mediaControl: ["Sports"],
};

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

  return dedupeCandidates(candidates);
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
}: {
  isLoading: boolean;
  hasError: boolean;
  toolActivity: AssistantToolActivity | null;
}): AssistantAnimationIntent {
  if (hasError || toolActivity?.phase === "error") return "error";
  if (!isLoading) return "idle";
  if (toolActivity?.phase === "running") {
    return getToolAnimationIntent(toolActivity.name);
  }
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
