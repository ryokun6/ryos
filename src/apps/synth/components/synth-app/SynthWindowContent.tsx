import { cn } from "@/lib/utils";
import { SynthPresetsToolbar } from "./SynthPresetsToolbar";
import { SynthControlsPanel } from "./SynthControlsPanel";
import { SynthKeyboard } from "./SynthKeyboard";
import { SynthStatusDisplay } from "./SynthStatusDisplay";
import type { SynthAppController } from "./useSynthAppController";

type SynthWindowContentProps = {
  c: SynthAppController;
};

export function SynthWindowContent({ c }: SynthWindowContentProps) {
  const {
    appContainerRef,
    isMacOSTheme,
    statusMessage,
  } = c;

  return (
    <div
      ref={appContainerRef}
      className={cn(
        "flex flex-col size-full text-white overflow-hidden select-none synth-force-font",
        !isMacOSTheme && "bg-[#1a1a1a]"
      )}
    >
      <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
        <SynthPresetsToolbar
          t={c.t}
          presets={c.presets}
          currentPreset={c.currentPreset}
          loadPreset={c.loadPreset}
          loadPresetById={c.loadPresetById}
          handleOctaveDown={c.handleOctaveDown}
          handleOctaveUp={c.handleOctaveUp}
          toggleControls={c.toggleControls}
          isMacOSTheme={c.isMacOSTheme}
          isSystem7Theme={c.isSystem7Theme}
          isClassicTheme={c.isClassicTheme}
          isXpTheme={c.isXpTheme}
        />

        <SynthControlsPanel
          t={c.t}
          isControlsVisible={c.isControlsVisible}
          currentPreset={c.currentPreset}
          handleOscillatorChange={c.handleOscillatorChange}
          handleEnvelopeChange={c.handleEnvelopeChange}
          handleEffectChange={c.handleEffectChange}
          addPreset={c.addPreset}
          analyzerRef={c.analyzerRef}
          isMacOSTheme={c.isMacOSTheme}
          isSystem7Theme={c.isSystem7Theme}
          isClassicTheme={c.isClassicTheme}
          isXpTheme={c.isXpTheme}
        />

        <SynthKeyboard
          keyboardContainerRef={c.keyboardContainerRef}
          whiteKeys={c.whiteKeys}
          blackKeys={c.blackKeys}
          visibleKeyCount={c.visibleKeyCount}
          pressedNotes={c.pressedNotes}
          handlePointerDown={c.handlePointerDown}
          handlePointerEnter={c.handlePointerEnter}
          handlePointerUp={c.handlePointerUp}
          labelType={c.labelType}
          keyToNoteMap={c.keyToNoteMap}
          isSystem7Theme={c.isSystem7Theme}
          isMacOSTheme={c.isMacOSTheme}
        />
      </div>

      <SynthStatusDisplay message={statusMessage} />
    </div>
  );
}
