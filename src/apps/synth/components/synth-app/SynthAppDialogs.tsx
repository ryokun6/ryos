import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { appMetadata } from "../..";
import type { SynthAppController } from "./useSynthAppController";

type SynthAppDialogsProps = Pick<
  SynthAppController,
  | "t"
  | "translatedHelpItems"
  | "isHelpOpen"
  | "setIsHelpOpen"
  | "isAboutOpen"
  | "setIsAboutOpen"
  | "isPresetDialogOpen"
  | "setIsPresetDialogOpen"
  | "isSavingNewPreset"
  | "presetName"
  | "setPresetName"
  | "savePreset"
>;

export function SynthAppDialogs({
  t,
  translatedHelpItems,
  isHelpOpen,
  setIsHelpOpen,
  isAboutOpen,
  setIsAboutOpen,
  isPresetDialogOpen,
  setIsPresetDialogOpen,
  isSavingNewPreset,
  presetName,
  setPresetName,
  savePreset,
}: SynthAppDialogsProps) {
  return (
    <>
      <HelpDialog
        isOpen={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        helpItems={translatedHelpItems}
        appId="synth"
      />

      <AboutDialog
        isOpen={isAboutOpen}
        onOpenChange={setIsAboutOpen}
        metadata={appMetadata}
        appId="synth"
      />

      <InputDialog
        isOpen={isPresetDialogOpen}
        onOpenChange={setIsPresetDialogOpen}
        onSubmit={savePreset}
        title={
          isSavingNewPreset
            ? t("apps.synth.dialogs.saveNewPreset")
            : t("apps.synth.dialogs.updatePreset")
        }
        description={
          isSavingNewPreset
            ? t("apps.synth.dialogs.enterPresetName")
            : t("apps.synth.dialogs.updatePresetName")
        }
        value={presetName}
        onChange={setPresetName}
      />
    </>
  );
}
