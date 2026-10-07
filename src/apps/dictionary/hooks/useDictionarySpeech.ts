import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechSynthesisVoices } from "@/hooks/useSpeechSynthesisVoices";
import type { DictionaryLanguage } from "@/shared/dictionary";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import type { DictionaryChineseScript } from "@/stores/useDictionaryStore";
import { createSpeechUtterance, getBrowserSpeechSynthesis } from "@/utils/browserSpeech";
import { pickDictionaryVoice } from "../utils/speech";
import { getDictionaryMediaUrl } from "../utils/anki/media";

const SPEECH_RATE = 0.9;

export interface DictionarySpeakRequest {
  /** Identifies the button so a second press stops it. */
  key: string;
  text: string;
  lang: DictionaryLanguage;
  /** Recorded pronunciation (Wiktionary); preferred over TTS when it plays. */
  audioUrl?: string;
  /** Imported Anki audio in the local media store; preferred over TTS. */
  mediaKey?: string;
}

/**
 * Read-aloud for the Dictionary: browser `speechSynthesis` with a voice
 * matched to the entry language, or a recorded pronunciation when the entry
 * has one. Only one clip plays at a time.
 */
export function useDictionarySpeech(chineseScript: DictionaryChineseScript) {
  const voices = useSpeechSynthesisVoices();
  const preferredVoiceURI = useAudioSettingsStore((s) => s.browserTtsVoiceURI);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingKeyRef = useRef<string | null>(null);

  const finish = useCallback((key: string) => {
    if (speakingKeyRef.current !== key) return;
    speakingKeyRef.current = null;
    setSpeakingKey(null);
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (speakingKeyRef.current) getBrowserSpeechSynthesis()?.cancel();
    speakingKeyRef.current = null;
    setSpeakingKey(null);
  }, []);

  const canSpeak = useCallback(
    (lang: DictionaryLanguage) => !!pickDictionaryVoice(voices, lang, chineseScript),
    [voices, chineseScript]
  );

  const speakWithVoice = useCallback(
    (request: DictionarySpeakRequest) => {
      const synth = getBrowserSpeechSynthesis();
      const voice = synth
        ? pickDictionaryVoice(synth.getVoices(), request.lang, chineseScript, preferredVoiceURI)
        : null;
      if (!synth || !voice) {
        finish(request.key);
        return;
      }
      const utterance = createSpeechUtterance(request.text, {
        lang: voice.lang,
        rate: SPEECH_RATE,
        voices: [voice],
      });
      utterance.onend = () => finish(request.key);
      utterance.onerror = () => finish(request.key);
      synth.cancel();
      synth.speak(utterance);
    },
    [chineseScript, preferredVoiceURI, finish]
  );

  const speak = useCallback(
    (request: DictionarySpeakRequest) => {
      const wasSpeaking = speakingKeyRef.current === request.key;
      stop();
      if (wasSpeaking) return;
      if (!request.text.trim() && !request.audioUrl && !request.mediaKey) return;
      speakingKeyRef.current = request.key;
      setSpeakingKey(request.key);

      const playUrl = (url: string) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => finish(request.key);
        audio.play().catch(() => {
          if (audioRef.current !== audio) return;
          audioRef.current = null;
          speakWithVoice(request);
        });
      };

      if (request.mediaKey) {
        void getDictionaryMediaUrl(request.mediaKey).then((url) => {
          if (speakingKeyRef.current !== request.key) return;
          if (url) playUrl(url);
          else if (request.audioUrl) playUrl(request.audioUrl);
          else speakWithVoice(request);
        });
        return;
      }
      if (!request.audioUrl) {
        speakWithVoice(request);
        return;
      }
      playUrl(request.audioUrl);
    },
    [stop, speakWithVoice, finish]
  );

  useEffect(() => stop, [stop]);

  return { speak, stop, canSpeak, speakingKey };
}

export type DictionarySpeech = ReturnType<typeof useDictionarySpeech>;
