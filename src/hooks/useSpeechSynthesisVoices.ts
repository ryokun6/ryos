import { useEffect, useState } from "react";
import { getBrowserSpeechSynthesis } from "@/utils/browserSpeech";

/**
 * Browser speechSynthesis voices, sorted by language then name.
 * Voice lists load asynchronously on some engines (Chrome), so this
 * re-reads on `voiceschanged`.
 */
export function useSpeechSynthesisVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const synth = getBrowserSpeechSynthesis();
    if (!synth) return;
    const load = () => {
      const next = [...synth.getVoices()].sort(
        (a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)
      );
      setVoices(next);
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  return voices;
}
