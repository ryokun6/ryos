import { Button } from "@/components/ui/button";
import { SoundSlot as SoundSlotType } from "@/types/types";
import { Trash2 } from "lucide-react";
import { Waveform } from "./Waveform";

interface SoundSlotProps {
  slot: SoundSlotType;
  isRecording: boolean;
  isPlaying: boolean;
  onSlotClick: () => void;
  onDelete: () => void;
  onEmojiClick: () => void;
  onTitleClick: () => void;
  showWaveform: boolean;
  showEmoji: boolean;
}

export function SoundSlot({
  slot,
  isRecording,
  isPlaying,
  onSlotClick,
  onDelete,
  onEmojiClick,
  onTitleClick,
  showWaveform,
  showEmoji,
}: SoundSlotProps) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <Button
        variant="retro"
        className={`h-full w-full flex flex-col items-stretch justify-center relative p-2 md:p-2 group min-h-[106px] md:min-h-[110px] focus:outline-none focus:ring-0 ${
          isRecording ? "bg-destructive animate-pulse" : ""
        } ${
          isPlaying
            ? "[border-image:url('/button-default.svg')_60_stretch]"
            : ""
        }`}
        onClick={onSlotClick}
      >
        {slot.audioData && showWaveform && (
          <>
            <Waveform
              audioData={slot.audioData}
              isPlaying={isPlaying}
              className="z-10"
            />
            <div className="absolute top-1 right-1 flex gap-1 z-10">
              <div
                role="button"
                className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 md:h-6 md:w-6 hover:bg-white/50 rounded-md items-center justify-center cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
              </div>
            </div>
          </>
        )}
        <div
          className={`mb-[-4px] left-2 flex items-center gap-1 md:gap-2 transition-all duration-300 ease-in-out transform origin-left ${
            isPlaying ? "opacity-100 scale-100" : "opacity-60 scale-90"
          }`}
        >
          {showEmoji &&
            (slot.emoji ? (
              <span
                className={`text-xl md:text-xl hover:opacity-80 ${
                  slot.audioData && !isRecording
                    ? "cursor-pointer hover:bg-black/7 rounded px-0.5"
                    : "cursor-default"
                }`}
                onClick={(e) => {
                  if (!slot.audioData || isRecording) return;
                  e.stopPropagation();
                  onEmojiClick();
                }}
              >
                {slot.emoji}
              </span>
            ) : (
              <span
                className={`invisible group-hover:visible transition-opacity text-xl md:text-xl hover:opacity-80 ${
                  slot.audioData && !isRecording
                    ? "cursor-pointer hover:bg-black/7 rounded px-0.5"
                    : "cursor-default"
                }`}
                onClick={(e) => {
                  if (!slot.audioData || isRecording) return;
                  e.stopPropagation();
                  onEmojiClick();
                }}
              >
                {slot.audioData ? "💿" : "🎙️"}
              </span>
            ))}
          <span
            className={`text-[12px] whitespace-nowrap overflow-hidden pr-5 text-left rounded select-text font-geneva-12 [mask-image:linear-gradient(to_right,black_80%,transparent)] ${
              slot.audioData && !isRecording
                ? "cursor-pointer hover:bg-black/7 rounded px-0.5 py-2"
                : "cursor-default"
            }`}
            onClick={(e) => {
              if (!slot.audioData || isRecording) return;
              e.stopPropagation();
              onTitleClick();
            }}
            title={
              slot.audioData && !isRecording
                ? slot.title
                  ? "Edit title"
                  : "Add title"
                : ""
            }
          >
            {isRecording
              ? "Recording..."
              : slot.title || (
                  <span className="invisible group-hover:visible opacity-60 hover:opacity-100">
                    {slot.audioData ? "Title" : "Record"}
                  </span>
                )}
          </span>
        </div>
      </Button>
    </div>
  );
}
