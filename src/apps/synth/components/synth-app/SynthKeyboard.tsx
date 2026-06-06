import { cn } from "@/lib/utils";
import { SynthPianoKey } from "./SynthPianoKey";
import type { SynthAppController } from "./useSynthAppController";

type SynthKeyboardProps = Pick<
  SynthAppController,
  | "keyboardContainerRef"
  | "whiteKeys"
  | "blackKeys"
  | "visibleKeyCount"
  | "pressedNotes"
  | "handlePointerDown"
  | "handlePointerEnter"
  | "handlePointerUp"
  | "labelType"
  | "keyToNoteMap"
  | "isSystem7Theme"
  | "isMacOSTheme"
>;

export function SynthKeyboard({
  keyboardContainerRef,
  whiteKeys,
  blackKeys,
  visibleKeyCount,
  pressedNotes,
  handlePointerDown,
  handlePointerEnter,
  handlePointerUp,
  labelType,
  keyToNoteMap,
  isSystem7Theme,
  isMacOSTheme,
}: SynthKeyboardProps) {
  return (
    <div
      className={cn(
        "flex-grow flex flex-col justify-end min-h-[160px] w-full",
        isMacOSTheme ? "p-0" : "bg-black p-4"
      )}
    >
      <div
        ref={keyboardContainerRef}
        className={cn("relative size-full", isMacOSTheme && "piano-keyboard-aqua")}
      >
        <div className="absolute inset-0 h-full flex w-full">
          {whiteKeys.map((note) => (
            <div key={note} className="flex-1 relative">
              <SynthPianoKey
                note={note}
                isPressed={pressedNotes[note]}
                onPointerDownKey={handlePointerDown}
                onPointerEnterKey={handlePointerEnter}
                onPointerUpKey={handlePointerUp}
                labelType={labelType}
                keyMap={keyToNoteMap}
                isSystem7Theme={isSystem7Theme}
                isMacOSTheme={isMacOSTheme}
              />
            </div>
          ))}
        </div>

        <div className="absolute inset-0 size-full flex pointer-events-none">
          {blackKeys.map((note, index) => {
            const prevNote = blackKeys[index - 1] ?? "none";
            const nextNote = blackKeys[index + 1] ?? "none";
            if (visibleKeyCount > 0 && index === blackKeys.length - 1) {
              return (
                <div
                  key={`empty-trailing-${prevNote}`}
                  className="flex-1 relative"
                />
              );
            }

            return (
              <div
                key={note ?? `empty-${prevNote}-${nextNote}`}
                className="flex-1 relative"
              >
                {note && (
                  <div className="pointer-events-auto w-full">
                    <SynthPianoKey
                      note={note}
                      isBlack
                      isPressed={pressedNotes[note]}
                      onPointerDownKey={handlePointerDown}
                      onPointerEnterKey={handlePointerEnter}
                      onPointerUpKey={handlePointerUp}
                      labelType={labelType}
                      keyMap={keyToNoteMap}
                      isSystem7Theme={isSystem7Theme}
                      isMacOSTheme={isMacOSTheme}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
