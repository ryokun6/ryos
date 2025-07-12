import { Editor } from "@tiptap/react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import React from "react";
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";

interface WorkIntelMenuBarProps {
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
  isPreviewMode: boolean;
  onTogglePreview: () => void;
}

export function WorkIntelMenuBar({
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
  isPreviewMode,
  onTogglePreview,
}: WorkIntelMenuBarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <MenuBar>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".txt,.html,.md,.markdown"
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
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("bold")}
            onCheckedChange={() => editor?.chain().focus().toggleBold().run()}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Bold</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("italic")}
            onCheckedChange={() => editor?.chain().focus().toggleItalic().run()}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Italic</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("underline")}
            onCheckedChange={() =>
              editor?.chain().focus().toggleUnderline().run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Underline</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("paragraph")}
            onCheckedChange={() => editor?.chain().focus().setParagraph().run()}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Text</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("heading", { level: 1 })}
            onCheckedChange={() =>
              editor?.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Heading 1</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("heading", { level: 2 })}
            onCheckedChange={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Heading 2</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("heading", { level: 3 })}
            onCheckedChange={() =>
              editor?.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Heading 3</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuCheckboxItem
            checked={editor?.isActive({ textAlign: "left" })}
            onCheckedChange={() =>
              editor?.chain().focus().setTextAlign("left").run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Align Left</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive({ textAlign: "center" })}
            onCheckedChange={() =>
              editor?.chain().focus().setTextAlign("center").run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Align Center</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive({ textAlign: "right" })}
            onCheckedChange={() =>
              editor?.chain().focus().setTextAlign("right").run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Align Right</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("bulletList")}
            onCheckedChange={() =>
              editor?.chain().focus().toggleBulletList().run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Bullet List</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("orderedList")}
            onCheckedChange={() =>
              editor?.chain().focus().toggleOrderedList().run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Numbered List</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={editor?.isActive("taskList")}
            onCheckedChange={() =>
              editor?.chain().focus().toggleTaskList().run()
            }
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Task List</span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            View
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuCheckboxItem
            checked={!isPreviewMode}
            onCheckedChange={() => !isPreviewMode || onTogglePreview()}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Edit Mode</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={isPreviewMode}
            onCheckedChange={() => isPreviewMode || onTogglePreview()}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Preview Mode</span>
          </DropdownMenuCheckboxItem>
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
            WorkIntel Help
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const appId = "workintel"; // Specific app ID
              const shareUrl = generateAppShareUrl(appId);
              if (!shareUrl) return;
              try {
                await navigator.clipboard.writeText(shareUrl);
                toast.success("App link copied!", {
                  description: `Link to ${appId} copied to clipboard.`,
                });
              } catch (err) {
                console.error("Failed to copy app link: ", err);
                toast.error("Failed to copy link", {
                  description: "Could not copy link to clipboard.",
                });
              }
            }}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Share App...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About WorkIntel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuBar>
  );
} 