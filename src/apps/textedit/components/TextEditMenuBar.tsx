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
            File
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onNewFile}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            New File
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onImportFile}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Open...
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onSave}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {currentFilePath ? "Save" : "Save..."}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => fileInputRef.current?.click()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Import from Device...
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              Export As...
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => onExportFile("html")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                HTML
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onExportFile("md")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onExportFile("txt")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                Plain Text
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Close
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
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().undo().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Undo
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().redo().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Redo
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
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (window.getSelection()?.toString()) {
                document.execCommand("cut");
              }
            }}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Cut
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => document.execCommand("paste")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Paste
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().selectAll().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Select All
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
            Format
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("bold") && "pl-4")}>
              {editor?.isActive("bold") ? "✓ Bold" : "Bold"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("italic") && "pl-4")}>
              {editor?.isActive("italic") ? "✓ Italic" : "Italic"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("underline") && "pl-4")}>
              {editor?.isActive("underline") ? "✓ Underline" : "Underline"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().setParagraph().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("paragraph") && "pl-4")}>
              {editor?.isActive("paragraph") ? "✓ Text" : "Text"}
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
                ? "✓ Heading 1"
                : "Heading 1"}
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
                ? "✓ Heading 2"
                : "Heading 2"}
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
                ? "✓ Heading 3"
                : "Heading 3"}
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
                ? "✓ Align Left"
                : "Align Left"}
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
                ? "✓ Align Center"
                : "Align Center"}
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
                ? "✓ Align Right"
                : "Align Right"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("bulletList") && "pl-4")}>
              {editor?.isActive("bulletList") ? "✓ Bullet List" : "Bullet List"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("orderedList") && "pl-4")}>
              {editor?.isActive("orderedList")
                ? "✓ Numbered List"
                : "Numbered List"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(!editor?.isActive("taskList") && "pl-4")}>
              {editor?.isActive("taskList") ? "✓ Task List" : "Task List"}
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
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            TextEdit Help
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Share App...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About TextEdit
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
