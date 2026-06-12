import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
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

  const labelCheckbox = (type: NoteLabelType, label: string) =>
    ({
      type: "checkbox",
      label,
      checked: labelType === type,
      onChange: (checked: boolean) => {
        if (checked) onLabelTypeChange(type);
      },
    } as const);

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.synth.menu.newPreset"),
          onClick: onAddPreset,
        },
        {
          type: "action",
          label: t("apps.synth.menu.resetSynth"),
          onClick: onReset,
        },
        { type: "separator" },
        { type: "action", label: t("common.menu.close"), onClick: onClose },
      ],
    },
    {
      label: t("apps.synth.menu.presets"),
      items: presets.map((preset) => ({
        type: "checkbox" as const,
        label: preset.name,
        checked: currentPresetId === preset.id,
        onChange: (checked: boolean) => {
          if (checked) onLoadPresetById(preset.id);
        },
      })),
    },
    {
      label: t("common.menu.view"),
      items: [
        labelCheckbox("note", t("apps.synth.menu.noteLabels")),
        labelCheckbox("key", t("apps.synth.menu.keyLabels")),
        labelCheckbox("off", t("apps.synth.menu.noLabels")),
      ],
    },
  ];

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
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
