import { Input } from "@/components/ui/input";
import { SoundSlot } from "./SoundSlot";
import { Soundboard, PlaybackState } from "@/types/types";

interface SoundGridProps {
  board: Soundboard;
  playbackStates: PlaybackState[];
  isEditingTitle: boolean;
  onTitleChange: (name: string) => void;
  onTitleBlur: (name: string) => void;
  onTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSlotClick: (index: number) => void;
  onSlotDelete: (index: number) => void;
  onSlotEmojiClick: (index: number) => void;
  onSlotTitleClick: (index: number) => void;
  setIsEditingTitle: (isEditing: boolean) => void;
  showWaveforms: boolean;
  showEmojis: boolean;
}

export function SoundGrid({
  board,
  playbackStates,
  isEditingTitle,
  onTitleChange,
  onTitleBlur,
  onTitleKeyDown,
  onSlotClick,
  onSlotDelete,
  onSlotEmojiClick,
  onSlotTitleClick,
  setIsEditingTitle,
  showWaveforms,
  showEmojis,
}: SoundGridProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="py-6 px-4 md:px-8 md:py-4">
        <div className="max-w-2xl mx-auto flex flex-col">
          {isEditingTitle ? (
            <Input
              className="text-[24px] font-bold mb-2 text-left select-text"
              value={board.name}
              autoFocus
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={(e) => onTitleBlur(e.target.value)}
              onKeyDown={onTitleKeyDown}
            />
          ) : (
            <h1
              className="text-[24px] font-bold mb-2 text-left cursor-text hover:opacity-80 hover:bg-black/7 px-2 -ml-2 transition-all duration-300 ease-in-out transform origin-left rounded select-text"
              onClick={() => setIsEditingTitle(true)}
            >
              {board.name}
            </h1>
          )}
          <div className="grid grid-cols-3 gap-2 md:gap-4 flex-1">
            {board.slots && board.slots.map((slot, index) => (
              <SoundSlot
                key={index}
                slot={slot}
                isRecording={playbackStates[index].isRecording}
                isPlaying={playbackStates[index].isPlaying}
                onSlotClick={() => onSlotClick(index)}
                onDelete={() => onSlotDelete(index)}
                onEmojiClick={() => onSlotEmojiClick(index)}
                onTitleClick={() => onSlotTitleClick(index)}
                showWaveform={showWaveforms}
                showEmoji={showEmojis}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
