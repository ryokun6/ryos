import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
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
      <AppHelpAboutDialogs
        appId="synth"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpOpen}
        onHelpOpenChange={setIsHelpOpen}
        isAboutOpen={isAboutOpen}
        onAboutOpenChange={setIsAboutOpen}
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
