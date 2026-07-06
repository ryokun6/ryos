import type { UIMessage } from "ai";
import type { RedisLike } from "../../../_utils/redis.js";
import {
  deleteStoredObject,
  downloadPrivateStoredObjectByPathname,
  uploadPrivateStoredObject,
} from "../../../_utils/storage.js";
import {
  AI_ATTACHMENT_MAX_BYTES,
  createAIAttachmentName,
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
  parseAIAttachmentUrl,
  type AIAttachmentMediaType,
} from "../../../../src/shared/contracts/aiAttachment.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";

const MAX_STORED_ATTACHMENTS = 512;
const MAX_MODEL_IMAGES = 4;
const MAX_MODEL_IMAGE_BYTES = 10 * 1024 * 1024;

export function getAIAttachmentPath(username: string, name: string): string {
  return `ai/${username.toLowerCase()}/attachments/${name}`;
}

function hasImageSignature(
  bytes: Uint8Array,
  mediaType: AIAttachmentMediaType
): boolean {
  if (mediaType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export async function createAIAttachment({
  redis,
  username,
  mediaType,
  bytes,
}: {
  redis: RedisLike;
  username: string;
  mediaType: unknown;
  bytes: Uint8Array;
}): Promise<{ mediaType: AIAttachmentMediaType; url: string }> {
  if (
    !isAIAttachmentMediaType(mediaType) ||
    bytes.byteLength <= 0 ||
    bytes.byteLength > AI_ATTACHMENT_MAX_BYTES ||
    !hasImageSignature(bytes, mediaType)
  ) {
    throw new Error("invalid_image");
  }

  const indexKey = redisKeys.chat.aiAttachments(username);
  const stored = await redis.smembers<string[]>(indexKey);
  if (stored.length >= MAX_STORED_ATTACHMENTS) {
    throw new Error("attachment_quota_exceeded");
  }

  const name = createAIAttachmentName(crypto.randomUUID(), mediaType);
  const storageUrl = await uploadPrivateStoredObject({
    pathname: getAIAttachmentPath(username, name),
    contentType: mediaType,
    body: bytes,
    maximumSizeInBytes: AI_ATTACHMENT_MAX_BYTES,
  });
  try {
    await redis.sadd(indexKey, storageUrl);
  } catch (error) {
    await deleteStoredObject(storageUrl).catch(() => {});
    throw error;
  }
  return { mediaType, url: getAIAttachmentUrl(name) };
}

export async function readAIAttachment({
  username,
  url,
}: {
  username: string;
  url: string;
}): Promise<{ bytes: Uint8Array; mediaType: AIAttachmentMediaType }> {
  const attachment = parseAIAttachmentUrl(url);
  if (!attachment) throw new Error("attachment_not_found");
  const bytes = await downloadPrivateStoredObjectByPathname(
    getAIAttachmentPath(username, attachment.name),
    AI_ATTACHMENT_MAX_BYTES
  );
  if (!hasImageSignature(bytes, attachment.mediaType)) {
    throw new Error("attachment_not_found");
  }
  return { bytes, mediaType: attachment.mediaType };
}

export async function resolveAIAttachmentsForModel({
  username,
  messages,
}: {
  username: string;
  messages: UIMessage[];
}): Promise<UIMessage[]> {
  let remainingImages = MAX_MODEL_IMAGES;
  let remainingBytes = MAX_MODEL_IMAGE_BYTES;
  const resolved = [...messages];

  for (let index = resolved.length - 1; index >= 0; index -= 1) {
    const message = resolved[index];
    if (!message) continue;
    const parts: UIMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type !== "file" || !parseAIAttachmentUrl(part.url)) {
        parts.push(part);
        continue;
      }
      if (remainingImages <= 0) continue;
      try {
        const attachment = await readAIAttachment({
          username,
          url: part.url,
        });
        if (attachment.bytes.byteLength > remainingBytes) continue;
        remainingImages -= 1;
        remainingBytes -= attachment.bytes.byteLength;
        parts.push({
          ...part,
          mediaType: attachment.mediaType,
          url: `data:${attachment.mediaType};base64,${Buffer.from(
            attachment.bytes
          ).toString("base64")}`,
        });
      } catch {
        // A missing image should not make the rest of the conversation unusable.
      }
    }
    resolved[index] = { ...message, parts };
  }

  return resolved;
}

export async function deleteAllAIAttachments(
  redis: RedisLike,
  username: string
): Promise<number> {
  const indexKey = redisKeys.chat.aiAttachments(username);
  const storageUrls = await redis.smembers<string[]>(indexKey);
  await Promise.all(storageUrls.map((url) => deleteStoredObject(url)));
  return redis.del(indexKey);
}
