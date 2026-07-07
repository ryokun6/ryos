/**
 * Compact, shareable summaries of chat messages for client debug logs.
 *
 * Emitted through `createClientLogger` (enable Debug Mode in Control Panels,
 * or `localStorage.setItem("ryos:debug", "1")`), so users can copy the Debug
 * console overlay output when reporting chat/tool-approval issues.
 *
 * Part summaries are single strings (not nested objects) because the client
 * log summarizer collapses objects deeper than 3 levels. They stay compact
 * and avoid payloads: tool inputs/outputs become presence flags, text
 * becomes a length.
 */

interface UnknownPart {
  type?: unknown;
  state?: unknown;
  toolCallId?: unknown;
  text?: unknown;
  approval?: { id?: unknown; approved?: unknown };
  output?: unknown;
  errorText?: unknown;
  preliminary?: unknown;
}

interface UnknownMessage {
  id?: unknown;
  role?: unknown;
  parts?: unknown;
}

/** e.g. "tool-getPreciseLocation state=approval-requested call=x1 approval(id=a1)" */
export function summarizeChatPart(part: unknown): string {
  if (!part || typeof part !== "object") return `(${typeof part})`;
  const candidate = part as UnknownPart;
  const type = typeof candidate.type === "string" ? candidate.type : "unknown";
  if (type === "text" || type === "reasoning") {
    const length =
      typeof candidate.text === "string" ? candidate.text.length : 0;
    return `${type} len=${length}`;
  }
  const bits: string[] = [type];
  if (candidate.state !== undefined) bits.push(`state=${candidate.state}`);
  if (candidate.toolCallId !== undefined) {
    bits.push(`call=${candidate.toolCallId}`);
  }
  if (candidate.approval && typeof candidate.approval === "object") {
    bits.push(
      `approval(id=${candidate.approval.id}, approved=${candidate.approval.approved})`
    );
  }
  if (candidate.output !== undefined) bits.push("hasOutput");
  if (candidate.errorText !== undefined) bits.push("hasErrorText");
  if (candidate.preliminary !== undefined) {
    bits.push(`preliminary=${candidate.preliminary}`);
  }
  return bits.join(" ");
}

/**
 * Message id/role plus per-part summary strings. Use as a TOP-LEVEL log
 * context (`log.debug("...", summarizeChatMessage(m))`) so the parts array
 * stays within the summarizer's depth budget.
 */
export function summarizeChatMessage(
  message: unknown
): Record<string, unknown> {
  if (!message || typeof message !== "object") {
    return { message: `(${typeof message})` };
  }
  const candidate = message as UnknownMessage;
  return {
    id: candidate.id,
    role: candidate.role,
    parts: Array.isArray(candidate.parts)
      ? candidate.parts.map(summarizeChatPart)
      : "(none)",
  };
}

/** Whole message on one line (may truncate for very tool-heavy messages). */
export function summarizeChatMessageLine(message: unknown): string {
  if (!message || typeof message !== "object") return `(${typeof message})`;
  const candidate = message as UnknownMessage;
  const parts = Array.isArray(candidate.parts)
    ? candidate.parts.map(summarizeChatPart).join(" | ")
    : "(none)";
  return `${candidate.role}#${candidate.id}: ${parts}`;
}

/** Trailing-window summary of a conversation (last `limit` messages). */
export function summarizeChatMessages(
  messages: readonly unknown[],
  limit = 4
): Record<string, unknown> {
  return {
    messageCount: messages.length,
    lastMessages: messages.slice(-limit).map(summarizeChatMessageLine),
  };
}
