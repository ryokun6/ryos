import { Editor } from "@tiptap/react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import React, { useState } from "react";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
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
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            {t("common.menu.file")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onNewFile}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.textedit.menu.newFile")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onImportFile}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.textedit.menu.open")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onSave}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {currentFilePath ? t("apps.textedit.menu.save") : t("apps.textedit.menu.saveEllipsis")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => fileInputRef.current?.click()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.textedit.menu.importFromDevice")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              {t("apps.textedit.menu.exportAs")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => onExportFile("html")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.textedit.menu.html")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onExportFile("md")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.textedit.menu.markdown")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onExportFile("txt")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.textedit.menu.plainText")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.close")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            {t("common.menu.edit")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().undo().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.undo")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().redo().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.redo")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => {
              if (window.getSelection()?.toString()) {
                document.execCommand("copy");
              }
            }}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.copy")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (window.getSelection()?.toString()) {
                document.execCommand("cut");
              }
            }}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.cut")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => document.execCommand("paste")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.paste")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().selectAll().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.selectAll")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            {t("apps.textedit.menu.format")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("bold") && "pl-4")}>
              {editor?.isActive("bold") ? `✓ ${t("apps.textedit.menu.bold")}` : t("apps.textedit.menu.bold")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("italic") && "pl-4")}>
              {editor?.isActive("italic") ? `✓ ${t("apps.textedit.menu.italic")}` : t("apps.textedit.menu.italic")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("underline") && "pl-4")}>
              {editor?.isActive("underline") ? `✓ ${t("apps.textedit.menu.underline")}` : t("apps.textedit.menu.underline")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().setParagraph().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("paragraph") && "pl-4")}>
              {editor?.isActive("paragraph") ? `✓ ${t("apps.textedit.menu.text")}` : t("apps.textedit.menu.text")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span
              className={cn(
                !editor?.isActive("heading", { level: 1 }) && "pl-4"
              )}
            >
              {editor?.isActive("heading", { level: 1 })
                ? `✓ ${t("apps.textedit.menu.heading1")}`
                : t("apps.textedit.menu.heading1")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span
              className={cn(
                !editor?.isActive("heading", { level: 2 }) && "pl-4"
              )}
            >
              {editor?.isActive("heading", { level: 2 })
                ? `✓ ${t("apps.textedit.menu.heading2")}`
                : t("apps.textedit.menu.heading2")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span
              className={cn(
                !editor?.isActive("heading", { level: 3 }) && "pl-4"
              )}
            >
              {editor?.isActive("heading", { level: 3 })
                ? `✓ ${t("apps.textedit.menu.heading3")}`
                : t("apps.textedit.menu.heading3")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().setTextAlign("left").run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span
              className={cn(
                !editor?.isActive({ textAlign: "left" }) && "pl-4"
              )}
            >
              {editor?.isActive({ textAlign: "left" })
                ? `✓ ${t("apps.textedit.menu.alignLeft")}`
                : t("apps.textedit.menu.alignLeft")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().setTextAlign("center").run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span
              className={cn(
                !editor?.isActive({ textAlign: "center" }) && "pl-4"
              )}
            >
              {editor?.isActive({ textAlign: "center" })
                ? `✓ ${t("apps.textedit.menu.alignCenter")}`
                : t("apps.textedit.menu.alignCenter")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().setTextAlign("right").run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span
              className={cn(
                !editor?.isActive({ textAlign: "right" }) && "pl-4"
              )}
            >
              {editor?.isActive({ textAlign: "right" })
                ? `✓ ${t("apps.textedit.menu.alignRight")}`
                : t("apps.textedit.menu.alignRight")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("bulletList") && "pl-4")}>
              {editor?.isActive("bulletList") ? `✓ ${t("apps.textedit.menu.bulletList")}` : t("apps.textedit.menu.bulletList")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("orderedList") && "pl-4")}>
              {editor?.isActive("orderedList")
                ? `✓ ${t("apps.textedit.menu.numberedList")}`
                : t("apps.textedit.menu.numberedList")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("taskList") && "pl-4")}>
              {editor?.isActive("taskList") ? `✓ ${t("apps.textedit.menu.taskList")}` : t("apps.textedit.menu.taskList")}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            {t("common.menu.help")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.textedit.menu.texteditHelp")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.shareApp")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.textedit.menu.aboutTextEdit")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
