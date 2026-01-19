import {
  generateText,
  type ImagePart,
  type ModelMessage,
  type TextPart,
  type UserContent,
} from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  getClientIp,
  jsonResponse,
  RATE_LIMIT_TIERS,
} from "./_utils/middleware.js";
import { validateAuth } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { APPLET_SYSTEM_PROMPT } from "./_utils/_aiPrompts.js";

export const config = {
  runtime: "edge",
};
export const maxDuration = 60;

const ImageAttachmentSchema = z.object({
  mediaType: z
    .string()
    .regex(
      /^image\/[a-z0-9.+-]+$/i,
      "Attachment mediaType must be an image/* MIME type."
    ),
  data: z.string().min(1, "Attachment data must be a base64-encoded string."),
});

const MessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().max(4000).optional(),
    attachments: z
      .array(ImageAttachmentSchema)
      .max(4, "A maximum of 4 attachments are allowed per message.")
      .optional(),
  })
  .refine(
    (data) =>
      (typeof data.content === "string" &&
        data.content.trim().length > 0 &&
        data.content.length <= 4000) ||
      (data.attachments && data.attachments.length > 0),
    {
      message: "Messages must include text content or at least one attachment.",
      path: ["content"],
    }
  )
  .refine(
    (data) => !data.attachments || data.role === "user",
    {
      message: "Only user messages can include attachments.",
      path: ["attachments"],
    }
  );

const RequestSchema = z
  .object({
    prompt: z.string().min(1).max(4000).optional(),
    messages: z.array(MessageSchema).min(1).max(12).optional(),
    context: z.string().min(1).max(2000).optional(),
    temperature: z.number().min(0).max(1).optional(),
    mode: z.enum(["text", "image"]).optional(),
    images: z
      .array(ImageAttachmentSchema)
      .max(4, "A maximum of 4 images are allowed per request.")
      .optional(),
  })
  .refine(
    (data) =>
      (data.prompt && data.prompt.trim().length > 0) ||
      (data.messages && data.messages.length > 0) ||
      (data.mode === "image" && data.images && data.images.length > 0),
    {
      message: "Provide a prompt, non-empty messages array, or image attachments.",
      path: ["prompt"],
    }
  )
  .refine(
    (data) => !data.images || data.mode === "image",
    {
      message: 'Images can only be provided when mode is set to "image".',
      path: ["images"],
    }
  )
  .refine(
    (data) =>
      data.mode !== "image" ||
      ((data.prompt && data.prompt.trim().length > 0) ||
        (data.images && data.images.length > 0)),
    {
      message: "Image requests require text instructions and/or image attachments.",
      path: ["images"],
    }
  );

type RateLimitScope = "text-hour" | "image-hour";

type ParsedMessage = z.infer<typeof MessageSchema>;

/**
 * Build a rate limit exceeded response with detailed headers
 */
const rateLimitExceededResponse = (
  scope: RateLimitScope,
  effectiveOrigin: string | null,
  identifier: string,
  result: Awaited<ReturnType<typeof RateLimit.checkCounterLimit>>
): Response => {
  const resetSeconds =
    typeof result.resetSeconds === "number" && result.resetSeconds > 0
      ? result.resetSeconds
      : result.windowSeconds;

  return jsonResponse(
    {
      error: "rate_limit_exceeded",
      scope,
      limit: result.limit,
      windowSeconds: result.windowSeconds,
      resetSeconds,
      identifier,
    },
    429,
    effectiveOrigin,
    {
      "Retry-After": String(resetSeconds),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(Math.max(0, result.limit - result.count)),
      "X-RateLimit-Reset": String(resetSeconds),
      "Vary": "Origin",
    }
  );
};

const decodeBase64ToBinaryString = (value: string): string => {
  const atobFn = (globalThis as typeof globalThis & {
    atob?: (data: string) => string;
  }).atob;

  if (typeof atobFn === "function") {
    return atobFn(value);
  }

  const { Buffer } = globalThis as Record<string, unknown> & {
    Buffer?: {
      from(
        data: string,
        encoding: string
      ): { toString(encoding: string): string };
    };
  };

  if (Buffer && typeof Buffer.from === "function") {
    return Buffer.from(value, "base64").toString("binary");
  }

  throw new Error("Base64 decoding is not supported in this environment.");
};

const decodeBase64Image = (input: string): Uint8Array => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Attachment data is empty.");
  }
  const commaIndex = trimmed.indexOf(",");
  const base64 = commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
  const sanitized = base64.replace(/\s+/g, "");
  if (!sanitized) {
    throw new Error("Attachment data is empty.");
  }

  let binary: string;
  try {
    binary = decodeBase64ToBinaryString(sanitized);
  } catch (error) {
    const detailMessage =
      error instanceof Error
        ? error.message
        : "Attachment data is not valid base64.";
    throw new Error(
      `Unable to decode base64 payload (length: ${sanitized.length}). ${detailMessage}`
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const createMessageParts = (
  message: ParsedMessage,
  messageIndex: number
): Array<TextPart | ImagePart> => {
  const parts: Array<TextPart | ImagePart> = [];
  const text = message.content?.trim();

  if (text && text.length > 0) {
    parts.push({ type: "text", text });
  }

  if (message.attachments) {
    message.attachments.forEach((attachment, attachmentIndex) => {
      let imageData: Uint8Array;
      try {
        imageData = decodeBase64Image(attachment.data);
      } catch (error) {
        const details =
          error instanceof Error ? error.message : "Invalid base64 payload.";
        throw new Error(
          `Invalid attachment ${attachmentIndex + 1} in message ${
            messageIndex + 1
          }: ${details}`
        );
      }
      const imagePart: ImagePart = {
        type: "image",
        image: imageData,
        mediaType: attachment.mediaType,
      };
      parts.push(imagePart);
    });
  }

  return parts;
};

const buildModelMessages = (
  conversation: ParsedMessage[],
  context?: string
): ModelMessage[] => {
  const messages: ModelMessage[] = [
    { role: "system", content: APPLET_SYSTEM_PROMPT.trim() },
  ];

  if (context) {
    messages.push({
      role: "system",
      content: `<applet_context>${context}</applet_context>`,
    });
  }

  conversation.forEach((message, index) => {
    const trimmedContent = message.content?.trim() ?? "";

    if (message.role === "system") {
      if (trimmedContent.length > 0) {
        messages.push({ role: "system", content: trimmedContent });
      }
      return;
    }

    if (message.role === "assistant") {
      if (trimmedContent.length > 0) {
        messages.push({ role: "assistant", content: trimmedContent });
      }
      return;
    }

    const parts = createMessageParts(message, index);
    if (parts.length === 0) {
      throw new Error(
        `User message ${index + 1} must include text or at least one attachment.`
      );
    }

    const content: UserContent =
      parts.length === 1 && parts[0].type === "text"
        ? parts[0].text
        : parts;

    messages.push({
      role: "user",
      content,
    });
  });

  return messages;
};

export default async function handler(req: Request): Promise<Response> {
  const effectiveOrigin = getEffectiveOrigin(req);
  if (req.method === "OPTIONS") {
    const resp = preflightIfNeeded(req, ["POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (!isAllowedOrigin(effectiveOrigin)) {
    return jsonResponse({ error: "Unauthorized" }, 403, effectiveOrigin);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, effectiveOrigin);
  }

  // Initialize Redis for auth token validation
  const redis = createRedis();

  // Extract auth headers
  const authHeader = req.headers.get("authorization");
  const authToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;
  const usernameHeaderRaw = req.headers.get("x-username");
  const usernameHeader =
    usernameHeaderRaw && usernameHeaderRaw.trim().length > 0
      ? usernameHeaderRaw.trim().toLowerCase()
      : null;
  const usernameLogLabel =
    usernameHeaderRaw && usernameHeaderRaw.trim().length > 0
      ? usernameHeaderRaw.trim()
      : "anonymous";

  const logPrefix = `[applet-ai][User: ${usernameLogLabel}]`;
  const log = (...args: unknown[]) => console.log(logPrefix, ...args);
  const logError = (...args: unknown[]) => console.error(logPrefix, ...args);

  // Validate authentication (all users, including "ryo", must present a valid token)
  if (usernameHeader) {
    const validationResult = await validateAuth(redis, usernameHeader, authToken);
    if (!validationResult.valid) {
      logError("Authentication failed – invalid or missing token");
      return jsonResponse(
        {
          error: "authentication_failed",
          message: "Invalid or missing authentication token",
        },
        401,
        effectiveOrigin
      );
    }
  }

  const ip = getClientIp(req);
  log("Request received", {
    origin: effectiveOrigin ?? "unknown",
    host,
    ip,
    method: req.method,
  });

  let parsedBody: z.infer<typeof RequestSchema>;
  try {
    const body = await req.json();
    const result = RequestSchema.safeParse(body);
    if (!result.success) {
      logError("Invalid request body", result.error.format());
      return jsonResponse(
        { error: "Invalid request body", details: result.error.format() },
        400,
        effectiveOrigin
      );
    }
    parsedBody = result.data;
  } catch (error) {
    logError("Failed to parse JSON body", error);
    return jsonResponse(
      { error: "Invalid JSON in request body" },
      400,
      effectiveOrigin
    );
  }

  const { prompt, messages, context, temperature, mode: requestedMode } =
    parsedBody;
  const mode = requestedMode ?? "text";

  // Allow trusted user "ryo" to bypass rate limits (but still requires valid auth token)
  const rateLimitBypass = usernameHeader === "ryo";
  // If usernameHeader is not null, we've already validated the token, so user is authenticated
  const isAuthenticatedUser = usernameHeader !== null;
  const identifier = isAuthenticatedUser
    ? `user:${usernameHeader}`
    : `ip:${ip}`;

  const promptChars =
    typeof prompt === "string" ? prompt.trim().length : 0;
  const contextChars =
    typeof context === "string" ? context.trim().length : 0;
  const messagesCount = messages?.length ?? 0;
  const messageAttachments =
    messages?.reduce(
      (acc, message) => acc + (message.attachments?.length ?? 0),
      0
    ) ?? 0;
  const requestImagesCount = parsedBody.images?.length ?? 0;

  log("Request payload summary", {
    mode,
    isAuthenticatedUser,
    rateLimitBypass,
    identifier,
    promptChars,
    contextChars,
    messagesCount,
    messageAttachments,
    requestImagesCount,
    temperature: typeof temperature === "number" ? temperature : "default",
  });

  if (rateLimitBypass) {
    const scope: RateLimitScope = mode === "image" ? "image-hour" : "text-hour";
    const tierConfig = mode === "image"
      ? RATE_LIMIT_TIERS.appletAi.image
      : RATE_LIMIT_TIERS.appletAi.text;
    log("[rate-limit] Bypass enabled for trusted user", {
      scope,
      identifier,
      wouldHaveLimit: tierConfig.authenticated.limit,
    });
  }

  if (!rateLimitBypass) {
    try {
      const scope: RateLimitScope = mode === "image" ? "image-hour" : "text-hour";
      const tierConfig = mode === "image"
        ? RATE_LIMIT_TIERS.appletAi.image
        : RATE_LIMIT_TIERS.appletAi.text;
      const tier = isAuthenticatedUser ? tierConfig.authenticated : tierConfig.anonymous;
      const limit = tier.limit;
      const windowSeconds = tier.window;

      const key = RateLimit.makeKey([
        "rl",
        "applet-ai",
        scope,
        isAuthenticatedUser ? "user" : "ip",
        isAuthenticatedUser ? usernameHeader! : ip,
      ]);

      const result = await RateLimit.checkCounterLimit({
        key,
        windowSeconds,
        limit,
      });

      const remaining = Math.max(0, result.limit - result.count);
      const resetSeconds =
        typeof result.resetSeconds === "number" && result.resetSeconds > 0
          ? result.resetSeconds
          : result.windowSeconds;

      // Log rate limit information for all requests
      log("[rate-limit] Check", {
        scope,
        identifier,
        isAuthenticatedUser,
        count: result.count,
        limit: result.limit,
        remaining,
        resetSeconds,
        allowed: result.allowed,
      });

      if (!result.allowed) {
        log("[rate-limit] Limit exceeded", {
          scope,
          identifier,
          count: result.count,
          limit: result.limit,
          resetSeconds,
        });
        return rateLimitExceededResponse(scope, effectiveOrigin, identifier, result);
      }
    } catch (error) {
      logError("Rate limit check failed:", error);
    }
  }

  if (mode === "image") {
    const promptText = prompt?.trim() ?? "";
    const promptParts: Array<TextPart | ImagePart> = [];

    if (context && context.trim().length > 0) {
      promptParts.push({ type: "text", text: context.trim() });
    }

    if (promptText.length > 0) {
      promptParts.push({ type: "text", text: promptText });
    }

    try {
      if (parsedBody.images) {
        parsedBody.images.forEach((image, index) => {
          let imageData: Uint8Array;
          try {
            imageData = decodeBase64Image(image.data);
          } catch (error) {
            const details =
              error instanceof Error ? error.message : "Invalid base64 payload.";
            throw new Error(
              `Invalid image attachment ${index + 1}: ${details}`
            );
          }

          promptParts.push({
            type: "image",
            image: imageData,
            mediaType: image.mediaType,
          });
        });
      }
    } catch (error) {
      logError("Image attachment parsing failed:", error);
      return jsonResponse(
        {
          error: "Invalid image attachments in request body",
          ...(error instanceof Error ? { details: error.message } : {}),
        },
        400,
        effectiveOrigin
      );
    }

    if (promptParts.length === 0) {
      return jsonResponse(
        { error: "Image generation requires instructions or image attachments." },
        400,
        effectiveOrigin
      );
    }

    try {
      const imageResult = await generateText({
        model: google("gemini-2.5-flash-image-preview"),
        messages: [
          {
            role: "user",
            content: promptParts,
          },
        ],
        ...(typeof temperature === "number" ? { temperature } : {}),
        providerOptions: {
          google: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        },
      });

      const imageFile = imageResult.files?.find((file) =>
        file.mediaType.startsWith("image/")
      );

      if (!imageFile) {
        logError("Image generation returned no image files.", imageResult);
        return jsonResponse(
          { error: "The model did not return an image." },
          502,
          effectiveOrigin
        );
      }

      log("Image generation succeeded", {
        mediaType: imageFile.mediaType,
        descriptionReturned: Boolean(imageResult.text?.trim()),
        promptParts: promptParts.length,
      });

      const imageStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(imageFile.uint8Array);
          controller.close();
        },
      });

      const headers = new Headers({
        "Content-Type": imageFile.mediaType,
        "Cache-Control": "no-store",
        Vary: "Origin",
      });

      headers.set("Access-Control-Expose-Headers", "X-Image-Description");

      if (effectiveOrigin) {
        headers.set("Access-Control-Allow-Origin", effectiveOrigin);
      }

      if (imageResult.text?.trim()) {
        headers.set("X-Image-Description", imageResult.text.trim());
      }

      return new Response(imageStream, {
        status: 200,
        headers,
      });
    } catch (error) {
      logError("Image generation failed:", error);
      // Log more details if available
      if (error instanceof Error) {
        logError("Error details:", {
          name: error.name,
          message: error.message,
          cause: error.cause,
        });
      }
      return jsonResponse(
        { error: "Failed to generate image" },
        500,
        effectiveOrigin
      );
    }
  }

  const conversation: ParsedMessage[] =
    messages && messages.length > 0
      ? messages
      : [{ role: "user", content: prompt!.trim() }];

  let finalMessages: ModelMessage[];
  try {
    finalMessages = buildModelMessages(conversation, context);
  } catch (error) {
    logError("Message preparation failed:", error);
    return jsonResponse(
      {
        error: "Invalid attachments in request body",
        ...(error instanceof Error ? { details: error.message } : {}),
      },
      400,
      effectiveOrigin
    );
  }

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      messages: finalMessages,
      temperature: temperature ?? 0.6,
      maxOutputTokens: 4000,
    });

    const trimmedReply = text.trim();
    log("Text generation succeeded", {
      replyLength: trimmedReply.length,
      messageCount: finalMessages.length,
      temperature: temperature ?? 0.6,
    });

    return jsonResponse({ reply: trimmedReply }, 200, effectiveOrigin);
  } catch (error) {
    logError("Generation failed:", error);
    return jsonResponse(
      { error: "Failed to generate response" },
      500,
      effectiveOrigin
    );
  }
}
