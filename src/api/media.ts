import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export async function transcribeAudio(formData: FormData): Promise<{ text: string }> {
  const response = await abortableFetch(getApiUrl("/api/audio-transcribe"), {
    method: "POST",
    body: formData,
    timeout: 30000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string };
    throw new Error(errorData.error || "Transcription failed");
  }

  return (await response.json()) as { text: string };
}
