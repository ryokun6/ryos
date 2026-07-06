export const AI_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

export const AI_ATTACHMENT_MEDIA_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AIAttachmentMediaType = keyof typeof AI_ATTACHMENT_MEDIA_TYPES;

const ATTACHMENT_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\.(jpg|png|webp))?$/i;
const ATTACHMENT_URL_PREFIX = "/api/ai/attachments/";

export function isAIAttachmentMediaType(
  value: unknown
): value is AIAttachmentMediaType {
  return (
    typeof value === "string" &&
    Object.hasOwn(AI_ATTACHMENT_MEDIA_TYPES, value)
  );
}

export function createAIAttachmentName(
  id: string,
  mediaType: AIAttachmentMediaType
): string {
  return `${id}.${AI_ATTACHMENT_MEDIA_TYPES[mediaType]}`;
}

export function parseAIAttachmentName(value: unknown): {
  name: string;
  mediaType: AIAttachmentMediaType | null;
} | null {
  if (typeof value !== "string") return null;
  const match = ATTACHMENT_PATTERN.exec(value);
  if (!match) return null;
  const extension = match[2]?.toLowerCase();
  const mediaType =
    extension === "jpg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : null;
  return { name: value.toLowerCase(), mediaType };
}

export function getAIAttachmentUrl(name: string): string {
  return `${ATTACHMENT_URL_PREFIX}${name}`;
}

export function parseAIAttachmentUrl(value: unknown): {
  name: string;
  mediaType: AIAttachmentMediaType | null;
} | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value, "https://ryos.invalid");
    if (
      !url.pathname.startsWith(ATTACHMENT_URL_PREFIX) ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return parseAIAttachmentName(url.pathname.slice(ATTACHMENT_URL_PREFIX.length));
  } catch {
    return null;
  }
}
