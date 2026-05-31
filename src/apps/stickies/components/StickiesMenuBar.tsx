import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
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
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("stickies");

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.stickies.menu.help")}
      aboutItemLabel={t("apps.stickies.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={() => onNewNote()} className={MENUBAR_ITEM_CLASS}>
            {t("apps.stickies.menu.newNote")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onClearAll} className={MENUBAR_ITEM_CLASS}>
            {t("apps.stickies.menu.clearAll")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={() => requestCloudSyncDomainCheck("stickies")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.stickies.menu.syncStickies", {
              defaultValue: "Sync Stickies",
            })}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onClose} className={MENUBAR_ITEM_CLASS}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("apps.stickies.menu.note")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSub>
            <MenubarSubTrigger
              disabled={!selectedNoteId}
              className={MENUBAR_ITEM_CLASS}
            >
              {t("apps.stickies.menu.color")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              {COLORS.map((color) => (
                <MenubarItem
                  key={color.value}
                  onClick={() =>
                    selectedNoteId && onChangeColor(selectedNoteId, color.value)
                  }
                  className={`${MENUBAR_ITEM_CLASS} flex items-center gap-2`}
                >
                  <span
                    className="w-4 h-3 border border-black/30 inline-block"
                    style={{ backgroundColor: color.hex }}
                  />
                  {t(color.labelKey)}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            disabled={!selectedNoteId}
            onClick={() => selectedNoteId && onDeleteNote(selectedNoteId)}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.stickies.menu.deleteNote")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
