import type { ApiRequest } from "./api-types.js";

function isBodyBuffer(value: unknown): value is Buffer {
  return Buffer.isBuffer(value);
}

export class RequestBodyTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
    this.maxBytes = maxBytes;
  }
}

function assertWithinLimit(size: number, maxBytes: number | undefined): void {
  if (maxBytes !== undefined && size > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }
}

/**
 * Read the full request body as a Buffer for binary upload routes.
 * When `maxBytes` is set, rejects payloads that exceed the limit while streaming.
 */
export async function readRequestBodyBuffer(
  req: ApiRequest,
  maxBytes?: number
): Promise<Buffer> {
  if (isBodyBuffer(req.body)) {
    assertWithinLimit(req.body.length, maxBytes);
    return req.body;
  }

  if (typeof req.body === "string") {
    const body = Buffer.from(req.body);
    assertWithinLimit(body.length, maxBytes);
    return body;
  }

  if (req.body instanceof Uint8Array) {
    const body = Buffer.from(req.body);
    assertWithinLimit(body.length, maxBytes);
    return body;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    assertWithinLimit(total, maxBytes);
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}
