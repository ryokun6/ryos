import { abortableFetch } from "@/utils/abortableFetch";
import { RYO_CHAT_SPEECH_SOURCE } from "@/utils/speechPolicy";

export type MintedSpeechPermit = {
  permitId: string;
  contentHash: string;
  messageId: string;
};

const MINT_RETRY_DELAYS_MS = [0, 160, 320];

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Mint a short-lived speech permit for a Ryo chat assistant chunk.
 * Retries briefly when the streaming draft has not landed in Redis yet.
 */
export async function mintRyoSpeechPermit(input: {
  messageId: string;
  text: string;
  signal?: AbortSignal;
}): Promise<MintedSpeechPermit | null> {
  if (!input.messageId || !input.text.trim()) return null;

  for (const delayMs of MINT_RETRY_DELAYS_MS) {
    if (input.signal?.aborted) return null;
    if (delayMs > 0) {
      try {
        await sleep(delayMs, input.signal);
      } catch {
        return null;
      }
    }

    try {
      const res = await abortableFetch("/api/speech/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: input.messageId,
          text: input.text,
          source: RYO_CHAT_SPEECH_SOURCE,
        }),
        signal: input.signal,
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 150 },
      });
      if (res.ok) {
        const data = (await res.json()) as Partial<MintedSpeechPermit>;
        if (
          typeof data.permitId === "string" &&
          data.permitId &&
          typeof data.contentHash === "string"
        ) {
          return {
            permitId: data.permitId,
            contentHash: data.contentHash,
            messageId:
              typeof data.messageId === "string" ? data.messageId : input.messageId,
          };
        }
        return null;
      }
      if (res.status !== 404) {
        console.error("Speech permit mint failed", await res.text());
        return null;
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return null;
      console.error("Speech permit mint error", err);
      return null;
    }
  }

  return null;
}
