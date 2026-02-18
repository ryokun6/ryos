import { Editor } from "@tiptap/react";
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
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import React, { useState } from "react";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

interface TextEditMenuBarProps {
  editor: Editor | null;
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  isWindowOpen: boolean;
  onNewFile: () => void;
  onImportFile: () => void;
  onExportFile: (format: "html" | "md" | "txt") => void;
  onSave: () => void;
  hasUnsavedChanges: boolean;
  currentFilePath: string | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function TextEditMenuBar({
  editor,
  onClose,
  onShowHelp,
  onShowAbout,
  onNewFile,
  onImportFile,
  onExportFile,
  onSave,
  currentFilePath,
  handleFileSelect,
}: TextEditMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "textedit";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const isMacOsxTheme = currentTheme === "macosx";

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".txt,.html,.md"
        className="hidden"
      />
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
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onImportFile}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.open")}
          </MenubarItem>
          <MenubarItem
            onClick={onSave}
            className="text-md h-6 px-3"
          >
            {currentFilePath ? t("apps.textedit.menu.save") : t("apps.textedit.menu.saveEllipsis")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={() => fileInputRef.current?.click()}
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={() => editor?.chain().focus().undo().run()}
            className="text-md h-6 px-3"
          >
            {t("common.menu.undo")}
          </MenubarItem>
          <MenubarItem
            onClick={() => editor?.chain().focus().redo().run()}
            className="text-md h-6 px-3"
          >
            {t("common.menu.redo")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={() => {
              if (window.getSelection()?.toString()) {
                document.execCommand("copy");
              }
            }}
            className="text-md h-6 px-3"
          >
            {t("common.menu.copy")}
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
          </MenubarItem>
          <MenubarItem
            onClick={() => document.execCommand("paste")}
            className="text-md h-6 px-3"
          >
            {t("common.menu.paste")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={() => editor?.chain().focus().selectAll().run()}
            className="text-md h-6 px-3"
          >
            {t("common.menu.selectAll")}
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
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("italic") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleItalic().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.italic")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={editor?.isActive("underline") ?? false}
            onCheckedChange={() => editor?.chain().focus().toggleUnderline().run()}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.underline")}
          </MenubarCheckboxItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.textedit.menu.texteditHelp")}
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
                {t("apps.textedit.menu.aboutTextEdit")}
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
