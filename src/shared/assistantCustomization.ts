/**
 * Shared desktop-assistant behavior customization: the response-style presets
 * and custom-instruction limits used by the settings UI, plus the sanitized
 * system-prompt addon `/api/chat` injects for the assistant channel. Kept
 * pure so both the client store and the API can import it and tests can
 * exercise the prompt assembly directly.
 */
import { replaceControlCharacters } from "./sanitizeControlCharacters";

export const ASSISTANT_RESPONSE_STYLES = [
  "concise",
  "normal",
  "chatty",
] as const;

export type AssistantResponseStyle = (typeof ASSISTANT_RESPONSE_STYLES)[number];

export const DEFAULT_ASSISTANT_RESPONSE_STYLE: AssistantResponseStyle =
  "normal";

/** Hard cap for user-written behavior instructions (client and server). */
export const ASSISTANT_INSTRUCTIONS_MAX_LENGTH = 500;

const ASSISTANT_NAME_MAX_LENGTH = 40;

export function isAssistantResponseStyle(
  value: unknown
): value is AssistantResponseStyle {
  return (
    typeof value === "string" &&
    (ASSISTANT_RESPONSE_STYLES as readonly string[]).includes(value)
  );
}

/** Coerce arbitrary input (persisted/synced/request body) to a valid style. */
export function normalizeAssistantResponseStyle(
  value: unknown
): AssistantResponseStyle {
  return isAssistantResponseStyle(value)
    ? value
    : DEFAULT_ASSISTANT_RESPONSE_STYLE;
}

/** Strip control characters, collapse whitespace runs, and cap the length. */
export function sanitizeAssistantInstructions(value: unknown): string {
  if (typeof value !== "string") return "";
  return replaceControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ASSISTANT_INSTRUCTIONS_MAX_LENGTH);
}

function sanitizeAssistantName(value: string): string {
  return value
    .replace(/[^\p{L}\p{N} _'-]/gu, "")
    .slice(0, ASSISTANT_NAME_MAX_LENGTH);
}

const RESPONSE_STYLE_PROMPTS: Record<AssistantResponseStyle, string> = {
  concise:
    "The user prefers concise replies: answer in one short sentence whenever possible and skip pleasantries.",
  normal: "",
  chatty:
    "The user prefers chatty replies: feel free to use 3-4 sentences with a playful aside, while staying on topic.",
};

export interface AssistantCustomization {
  /** Display name of the chosen assistant character. */
  assistantName?: string;
  responseStyle?: AssistantResponseStyle;
  /** Free-form user instructions from Assistant settings → Behavior. */
  instructions?: string;
}

/**
 * Build the assistant-channel system prompt addon (appended to the static
 * channel prompt). Returns "" when there is nothing to inject. All inputs are
 * sanitized here so callers can pass request-body values directly.
 */
export function buildAssistantCustomizationAddon({
  assistantName,
  responseStyle,
  instructions,
}: AssistantCustomization): string {
  const sections: string[] = [];

  const name = assistantName ? sanitizeAssistantName(assistantName) : "";
  if (name) {
    sections.push(
      `## YOUR NAME\nThe user has chosen the "${name}" assistant character. Your name is ${name}.`
    );
  }

  const stylePrompt =
    RESPONSE_STYLE_PROMPTS[normalizeAssistantResponseStyle(responseStyle)];
  if (stylePrompt) {
    sections.push(`## RESPONSE LENGTH\n${stylePrompt}`);
  }

  const sanitizedInstructions = sanitizeAssistantInstructions(instructions);
  if (sanitizedInstructions) {
    sections.push(
      `## USER CUSTOM INSTRUCTIONS\nThe user set these standing instructions for you in Assistant settings. Follow them as long as they do not conflict with the rules above:\n${sanitizedInstructions}`
    );
  }

  if (sections.length === 0) return "";
  return `\n\n${sections.join("\n\n")}`;
}
