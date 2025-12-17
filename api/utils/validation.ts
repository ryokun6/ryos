/**
 * Input validation and sanitization utilities for chat-rooms API
 * Handles username/roomId validation, profanity checking, and HTML escaping
 */

import leoProfanity from "leo-profanity";

// ============================================================================
// Types
// ============================================================================

export type LogFn = (requestId: string, message: string, data?: unknown) => void;

// ============================================================================
// Constants
// ============================================================================

// Message constraints
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_USERNAME_LENGTH = 30;
export const MIN_USERNAME_LENGTH = 3;

// Usernames: 3-30 chars, start with a letter, letters/numbers,
// optional single hyphen/underscore between alphanumerics (no leading/trailing or consecutive separators)
// Examples: ok -> "alice", "john_doe", "foo-bar"; not ok -> "_joe", "joe_", "a--b", "a__b", "a b", "a@b"
export const USERNAME_REGEX = /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i;

// Room IDs generated internally are base-36 alphanumerics; still validate when received from client
export const ROOM_ID_REGEX = /^[a-z0-9]+$/i;

// ============================================================================
// Profanity Filter Initialization
// ============================================================================

// Initialize leo-profanity for stronger, substring-based checks
try {
  // Ensure a deterministic dictionary state
  leoProfanity.clearList();
  leoProfanity.loadDictionary("en");
  leoProfanity.add(["badword1", "badword2", "chink"]);
} catch {
  // Fail open; leo-profanity might not be loaded in some envs
}

// ============================================================================
// Logging Helpers (minimal - to be replaced by logging module imports)
// ============================================================================

let logInfoFn: LogFn = (requestId, message, data) => {
  console.log(`[${requestId}] INFO: ${message}`, data ?? "");
};

/**
 * Set custom logging function (called by chat-rooms.ts to inject its logger)
 */
export function setValidationLogger(logInfo: LogFn): void {
  logInfoFn = logInfo;
}

// ============================================================================
// Profanity Checking
// ============================================================================

/**
 * Robust username profanity check (substring-aware, simple leet bypasses)
 */
export function isProfaneUsername(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  
  // Collapse common separators to catch joined variations like f_u-c.k
  let normalized = lower.replace(/[\s_\-.]+/g, "");
  
  // Replace simple leetspeak characters to improve detection
  normalized = normalized
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/0/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");

  // 1) Use leo-profanity's own check first (word-aware)
  if (
    typeof leoProfanity?.check === "function" &&
    leoProfanity.check(normalized)
  ) {
    return true;
  }

  // 2) Substring fallback: flag if any dictionary term appears inside the username
  try {
    const dict =
      typeof leoProfanity?.list === "function" ? leoProfanity.list() : [];
    for (const term of dict) {
      if (term && term.length >= 3 && normalized.includes(term)) {
        return true;
      }
    }
  } catch {
    // Ignore errors
  }

  return false;
}

// ============================================================================
// HTML Escaping
// ============================================================================

const htmlEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Simple HTML-escaping to mitigate XSS when rendering messages
 */
export function escapeHTML(str: string = ""): string {
  return str.replace(/[&<>"']/g, (ch) => htmlEscapeMap[ch] || ch);
}

// ============================================================================
// Profanity Filtering for Content
// ============================================================================

/**
 * Helper: clean profanity to fixed '███' blocks (not per-character),
 * preserving input length semantics where possible
 */
export function cleanProfanityToTripleBlocks(text: string): string {
  try {
    const cleaned =
      typeof leoProfanity?.clean === "function"
        ? leoProfanity.clean(text, "█")
        : text;
    // Collapse any contiguous run of mask characters into a fixed triple block
    return cleaned.replace(/█+/g, "███");
  } catch {
    return text;
  }
}

interface UrlMatch {
  url: string;
  start: number;
  end: number;
}

/**
 * Filter profanity while preserving URLs (especially underscores in URLs)
 */
export function filterProfanityPreservingUrls(content: string): string {
  // URL regex pattern to match HTTP/HTTPS URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Extract URLs and their positions
  let match;
  const urlMatches: UrlMatch[] = [];

  while ((match = urlRegex.exec(content)) !== null) {
    urlMatches.push({
      url: match[1],
      start: match.index,
      end: match.index + match[1].length,
    });
  }

  // If no URLs found, apply profanity filter and collapse masks per word
  if (urlMatches.length === 0) {
    return cleanProfanityToTripleBlocks(content);
  }

  // Split content into URL and non-URL parts
  let result = "";
  let lastIndex = 0;

  for (const urlMatch of urlMatches) {
    // Add filtered non-URL part before this URL
    const beforeUrl = content.substring(lastIndex, urlMatch.start);
    result += cleanProfanityToTripleBlocks(beforeUrl);

    // Add the URL unchanged
    result += urlMatch.url;

    lastIndex = urlMatch.end;
  }

  // Add any remaining non-URL content after the last URL
  if (lastIndex < content.length) {
    const afterLastUrl = content.substring(lastIndex);
    result += cleanProfanityToTripleBlocks(afterLastUrl);
  }

  return result;
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate a username string. Throws on failure.
 */
export function assertValidUsername(
  username: string,
  requestId: string
): void {
  if (!USERNAME_REGEX.test(username)) {
    logInfoFn(
      requestId,
      `Invalid username format: ${username}. Must be 3-30 chars, start with a letter, contain only letters/numbers, and may use single '-' or '_' between characters (no spaces or symbols).`
    );
    throw new Error(
      "Invalid username: use 3-30 letters/numbers; '-' or '_' allowed between characters; no spaces or symbols"
    );
  }
}

/**
 * Validate a roomId string. Throws on failure.
 */
export function assertValidRoomId(roomId: string, requestId: string): void {
  if (!ROOM_ID_REGEX.test(roomId)) {
    logInfoFn(
      requestId,
      `Invalid roomId format: ${roomId}. Must match ${ROOM_ID_REGEX}`
    );
    throw new Error("Invalid room ID format");
  }
}

/**
 * Validate message content length
 */
export function isValidMessageLength(content: string): boolean {
  return content.length > 0 && content.length <= MAX_MESSAGE_LENGTH;
}

/**
 * Validate username length
 */
export function isValidUsernameLength(username: string): boolean {
  return (
    username.length >= MIN_USERNAME_LENGTH &&
    username.length <= MAX_USERNAME_LENGTH
  );
}



