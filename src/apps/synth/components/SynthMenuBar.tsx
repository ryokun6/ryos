import { useState } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { cn } from "@/lib/utils";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "synth";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 text-md px-2 py-1 border-none focus-visible:ring-0">
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
        <MenubarTrigger className="h-6 text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.synth.menu.presets")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {presets.map((preset) => (
            <MenubarItem
              key={preset.id}
              onClick={() => onLoadPresetById(preset.id)}
              className="text-md h-6 px-3"
            >
              <span className={cn(currentPresetId !== preset.id && "pl-4")}>
                {currentPresetId === preset.id ? "✓ " : ""}
                {preset.name}
              </span>
            </MenubarItem>
          ))}
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={() => onLabelTypeChange("note")}
            className="text-md h-6 px-3"
          >
            <span className={cn(labelType !== "note" && "pl-4")}>
              {labelType === "note" ? "✓ " : ""}
              {t("apps.synth.menu.noteLabels")}
            </span>
          </MenubarItem>
          <MenubarItem
            onClick={() => onLabelTypeChange("key")}
            className="text-md h-6 px-3"
          >
            <span className={cn(labelType !== "key" && "pl-4")}>
              {labelType === "key" ? "✓ " : ""}
              {t("apps.synth.menu.keyLabels")}
            </span>
          </MenubarItem>
          <MenubarItem
            onClick={() => onLabelTypeChange("off")}
            className="text-md h-6 px-3"
          >
            <span className={cn(labelType !== "off" && "pl-4")}>
              {labelType === "off" ? "✓ " : ""}
              {t("apps.synth.menu.noLabels")}
            </span>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.synth.menu.synthHelp")}
          </MenubarItem>
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
