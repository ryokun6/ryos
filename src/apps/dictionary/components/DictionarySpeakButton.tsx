import { SpeakerHigh } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { DictionarySpeakRequest, DictionarySpeech } from "../hooks/useDictionarySpeech";

export function DictionarySpeakButton({
  speech,
  request,
  label,
  stopLabel,
  size = 16,
  className,
}: {
  speech: DictionarySpeech;
  request: DictionarySpeakRequest;
  label: string;
  stopLabel: string;
  size?: number;
  className?: string;
}) {
  if (!request.audioUrl && !speech.canSpeak(request.lang)) return null;
  const isSpeaking = speech.speakingKey === request.key;
  const title = isSpeaking ? stopLabel : label;
  return (
    <button
      type="button"
      className={cn(
        "shrink-0 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10",
        isSpeaking
          ? "text-blue-600 dark:text-blue-400"
          : "text-black/50 dark:text-white/50",
        className
      )}
      title={title}
      aria-label={title}
      aria-pressed={isSpeaking}
      onClick={(event) => {
        event.stopPropagation();
        speech.speak(request);
      }}
    >
      <SpeakerHigh size={size} weight={isSpeaking ? "fill" : "regular"} />
    </button>
  );
}
