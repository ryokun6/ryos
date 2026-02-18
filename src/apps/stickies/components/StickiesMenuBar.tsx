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

const COLORS: { value: StickyColor; label: string; hex: string }[] = [
  { value: "yellow", label: "Yellow", hex: "#FFFFA5" },
  { value: "blue", label: "Blue", hex: "#D4EDFC" },
  { value: "green", label: "Green", hex: "#D4F5D4" },
  { value: "pink", label: "Pink", hex: "#FFD4E5" },
  { value: "purple", label: "Purple", hex: "#E8D4F5" },
  { value: "orange", label: "Orange", hex: "#FFE4C4" },
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
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
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
                  className="text-md h-6 px-3 flex items-center gap-2"
                >
                  <span 
                    className="w-4 h-3 border border-black/30 inline-block"
                    style={{ backgroundColor: color.hex }}
                  />
                  {color.label}
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
