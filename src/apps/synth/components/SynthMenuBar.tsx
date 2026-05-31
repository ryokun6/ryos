import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import type { NoteLabelType } from "@/stores/useSynthStore";
import { useTranslation } from "react-i18next";

interface SynthMenuBarProps {
  onAddPreset: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onReset: () => void;
  onClose: () => void;
  presets: Array<{ id: string; name: string }>;
  currentPresetId: string;
  onLoadPresetById: (id: string) => void;
  labelType: NoteLabelType;
  onLabelTypeChange: (type: NoteLabelType) => void;
}

export function SynthMenuBar({
  onAddPreset,
  onShowHelp,
  onShowAbout,
  onReset,
  onClose,
  presets,
  currentPresetId,
  onLoadPresetById,
  labelType,
  onLabelTypeChange,
}: SynthMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("synth");

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.synth.menu.synthHelp")}
      aboutItemLabel={t("apps.synth.menu.aboutSynth")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onAddPreset}
            className="text-md h-6 px-3"
          >
            {t("apps.synth.menu.newPreset")}
          </MenubarItem>
          <MenubarItem
            onClick={onReset}
            className="text-md h-6 px-3"
          >
            {t("apps.synth.menu.resetSynth")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Presets Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.synth.menu.presets")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {presets.map((preset) => (
            <MenubarCheckboxItem
              key={preset.id}
              checked={currentPresetId === preset.id}
              onCheckedChange={(checked) => {
                if (checked) onLoadPresetById(preset.id);
              }}
              className="text-md h-6 px-3"
            >
              {preset.name}
            </MenubarCheckboxItem>
          ))}
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={labelType === "note"}
            onCheckedChange={(checked) => {
              if (checked) onLabelTypeChange("note");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.synth.menu.noteLabels")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={labelType === "key"}
            onCheckedChange={(checked) => {
              if (checked) onLabelTypeChange("key");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.synth.menu.keyLabels")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={labelType === "off"}
            onCheckedChange={(checked) => {
              if (checked) onLabelTypeChange("off");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.synth.menu.noLabels")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

    </AppMenuBarShell>
  );
}
