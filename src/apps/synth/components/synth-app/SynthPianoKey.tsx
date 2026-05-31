import type { FC, PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { NoteLabelType } from "@/stores/useSynthStore";

export const SynthPianoKey: FC<{
  note: string;
  isBlack?: boolean;
  isPressed?: boolean;
  onPointerDownKey: (note: string, e: PointerEvent<HTMLButtonElement>) => void;
  onPointerEnterKey: (note: string, e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUpKey: (note: string, e: PointerEvent<HTMLButtonElement>) => void;
  labelType: NoteLabelType;
  keyMap: Record<string, string>;
  isSystem7Theme?: boolean;
}> = ({
  note,
  isBlack = false,
  isPressed = false,
  onPointerDownKey,
  onPointerEnterKey,
  onPointerUpKey,
  labelType,
  keyMap,
  isSystem7Theme = false,
}) => {
  const getKeyLabel = () => {
    if (labelType === "off") return "";
    if (labelType === "key") {
      const keyboardKey = Object.entries(keyMap).find(
        ([, noteValue]) => noteValue === note
      )?.[0];
      return keyboardKey ? keyboardKey.toUpperCase() : "";
    }
    return note;
  };

  const label = getKeyLabel();

  return (
    <button
      type="button"
      data-note={note}
      className={cn(
        "piano-key relative touch-none select-none outline-none transition-colors duration-100",
        isSystem7Theme && "system7-square",
        isBlack
          ? cn(
              "absolute top-0 left-[65%] w-[74%] h-[70%] rounded-b-md z-10",
              isPressed ? "bg-[#ff33ff]" : "bg-black hover:bg-[#333333]"
            )
          : cn(
              "size-full border border-[#333333] rounded-b-md",
              isPressed ? "bg-[#ff33ff]" : "bg-white hover:bg-[#f5f5f5]"
            )
      )}
      onPointerDown={(e) => onPointerDownKey(note, e)}
      onPointerEnter={(e) => onPointerEnterKey(note, e)}
      onPointerUp={(e) => onPointerUpKey(note, e)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label && (
        <span
          className={cn(
            "absolute bottom-2 left-1/2 transform -translate-x-1/2 text-[10px] pointer-events-none font-geneva-12 select-none",
            isBlack ? "text-white" : "text-black"
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
};
