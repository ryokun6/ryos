import { MenuBar } from "@/components/layout/MenuBar";
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
import { useThemeStore } from "@/stores/useThemeStore";
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

const COLORS: { value: StickyColor; label: string; emoji: string }[] = [
  { value: "yellow", label: "Yellow", emoji: "🟡" },
  { value: "blue", label: "Blue", emoji: "🔵" },
  { value: "green", label: "Green", emoji: "🟢" },
  { value: "pink", label: "Pink", emoji: "🩷" },
  { value: "purple", label: "Purple", emoji: "🟣" },
  { value: "orange", label: "Orange", emoji: "🟠" },
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
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={() => onNewNote()} className="text-md h-6 px-3">
            {t("apps.stickies.menu.newNote")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClearAll} className="text-md h-6 px-3">
            {t("apps.stickies.menu.clearAll")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Note Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.stickies.menu.note")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSub>
            <MenubarSubTrigger disabled={!selectedNoteId} className="text-md h-6 px-3">
              {t("apps.stickies.menu.color")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              {COLORS.map((color) => (
                <MenubarItem
                  key={color.value}
                  onClick={() =>
                    selectedNoteId && onChangeColor(selectedNoteId, color.value)
                  }
                  className="text-md h-6 px-3"
                >
                  {color.emoji} {color.label}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            disabled={!selectedNoteId}
            onClick={() => selectedNoteId && onDeleteNote(selectedNoteId)}
            className="text-md h-6 px-3"
          >
            {t("apps.stickies.menu.deleteNote")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.stickies.menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.stickies.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
