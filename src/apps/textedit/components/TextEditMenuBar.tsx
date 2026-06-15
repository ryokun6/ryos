import { Editor } from "@tiptap/react";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { ShortcutHint } from "@/components/shared/menubar/ShortcutHint";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import { useInstanceUndoRedo } from "@/hooks/useUndoRedo";

interface TextEditMenuBarProps {
  editor: Editor | null;
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  isWindowOpen: boolean;
  onNewFile: () => void;
  onImportFile: () => void;
  onImportFromDevice: () => void;
  onExportFile: (format: "html" | "md" | "txt") => void | Promise<void>;
  onSave: () => void;
  hasUnsavedChanges: boolean;
  currentFilePath: string | null;
  instanceId?: string;
}

export function TextEditMenuBar({
  editor,
  onClose,
  onShowHelp,
  onShowAbout,
  onNewFile,
  onImportFile,
  onImportFromDevice,
  onExportFile,
  onSave,
  currentFilePath,
  instanceId,
}: TextEditMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("textedit");
  const { canUndo, canRedo, undo, redo } = useInstanceUndoRedo(instanceId || "");

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.textedit.menu.texteditHelp")}
      aboutItemLabel={t("apps.textedit.menu.aboutTextEdit")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onNewFile}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.newFile")}
            <ShortcutHint id="newFile" />
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onImportFile}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.open")}
            <ShortcutHint id="open" />
          </MenubarItem>
          <MenubarItem
            onClick={onSave}
            className="text-md h-6 px-3"
          >
            {currentFilePath ? t("apps.textedit.menu.save") : t("apps.textedit.menu.saveEllipsis")}
            <ShortcutHint id="save" />
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onImportFromDevice}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.importFromDevice")}
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.textedit.menu.exportAs")}
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem
                onClick={() => onExportFile("html")}
                className="text-md h-6 px-3"
              >
                {t("apps.textedit.menu.html")}
              </MenubarItem>
              <MenubarItem
                onClick={() => onExportFile("md")}
                className="text-md h-6 px-3"
              >
                {t("apps.textedit.menu.markdown")}
              </MenubarItem>
              <MenubarItem
                onClick={() => onExportFile("txt")}
                className="text-md h-6 px-3"
              >
                {t("apps.textedit.menu.plainText")}
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
            <ShortcutHint id="close" />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={undo}
            disabled={!canUndo}
            className="text-md h-6 px-3 disabled:text-os-text-disabled"
          >
            {t("common.menu.undo")}
            <ShortcutHint id="undo" />
          </MenubarItem>
          <MenubarItem
            onClick={redo}
            disabled={!canRedo}
            className="text-md h-6 px-3 disabled:text-os-text-disabled"
          >
            {t("common.menu.redo")}
            <ShortcutHint id="redo" />
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={() => {
              if (window.getSelection()?.toString()) {
                document.execCommand("copy");
              }
            }}
            className="text-md h-6 px-3"
          >
            {t("common.menu.copy")}
            <ShortcutHint id="copy" />
          </MenubarItem>
          <MenubarItem
            onClick={() => {
              if (window.getSelection()?.toString()) {
                document.execCommand("cut");
              }
            }}
            className="text-md h-6 px-3"
          >
            {t("common.menu.cut")}
            <ShortcutHint id="cut" />
          </MenubarItem>
          <MenubarItem
            onClick={() => document.execCommand("paste")}
            className="text-md h-6 px-3"
          >
            {t("common.menu.paste")}
            <ShortcutHint id="paste" />
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={() => editor?.chain().focus().selectAll().run()}
            className="text-md h-6 px-3"
          >
            {t("common.menu.selectAll")}
            <ShortcutHint id="selectAll" />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.textedit.menu.format")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={editor?.isActive("bold") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleBold().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.bold")}
            <ShortcutHint id="bold" />
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("italic") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleItalic().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.italic")}
            <ShortcutHint id="italic" />
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("underline") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleUnderline().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.underline")}
            <ShortcutHint id="underline" />
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarCheckboxItem
            checked={editor?.isActive("paragraph") ?? false}
            onCheckedChange={() => editor?.chain().focus().setParagraph().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.text")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("heading", { level: 1 }) ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.heading1")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("heading", { level: 2 }) ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.heading2")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("heading", { level: 3 }) ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.heading3")}
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarCheckboxItem
            checked={editor?.isActive({ textAlign: "left" }) ?? false}
            onCheckedChange={() => editor?.chain().focus().setTextAlign("left").run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.alignLeft")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive({ textAlign: "center" }) ?? false}
            onCheckedChange={() => editor?.chain().focus().setTextAlign("center").run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.alignCenter")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive({ textAlign: "right" }) ?? false}
            onCheckedChange={() => editor?.chain().focus().setTextAlign("right").run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.alignRight")}
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarCheckboxItem
            checked={editor?.isActive("bulletList") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleBulletList().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.bulletList")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("orderedList") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleOrderedList().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.numberedList")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("taskList") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleTaskList().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.taskList")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

    </AppMenuBarShell>
  );
}
