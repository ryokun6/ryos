export const AI_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const AI_ATTACHMENT_MAX_COUNT_PER_USER = 128;
export const AI_ATTACHMENT_MAX_TOTAL_BYTES_PER_USER = 256 * 1024 * 1024;
export const AI_ATTACHMENT_UNATTACHED_GRACE_MS = 60 * 60 * 1000;
export const AI_ATTACHMENT_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AIAttachmentMediaType =
  (typeof AI_ATTACHMENT_MEDIA_TYPES)[number];

const ATTACHMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTACHMENT_PATH_PREFIX = "/api/ai/attachments/";

export function isAIAttachmentMediaType(
  value: unknown
): value is AIAttachmentMediaType {
  return (
    typeof value === "string" &&
    AI_ATTACHMENT_MEDIA_TYPES.some((mediaType) => mediaType === value)
  );
}

export function isAIAttachmentId(value: unknown): value is string {
  return typeof value === "string" && ATTACHMENT_ID_PATTERN.test(value);
}

export function getAIAttachmentUrl(attachmentId: string): string {
  return `${ATTACHMENT_PATH_PREFIX}${attachmentId}`;
}

export function getAIAttachmentIdFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;

  try {
    const parsed = new URL(value, "https://ryos.invalid");
    if (!parsed.pathname.startsWith(ATTACHMENT_PATH_PREFIX)) return null;
    const attachmentId = parsed.pathname.slice(ATTACHMENT_PATH_PREFIX.length);
    if (
      attachmentId.includes("/") ||
      parsed.search ||
      parsed.hash ||
      !isAIAttachmentId(attachmentId)
    ) {
      return null;
    }
    return attachmentId.toLowerCase();
  } catch {
    return null;
  }
}

export interface AIAttachmentRecord {
  version: 1;
  id: string;
  storageUrl: string;
  mediaType: AIAttachmentMediaType;
  size: number;
  sha256: string;
  filename?: string;
  createdAt: string;
}
