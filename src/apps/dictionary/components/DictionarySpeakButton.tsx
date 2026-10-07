import { SpeakerHigh } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { DictionarySpeakRequest, DictionarySpeech } from "../hooks/useDictionarySpeech";

export function DictionarySpeakButton({
  speech,
  request,
  label,
  stopLabel,
  size = 16,
  onLightSurface = false,
  className,
}: {
  speech: DictionarySpeech;
  request: DictionarySpeakRequest;
  label: string;
  stopLabel: string;
  size?: number;
  /** Always-white surfaces (flashcards) keep light-mode colors in dark mode. */
  onLightSurface?: boolean;
  className?: string;
}) {
  if (!request.audioUrl && !speech.canSpeak(request.lang)) return null;
  const isSpeaking = speech.speakingKey === request.key;
  const title = isSpeaking ? stopLabel : label;
  return (
    <button
      type="button"
      className={cn(
        "shrink-0 rounded p-1 hover:bg-black/5",
        !onLightSurface && "dark:hover:bg-white/10",
        isSpeaking
          ? cn("text-blue-600", !onLightSurface && "dark:text-blue-400")
          : cn("text-black/50", !onLightSurface && "dark:text-white/50"),
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
