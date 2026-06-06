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
  isMacOSTheme?: boolean;
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
  isMacOSTheme = false,
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
  const isAquaKey = isMacOSTheme;

  return (
    <button
      type="button"
      data-note={note}
      className={cn(
        "piano-key relative touch-none select-none outline-none",
        isAquaKey
          ? "piano-key-aqua transition-[transform,filter] duration-75"
          : "transition-colors duration-100",
        isSystem7Theme && "system7-square",
        isPressed && "piano-key-pressed",
        isBlack
          ? cn(
              "absolute top-0 left-[65%] w-[74%] h-[70%] rounded-b-md z-10",
              isAquaKey
                ? "piano-key-black"
                : isPressed
                  ? "bg-[#ff33ff]"
                  : "bg-black hover:bg-[#333333]"
            )
          : cn(
              "size-full rounded-b-md",
              isAquaKey
                ? "piano-key-white"
                : cn(
                    "border border-[#333333]",
                    isPressed ? "bg-[#ff33ff]" : "bg-white hover:bg-[#f5f5f5]"
                  )
            ),
        isAquaKey &&
          !isPressed &&
          (isBlack ? "bg-black" : "bg-white")
      )}
      onPointerDown={(e) => onPointerDownKey(note, e)}
      onPointerEnter={(e) => onPointerEnterKey(note, e)}
      onPointerUp={(e) => onPointerUpKey(note, e)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label && (
        <span
          className={cn(
            "absolute bottom-2 left-1/2 z-[1] -translate-x-1/2 text-[10px] pointer-events-none font-geneva-12 select-none",
            isBlack ? "text-white" : "text-black",
            isAquaKey && isBlack && "drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]"
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
};
