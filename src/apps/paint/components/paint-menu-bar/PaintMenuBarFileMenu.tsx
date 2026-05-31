import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { PaintMenuBarViewModel } from "./usePaintMenuBar";

export function PaintMenuBarFileMenu({ vm }: { vm: PaintMenuBarViewModel }) {
  const {
    t,
    fileInputRef,
    handleFileSelect,
    onNewFile,
    onImportFile,
    onSave,
    currentFilePath,
    onExportFile,
    onClose,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("common.menu.file")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem onClick={onNewFile} className="text-md h-6 px-3">
          {t("apps.paint.menu.newFile")}
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem onClick={onImportFile} className="text-md h-6 px-3">
          {t("apps.paint.menu.open")}
        </MenubarItem>
        <MenubarItem onClick={onSave} className="text-md h-6 px-3">
          {currentFilePath
            ? t("apps.paint.menu.save")
            : t("apps.paint.menu.saveEllipsis")}
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".png,.jpg,.jpeg"
          className="hidden"
        />
        <MenubarItem
          onClick={() => fileInputRef.current?.click()}
          className="text-md h-6 px-3"
        >
          {t("apps.paint.menu.importFromDevice")}
        </MenubarItem>
        <MenubarItem onClick={onExportFile} className="text-md h-6 px-3">
          {t("apps.paint.menu.export")}
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem onClick={onClose} className="text-md h-6 px-3">
          {t("common.menu.close")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
