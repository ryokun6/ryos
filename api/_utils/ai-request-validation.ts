import { z } from "zod";

export const CHAT_MAX_MESSAGES = 200;
export const CHAT_MAX_TEXT_CHARS = 16_000;
export const CHAT_MAX_TOTAL_CONTENT_CHARS = 128_000;
export const CHAT_MAX_SYSTEM_STATE_BYTES = 128 * 1024;
export const CHAT_MAX_TOOL_VALUE_BYTES = 32 * 1024;

const CHAT_TOOL_PART_TYPES = new Set([
  "tool-launchApp",
  "tool-closeApp",
  "tool-ipodControl",
  "tool-karaokeControl",
  "tool-generateHtml",
  "tool-aquarium",
  "tool-list",
  "tool-open",
  "tool-read",
  "tool-write",
  "tool-edit",
  "tool-searchSongs",
  "tool-webFetch",
  "tool-mapsSearchPlaces",
  "tool-settings",
  "tool-stickiesControl",
  "tool-infiniteMacControl",
  "tool-calendarControl",
  "tool-contactsControl",
  "tool-tvControl",
  "tool-memoryWrite",
  "tool-memoryRead",
  "tool-memoryDelete",
  "tool-cursorCloudAgent",
  "tool-listCursorCloudAgentRuns",
  "tool-web_search",
  "tool-google_search",
]);

const boundedJsonValueSchema = z.unknown().superRefine((value, context) => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tool data must be JSON-serializable.",
    });
    return;
  }

  if (serialized === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tool data must be JSON-serializable.",
    });
    return;
  }

  if (Buffer.byteLength(serialized, "utf8") > CHAT_MAX_TOOL_VALUE_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Tool data exceeds ${CHAT_MAX_TOOL_VALUE_BYTES} bytes.`,
    });
  }
});

const textPartSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().max(CHAT_MAX_TEXT_CHARS),
    state: z.enum(["streaming", "done"]).optional(),
  })
  .strict();

const reasoningPartSchema = z
  .object({
    type: z.literal("reasoning"),
    text: z.string().max(CHAT_MAX_TEXT_CHARS),
    state: z.enum(["streaming", "done"]).optional(),
  })
  .strict();

const stepStartPartSchema = z
  .object({
    type: z.literal("step-start"),
  })
  .strict();

const sourceUrlPartSchema = z
  .object({
    type: z.literal("source-url"),
    sourceId: z.string().min(1).max(200),
    url: z.string().url().max(2_048),
    title: z.string().max(1_000).optional(),
  })
  .strict();

const sourceDocumentPartSchema = z
  .object({
    type: z.literal("source-document"),
    sourceId: z.string().min(1).max(200),
    mediaType: z.string().min(1).max(200),
    title: z.string().max(1_000),
    filename: z.string().max(1_000).optional(),
  })
  .strict();

const toolPartBaseSchema = z.object({
  type: z
    .string()
    .refine(
      (value) => CHAT_TOOL_PART_TYPES.has(value),
      "Tool part is not supported."
    ),
  toolCallId: z.string().min(1).max(200),
  input: boundedJsonValueSchema.optional(),
  providerExecuted: z.boolean().optional(),
});

const toolPartSchema = z.discriminatedUnion("state", [
  toolPartBaseSchema
    .extend({
      state: z.literal("input-streaming"),
    })
    .strict(),
  toolPartBaseSchema
    .extend({
      state: z.literal("input-available"),
      input: boundedJsonValueSchema,
    })
    .strict(),
  toolPartBaseSchema
    .extend({
      state: z.literal("output-available"),
      input: boundedJsonValueSchema,
      output: boundedJsonValueSchema,
    })
    .strict(),
  toolPartBaseSchema
    .extend({
      state: z.literal("output-error"),
      errorText: z.string().min(1).max(4_000),
    })
    .strict(),
]);

const userMessageSchema = z
  .object({
    id: z.string().min(1).max(200).optional(),
    role: z.literal("user"),
    metadata: boundedJsonValueSchema.optional(),
    content: z.string().max(CHAT_MAX_TEXT_CHARS).optional(),
    parts: z.array(textPartSchema).min(1).max(32).optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if ((message.content === undefined) === (message.parts === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A user message must contain exactly one of content or parts.",
      });
    }
  });

const assistantMessageSchema = z
  .object({
    id: z.string().min(1).max(200).optional(),
    role: z.literal("assistant"),
    metadata: boundedJsonValueSchema.optional(),
    content: z.string().max(CHAT_MAX_TEXT_CHARS).optional(),
    parts: z
      .array(
        z.union([
          textPartSchema,
          reasoningPartSchema,
          stepStartPartSchema,
          sourceUrlPartSchema,
          sourceDocumentPartSchema,
          toolPartSchema,
        ])
      )
      .min(1)
      .max(64)
      .optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if ((message.content === undefined) === (message.parts === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An assistant message must contain exactly one of content or parts.",
      });
    }
  });

const systemStateSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "systemState must be JSON-serializable.",
      });
      return;
    }

    if (
      serialized === undefined ||
      Buffer.byteLength(serialized, "utf8") > CHAT_MAX_SYSTEM_STATE_BYTES
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `systemState exceeds ${CHAT_MAX_SYSTEM_STATE_BYTES} bytes.`,
      });
    }
  });

export const ChatRequestSchema = z
  .object({
    id: z.string().min(1).max(200).optional(),
    messages: z
      .array(z.union([userMessageSchema, assistantMessageSchema]))
      .max(CHAT_MAX_MESSAGES),
    trigger: z
      .enum(["submit-message", "regenerate-message"])
      .optional(),
    messageId: z.string().min(1).max(200).optional(),
    systemState: systemStateSchema.optional(),
    model: z.string().max(100).optional(),
    proactiveGreeting: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.messages.length === 0 && request.proactiveGreeting !== true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages"],
        message: "messages must not be empty.",
      });
    }

    let totalContentChars = 0;
    for (const message of request.messages) {
      if (message.content !== undefined) {
        totalContentChars += message.content.length;
      }
      for (const part of message.parts ?? []) {
        if ("text" in part) totalContentChars += part.text.length;
      }
    }
    if (totalContentChars > CHAT_MAX_TOTAL_CONTENT_CHARS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages"],
        message: `Message text exceeds ${CHAT_MAX_TOTAL_CONTENT_CHARS} characters.`,
      });
    }
  });

export type ValidatedChatRequest = z.infer<typeof ChatRequestSchema>;
