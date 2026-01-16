/**
 * Input validation middleware for API routes
 */

import { z } from "zod";
import leoProfanity from "leo-profanity";
import { VALIDATION } from "../_lib/constants.js";
import { validationError, missingField, profanityDetected } from "../_lib/errors.js";
import { jsonError } from "../_lib/response.js";
import type { Handler } from "../_lib/types.js";

// =============================================================================
// Profanity Filter Initialization
// =============================================================================

try {
  leoProfanity.clearList();
  leoProfanity.loadDictionary("en");
  leoProfanity.add(["badword1", "badword2", "chink"]);
} catch {
  // Fail open if leo-profanity not loaded
}

// =============================================================================
// Username Validation
// =============================================================================

/**
 * Robust username profanity check (substring-aware, simple leet bypasses)
 */
export function isProfaneUsername(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  
  // Collapse common separators to catch joined variations
  let normalized = lower.replace(/[\s_\-.]+/g, "");
  
  // Replace simple leetspeak characters
  normalized = normalized
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/0/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");

  // Use leo-profanity's check
  if (
    typeof leoProfanity?.check === "function" &&
    leoProfanity.check(normalized)
  ) {
    return true;
  }

  // Substring fallback
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

/**
 * Validate username format
 * Returns error message if invalid, null if valid
 */
export function validateUsername(username: string): string | null {
  if (!username) {
    return "Username is required";
  }
  
  if (username.length < VALIDATION.USERNAME.MIN_LENGTH) {
    return `Username must be at least ${VALIDATION.USERNAME.MIN_LENGTH} characters`;
  }
  
  if (username.length > VALIDATION.USERNAME.MAX_LENGTH) {
    return `Username must be ${VALIDATION.USERNAME.MAX_LENGTH} characters or less`;
  }
  
  if (!VALIDATION.USERNAME.REGEX.test(username)) {
    return "Username must start with a letter and contain only letters, numbers, hyphens, or underscores";
  }
  
  if (isProfaneUsername(username)) {
    return "Username contains inappropriate language";
  }
  
  return null;
}

/**
 * Validate username and throw if invalid
 */
export function assertValidUsername(username: string): void {
  const error = validateUsername(username);
  if (error) {
    throw validationError(error);
  }
}

// =============================================================================
// Password Validation
// =============================================================================

/**
 * Validate password format
 */
export function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required";
  }
  
  if (password.length < VALIDATION.PASSWORD.MIN_LENGTH) {
    return `Password must be at least ${VALIDATION.PASSWORD.MIN_LENGTH} characters`;
  }
  
  if (password.length > VALIDATION.PASSWORD.MAX_LENGTH) {
    return `Password must be ${VALIDATION.PASSWORD.MAX_LENGTH} characters or less`;
  }
  
  return null;
}

/**
 * Validate password and throw if invalid
 */
export function assertValidPassword(password: string): void {
  const error = validatePassword(password);
  if (error) {
    throw validationError(error);
  }
}

// =============================================================================
// Room ID Validation
// =============================================================================

/**
 * Validate room ID format
 */
export function validateRoomId(roomId: string): string | null {
  if (!roomId) {
    return "Room ID is required";
  }
  
  if (!VALIDATION.ROOM_ID.REGEX.test(roomId)) {
    return "Invalid room ID format";
  }
  
  return null;
}

/**
 * Validate room ID and throw if invalid
 */
export function assertValidRoomId(roomId: string): void {
  const error = validateRoomId(roomId);
  if (error) {
    throw validationError(error);
  }
}

// =============================================================================
// Message Validation
// =============================================================================

/**
 * Validate message content
 */
export function validateMessageContent(content: string): string | null {
  if (!content || content.trim().length === 0) {
    return "Message content is required";
  }
  
  if (content.length > VALIDATION.MESSAGE.MAX_LENGTH) {
    return `Message must be ${VALIDATION.MESSAGE.MAX_LENGTH} characters or less`;
  }
  
  return null;
}

// =============================================================================
// Content Sanitization
// =============================================================================

const htmlEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape HTML characters
 */
export function escapeHTML(str: string = ""): string {
  return str.replace(/[&<>"']/g, (ch) => htmlEscapeMap[ch] || ch);
}

/**
 * Clean profanity to triple blocks
 */
export function cleanProfanity(text: string): string {
  try {
    const cleaned =
      typeof leoProfanity?.clean === "function"
        ? leoProfanity.clean(text, "█")
        : text;
    return cleaned.replace(/█+/g, "███");
  } catch {
    return text;
  }
}

/**
 * Filter profanity while preserving URLs
 */
export function filterProfanityPreservingUrls(content: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  let match;
  const urlMatches: { url: string; start: number; end: number }[] = [];

  while ((match = urlRegex.exec(content)) !== null) {
    urlMatches.push({
      url: match[1],
      start: match.index,
      end: match.index + match[1].length,
    });
  }

  if (urlMatches.length === 0) {
    return cleanProfanity(content);
  }

  let result = "";
  let lastIndex = 0;

  for (const urlMatch of urlMatches) {
    const beforeUrl = content.substring(lastIndex, urlMatch.start);
    result += cleanProfanity(beforeUrl);
    result += urlMatch.url;
    lastIndex = urlMatch.end;
  }

  if (lastIndex < content.length) {
    const afterLastUrl = content.substring(lastIndex);
    result += cleanProfanity(afterLastUrl);
  }

  return result;
}

// =============================================================================
// Zod Validation Helper
// =============================================================================

/**
 * Validate request body with Zod schema
 */
export async function validateBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T>; error: null } | { data: null; error: z.ZodError }> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    
    if (result.success) {
      return { data: result.data, error: null };
    }
    
    return { data: null, error: result.error };
  } catch {
    return { 
      data: null, 
      error: new z.ZodError([{ 
        code: "custom", 
        path: [], 
        message: "Invalid JSON body" 
      }]) 
    };
  }
}

/**
 * Validate query parameters with Zod schema
 */
export function validateQuery<T extends z.ZodType>(
  url: URL,
  schema: T
): { data: z.infer<T>; error: null } | { data: null; error: z.ZodError } {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  
  const result = schema.safeParse(params);
  
  if (result.success) {
    return { data: result.data, error: null };
  }
  
  return { data: null, error: result.error };
}

// =============================================================================
// Middleware Wrapper
// =============================================================================

export interface WithValidationOptions<T extends z.ZodType> {
  schema: T;
  source: "body" | "query";
}

/**
 * Wrap a handler with body/query validation
 */
export function withValidation<T extends z.ZodType>(
  handler: (req: Request, data: z.infer<T>) => Promise<Response>,
  options: WithValidationOptions<T>
): Handler {
  return async (req: Request): Promise<Response> => {
    let result: { data: z.infer<T> | null; error: z.ZodError | null };

    if (options.source === "body") {
      result = await validateBody(req, options.schema);
    } else {
      const url = new URL(req.url);
      result = validateQuery(url, options.schema);
    }

    if (result.error) {
      return jsonError(validationError("Validation failed", result.error.format()));
    }

    return handler(req, result.data);
  };
}
