import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { ShortcutHint } from "@/components/shared/menubar/ShortcutHint";
import type { PaintMenuBarViewModel } from "./usePaintMenuBar";

export function PaintMenuBarEditMenu({ vm }: { vm: PaintMenuBarViewModel }) {
  const {
    t,
    onUndo,
    canUndo,
    onRedo,
    canRedo,
    onCut,
    onCopy,
    onPaste,
    onClear,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("common.menu.edit")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem
          onClick={onUndo}
          disabled={!canUndo}
          className={`text-md h-6 px-3 ${!canUndo ? "text-neutral-500" : ""}`}
        >
          {t("common.menu.undo")}
          <ShortcutHint id="undo" />
        </MenubarItem>
        <MenubarItem
          onClick={onRedo}
          disabled={!canRedo}
          className={`text-md h-6 px-3 ${!canRedo ? "text-neutral-500" : ""}`}
        >
          {t("common.menu.redo")}
          <ShortcutHint id="redo" />
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem onClick={onCut} className="text-md h-6 px-3">
          {t("common.menu.cut")}
          <ShortcutHint id="cut" />
        </MenubarItem>
        <MenubarItem onClick={onCopy} className="text-md h-6 px-3">
          {t("common.menu.copy")}
          <ShortcutHint id="copy" />
        </MenubarItem>
        <MenubarItem onClick={onPaste} className="text-md h-6 px-3">
          {t("common.menu.paste")}
          <ShortcutHint id="paste" />
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem onClick={onClear} className="text-md h-6 px-3">
          {t("common.menu.clear")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
