export interface BlueBubblesWebhookPayload {
  type?: string | null;
  secret?: string | null;
  data?: {
    guid?: string | null;
    chatGuid?: string | null;
    text?: string | null;
    subject?: string | null;
    isFromMe?: boolean | null;
    chats?: Array<{
      guid?: string | null;
    }> | null;
  } | null;
}

export interface ParsedBlueBubblesMessage {
  type: string;
  messageGuid: string | null;
  chatGuid: string | null;
  text: string;
  isFromMe: boolean;
}

export interface BlueBubblesConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface SendBlueBubblesMessageOptions {
  serverUrl: string;
  password: string;
  chatGuid: string;
  text: string;
  method?: "private-api" | "apple-script";
  fetchImpl?: typeof fetch;
}

const SEND_TEXT_PATHS = ["/api/v1/send-text", "/api/v1/send_text"];

export function parseBlueBubblesWebhookPayload(
  payload: BlueBubblesWebhookPayload | null | undefined
): ParsedBlueBubblesMessage {
  const data = payload?.data;
  const directChatGuid =
    typeof data?.chatGuid === "string" && data.chatGuid.trim().length > 0
      ? data.chatGuid.trim()
      : null;
  const nestedChatGuid =
    Array.isArray(data?.chats) &&
    typeof data.chats[0]?.guid === "string" &&
    data.chats[0].guid.trim().length > 0
      ? data.chats[0].guid.trim()
      : null;
  const rawText =
    typeof data?.text === "string"
      ? data.text
      : typeof data?.subject === "string"
        ? data.subject
        : "";

  return {
    type: typeof payload?.type === "string" ? payload.type : "",
    messageGuid:
      typeof data?.guid === "string" && data.guid.trim().length > 0
        ? data.guid.trim()
        : null,
    chatGuid: directChatGuid || nestedChatGuid,
    text: rawText.trim(),
    isFromMe: data?.isFromMe === true,
  };
}

export function parseBlueBubblesAllowedChatGuids(
  raw: string | undefined
): Set<string> | null {
  if (!raw) {
    return null;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? new Set(values) : null;
}

export function getBlueBubblesTriggerPrefix(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "@ryo";
}

export function extractBlueBubblesPrompt(
  text: string,
  triggerPrefix: string
): string | null {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return null;
  }

  const prefix = triggerPrefix.trim();
  if (!prefix) {
    return normalizedText;
  }

  if (normalizedText.length < prefix.length) {
    return null;
  }

  const startsWithPrefix =
    normalizedText.slice(0, prefix.length).toLowerCase() ===
    prefix.toLowerCase();

  if (!startsWithPrefix) {
    return null;
  }

  const prompt = normalizedText.slice(prefix.length).trim();
  return prompt.length > 0 ? prompt : null;
}

export function isBlueBubblesChatAllowed(
  chatGuid: string,
  allowedChatGuids: Set<string> | null
): boolean {
  if (!allowedChatGuids || allowedChatGuids.size === 0) {
    return true;
  }

  return allowedChatGuids.has(chatGuid);
}

export function buildBlueBubblesHistoryKey(chatGuid: string): string {
  return `bluebubbles:history:${chatGuid}`;
}

export function buildBlueBubblesProcessedMessageKey(messageGuid: string): string {
  return `bluebubbles:processed:${messageGuid}`;
}

export function parseBlueBubblesConversationMessage(
  raw: unknown
): BlueBubblesConversationMessage | null {
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as BlueBubblesConversationMessage)
        : (raw as BlueBubblesConversationMessage);

    if (
      !parsed ||
      (parsed.role !== "user" && parsed.role !== "assistant") ||
      typeof parsed.content !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function buildSendTextUrl(serverUrl: string, path: string, password: string): URL {
  const url = new URL(path, serverUrl.endsWith("/") ? serverUrl : `${serverUrl}/`);
  url.searchParams.set("guid", password);
  return url;
}

export async function sendBlueBubblesMessage({
  serverUrl,
  password,
  chatGuid,
  text,
  method = "private-api",
  fetchImpl = fetch,
}: SendBlueBubblesMessageOptions): Promise<void> {
  let lastError: Error | null = null;

  for (const path of SEND_TEXT_PATHS) {
    const response = await fetchImpl(buildSendTextUrl(serverUrl, path, password), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatGuid,
        text,
        method,
      }),
    });

    if (response.ok) {
      return;
    }

    if (response.status === 404 || response.status === 405) {
      lastError = new Error(`BlueBubbles route unavailable at ${path}`);
      continue;
    }

    const body = await response.text();
    throw new Error(
      `BlueBubbles send failed (${response.status})${body ? `: ${body}` : ""}`
    );
  }

  throw lastError || new Error("BlueBubbles send failed");
}
