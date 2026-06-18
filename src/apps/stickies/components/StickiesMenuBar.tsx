import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import { useTranslation } from "react-i18next";
import { StickyColor } from "@/stores/useStickiesStore";

interface StickiesMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onNewNote: (color?: StickyColor) => void;
  onClearAll: () => void;
  selectedNoteId: string | null;
  onChangeColor: (id: string, color: StickyColor) => void;
  onDeleteNote: (id: string) => void;
}

const COLORS: { value: StickyColor; labelKey: string; hex: string }[] = [
  { value: "yellow", labelKey: "apps.stickies.colors.yellow", hex: "#FFFFA5" },
  { value: "blue", labelKey: "apps.stickies.colors.blue", hex: "#D4EDFC" },
  { value: "green", labelKey: "apps.stickies.colors.green", hex: "#D4F5D4" },
  { value: "pink", labelKey: "apps.stickies.colors.pink", hex: "#FFD4E5" },
  { value: "purple", labelKey: "apps.stickies.colors.purple", hex: "#E8D4F5" },
  { value: "orange", labelKey: "apps.stickies.colors.orange", hex: "#FFE4C4" },
];

export function StickiesMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onNewNote,
  onClearAll,
  selectedNoteId,
  onChangeColor,
  onDeleteNote,
}: StickiesMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("stickies");

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.stickies.menu.newNote"),
          onClick: () => onNewNote(),
          shortcutId: "newFile",
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.stickies.menu.clearAll"),
          onClick: onClearAll,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.stickies.menu.syncStickies", {
            defaultValue: "Sync Stickies",
          }),
          onClick: () => requestCloudSyncDomainCheck("stickies"),
        },
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    },
    {
      label: t("apps.stickies.menu.note"),
      items: [
        {
          type: "submenu",
          label: t("apps.stickies.menu.color"),
          disabled: !selectedNoteId,
          items: COLORS.map((color) => ({
            type: "action" as const,
            label: (
              <>
                <span
                  className="w-4 h-3 border border-black/30 inline-block"
                  style={{ backgroundColor: color.hex }}
                />
                {t(color.labelKey)}
              </>
            ),
            onClick: () =>
              selectedNoteId && onChangeColor(selectedNoteId, color.value),
            className: "flex items-center gap-2",
          })),
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.stickies.menu.deleteNote"),
          onClick: () => selectedNoteId && onDeleteNote(selectedNoteId),
          disabled: !selectedNoteId,
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.stickies.menu.help")}
      aboutItemLabel={t("apps.stickies.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
