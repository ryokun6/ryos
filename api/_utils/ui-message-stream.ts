import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

/**
 * GPT-6 (OpenAI Responses) streams a reasoning summary by default when
 * reasoning effort is not "none". Those streams intermittently emit
 * `reasoning-delta` / `reasoning-end` (and the text equivalents) without a
 * matching start part. AI SDK's stream processor then enqueues
 * `{ type: "error", error: "reasoning part <id> not found" }` and keeps going.
 * `toUIMessageStream` masks that as "An error occurred.", and the client
 * parser throws inside its transform — after the `start` chunk has already
 * inserted an empty assistant message.
 *
 * This transform runs before `smoothStream` and injects the missing start so
 * the processor accepts the part and the following text still reaches the UI.
 * Open ids reset on `start-step`, matching the processor's per-step maps.
 */
export function repairOrphanStreamParts<
  TOOLS extends ToolSet = ToolSet,
>(): StreamTextTransform<TOOLS> {
  return () => {
    const openReasoning = new Set<string>();
    const openText = new Set<string>();

    const ensureOpen = (
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
      kind: "reasoning" | "text",
      id: string,
      chunk: TextStreamPart<TOOLS>
    ) => {
      const open = kind === "reasoning" ? openReasoning : openText;
      if (open.has(id)) return;
      open.add(id);
      controller.enqueue({
        type: kind === "reasoning" ? "reasoning-start" : "text-start",
        id,
        ...copyProviderMetadata(chunk),
      });
    };

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        if (chunk.type === "start-step") {
          openReasoning.clear();
          openText.clear();
          controller.enqueue(chunk);
          return;
        }

        if (chunk.type === "reasoning-start") {
          openReasoning.add(chunk.id);
        } else if (
          chunk.type === "reasoning-delta" ||
          chunk.type === "reasoning-end"
        ) {
          ensureOpen(controller, "reasoning", chunk.id, chunk);
          if (chunk.type === "reasoning-end") openReasoning.delete(chunk.id);
        } else if (chunk.type === "text-start") {
          openText.add(chunk.id);
        } else if (chunk.type === "text-delta" || chunk.type === "text-end") {
          ensureOpen(controller, "text", chunk.id, chunk);
          if (chunk.type === "text-end") openText.delete(chunk.id);
        }

        controller.enqueue(chunk);
      },
    });
  };
}

/** Repair first, then any later transforms such as `smoothStream`. */
export function ryoUiStreamTransforms<TOOLS extends ToolSet = ToolSet>(
  ...extra: Array<StreamTextTransform<TOOLS>>
): Array<StreamTextTransform<TOOLS>> {
  return [repairOrphanStreamParts<TOOLS>(), ...extra];
}

const SECRET_PATTERN = /\b(?:sk-[^\s]{4,}|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+)/gi;

/**
 * Message returned on the UI message stream `error` chunk.
 * The SDK default is "An error occurred.", which hides the cause from the
 * client log. Pass the provider/SDK message through after stripping tokens.
 */
export function safeUiStreamErrorText(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const cleaned = raw.replace(SECRET_PATTERN, "[redacted]").replace(/\s+/g, " ").trim();
  if (!cleaned) return "An error occurred.";
  return cleaned.length > 300 ? `${cleaned.slice(0, 299)}…` : cleaned;
}

function copyProviderMetadata(chunk: TextStreamPart<ToolSet>) {
  if (!("providerMetadata" in chunk) || chunk.providerMetadata == null) {
    return {};
  }
  return { providerMetadata: chunk.providerMetadata };
}
