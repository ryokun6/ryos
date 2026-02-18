import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import type { NoteLabelType } from "@/stores/useSynthStore";
import { useAppMenuBar } from "@/hooks/useAppMenuBar";

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
  const appId = "synth";
  const {
    t,
    appName,
    isXpTheme,
    isMacOsxTheme,
    isShareDialogOpen,
    setIsShareDialogOpen,
  } = useAppMenuBar(appId);

  return (
    <MenuBar inWindowFrame={isXpTheme}>
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.synth.menu.synthHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("common.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.synth.menu.aboutSynth")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
