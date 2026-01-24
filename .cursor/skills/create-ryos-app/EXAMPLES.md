# App Examples

Practical examples showing different app patterns and features.

## Simple Utility App

A basic app with minimal state (like Calculator):

```tsx
// components/CounterAppComponent.tsx
import { WindowFrame } from "@/components/layout/WindowFrame";
import { CounterMenuBar } from "./CounterMenuBar";
import { AppProps } from "@/apps/base/types";
import { useState } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { Button } from "@/components/ui/button";

export function CounterAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const [count, setCount] = useState(0);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const menuBar = <CounterMenuBar onClose={onClose} />;

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title="Counter"
        onClose={onClose}
        isForeground={isForeground}
        appId="counter"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{ minWidth: 200, minHeight: 150 }}
      >
        <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
          <span className="text-4xl font-os-mono">{count}</span>
          <div className="flex gap-2">
            <Button onClick={() => setCount(c => c - 1)}>-</Button>
            <Button onClick={() => setCount(0)} variant="outline">Reset</Button>
            <Button onClick={() => setCount(c => c + 1)}>+</Button>
          </div>
        </div>
      </WindowFrame>
    </>
  );
}
```

## App with Initial Data

Apps can receive data when opened (like Photos opening a specific image):

```tsx
// types/index.ts
export interface ViewerInitialData {
  filePath: string;
  mode?: "view" | "edit";
}

// components/ViewerAppComponent.tsx
import { AppProps } from "@/apps/base/types";
import { ViewerInitialData } from "../types";

export function ViewerAppComponent({
  initialData,
  // ... other props
}: AppProps<ViewerInitialData>) {
  // Use initial data
  const filePath = initialData?.filePath ?? "";
  const mode = initialData?.mode ?? "view";
  
  // ...
}
```

Opening from another app:

```tsx
import { useLaunchApp } from "@/hooks/useLaunchApp";

function MyComponent() {
  const launchApp = useLaunchApp();
  
  const openViewer = () => {
    launchApp("viewer", {
      filePath: "/path/to/file.txt",
      mode: "edit",
    });
  };
}
```

## App with Global Store

For apps needing persistent state across instances:

```tsx
// stores/useNotesStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

interface NotesState {
  notes: Note[];
  addNote: (note: Omit<Note, "id" | "updatedAt">) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      notes: [],
      addNote: (note) =>
        set((state) => ({
          notes: [
            ...state.notes,
            { ...note, id: crypto.randomUUID(), updatedAt: Date.now() },
          ],
        })),
      updateNote: (id, updates) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
          ),
        })),
      deleteNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        })),
    }),
    { name: "notes-storage" }
  )
);
```

Using in the app:

```tsx
import { useNotesStore } from "@/stores/useNotesStore";

export function NotesAppComponent(props: AppProps) {
  const { notes, addNote, updateNote, deleteNote } = useNotesStore();
  
  // Access notes across all instances
}
```

## App with Transparent Material

For apps with custom backgrounds (like iPod, Photo Booth):

```tsx
<WindowFrame
  title="My App"
  material="transparent"  // Semi-transparent background
  // ... other props
>
  <div className="bg-gradient-to-b from-gray-800 to-gray-900 h-full">
    {/* Custom styled content */}
  </div>
</WindowFrame>
```

## App with No Title Bar

For immersive apps (like Videos, games):

```tsx
<WindowFrame
  title="Video Player"
  material="notitlebar"  // Floating title bar on hover
  // ... other props
>
  <div className="relative h-full bg-black">
    <video src={videoSrc} className="w-full h-full object-contain" />
    {/* Controls overlay */}
  </div>
</WindowFrame>
```

## App with Save Confirmation

Intercept close to show save dialog:

```tsx
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";

export function EditorAppComponent({ onClose, ...props }: AppProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <WindowFrame
        onClose={handleClose}
        interceptClose={hasUnsavedChanges}
        // ... other props
      >
        {/* Editor content */}
      </WindowFrame>

      <ConfirmDialog
        isOpen={showConfirmClose}
        onOpenChange={setShowConfirmClose}
        title="Unsaved Changes"
        message="You have unsaved changes. Do you want to save before closing?"
        confirmLabel="Save"
        cancelLabel="Don't Save"
        onConfirm={() => {
          saveDocument();
          onClose();
        }}
        onCancel={onClose}
      />
    </>
  );
}
```

## Menu Bar with Checkbox Items

For toggle options in menus:

```tsx
import { MenubarCheckboxItem } from "@/components/ui/menubar";

<MenubarMenu>
  <MenubarTrigger>View</MenubarTrigger>
  <MenubarContent>
    <MenubarCheckboxItem
      checked={showSidebar}
      onCheckedChange={setShowSidebar}
    >
      Show Sidebar
    </MenubarCheckboxItem>
    <MenubarCheckboxItem
      checked={showStatusBar}
      onCheckedChange={setShowStatusBar}
    >
      Show Status Bar
    </MenubarCheckboxItem>
  </MenubarContent>
</MenubarMenu>
```

## Menu Bar with Submenus

For nested menu options:

```tsx
import { MenubarSub, MenubarSubTrigger, MenubarSubContent } from "@/components/ui/menubar";

<MenubarMenu>
  <MenubarTrigger>Format</MenubarTrigger>
  <MenubarContent>
    <MenubarSub>
      <MenubarSubTrigger>Font Size</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarItem onClick={() => setFontSize(12)}>Small</MenubarItem>
        <MenubarItem onClick={() => setFontSize(14)}>Medium</MenubarItem>
        <MenubarItem onClick={() => setFontSize(16)}>Large</MenubarItem>
      </MenubarSubContent>
    </MenubarSub>
    <MenubarSub>
      <MenubarSubTrigger>Theme</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarItem onClick={() => setEditorTheme("light")}>Light</MenubarItem>
        <MenubarItem onClick={() => setEditorTheme("dark")}>Dark</MenubarItem>
      </MenubarSubContent>
    </MenubarSub>
  </MenubarContent>
</MenubarMenu>
```

## Using Sound Effects

```tsx
import { useSound } from "@/hooks/useSound";

export function GameAppComponent(props: AppProps) {
  const { playSound } = useSound();

  const handleWin = () => {
    playSound("success");
    // Show win screen
  };

  const handleClick = () => {
    playSound("click");
    // Handle click
  };
}
```

## Launching Other Apps

```tsx
import { useLaunchApp } from "@/hooks/useLaunchApp";

export function FinderAppComponent(props: AppProps) {
  const launchApp = useLaunchApp();

  const openFile = (file: FileItem) => {
    if (file.type === "image") {
      launchApp("photos", { path: file.path });
    } else if (file.type === "text") {
      launchApp("textedit", { path: file.path });
    }
  };
}
```

## Theme-Specific Rendering

```tsx
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";

function MyComponent() {
  const currentTheme = useThemeStore((state) => state.current);
  
  return (
    <div className={cn(
      "p-4",
      currentTheme === "system7" && "bg-white border-2 border-black",
      currentTheme === "macosx" && "bg-gray-100 rounded-lg shadow-md",
      currentTheme === "xp" && "bg-[#ECE9D8] border border-[#0054E3]",
      currentTheme === "win98" && "bg-[#C0C0C0] border-2 border-t-white border-l-white border-b-gray-500 border-r-gray-500"
    )}>
      {/* Content adapts to theme */}
    </div>
  );
}
```

## Full Example: Notes App

A complete example combining multiple patterns:

```tsx
// src/apps/notes/index.tsx
export const appMetadata = {
  name: "Notes",
  version: "1.0.0",
  creator: { name: "Ryo Lu", url: "https://ryo.lu" },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/notes.png",
};

export const helpItems = [
  { icon: "📝", title: "Create Note", description: "Click + to create a new note" },
  { icon: "🗑️", title: "Delete Note", description: "Right-click a note to delete" },
  { icon: "🔍", title: "Search", description: "Use the search bar to find notes" },
];
```

```tsx
// src/apps/notes/hooks/useNotesLogic.ts
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useNotesStore } from "@/stores/useNotesStore";
import { helpItems } from "..";

export function useNotesLogic({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("notes", helpItems);
  
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  
  const { notes, addNote, updateNote, deleteNote } = useNotesStore();
  
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  
  const filteredNotes = useMemo(() => {
    if (!searchQuery) return notes;
    const query = searchQuery.toLowerCase();
    return notes.filter(
      n => n.title.toLowerCase().includes(query) || 
           n.content.toLowerCase().includes(query)
    );
  }, [notes, searchQuery]);
  
  const selectedNote = notes.find(n => n.id === selectedNoteId);
  
  const handleCreateNote = () => {
    addNote({ title: "Untitled", content: "" });
  };
  
  return {
    t,
    translatedHelpItems,
    isXpTheme,
    currentTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    notes: filteredNotes,
    selectedNote,
    selectedNoteId,
    setSelectedNoteId,
    searchQuery,
    setSearchQuery,
    handleCreateNote,
    updateNote,
    deleteNote,
  };
}
```

```tsx
// src/apps/notes/components/NotesAppComponent.tsx
import { WindowFrame } from "@/components/layout/WindowFrame";
import { NotesMenuBar } from "./NotesMenuBar";
import { AppProps } from "@/apps/base/types";
import { useNotesLogic } from "../hooks/useNotesLogic";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { appMetadata } from "..";
import { cn } from "@/lib/utils";

export function NotesAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    notes,
    selectedNote,
    selectedNoteId,
    setSelectedNoteId,
    searchQuery,
    setSearchQuery,
    handleCreateNote,
    updateNote,
  } = useNotesLogic({ instanceId });

  const menuBar = (
    <NotesMenuBar
      onClose={onClose}
      onNewNote={handleCreateNote}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.notes.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="notes"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{ minWidth: 500, minHeight: 400 }}
      >
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-48 border-r border-os-window-border flex flex-col">
            <div className="p-2 border-b border-os-window-border">
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-sm"
              />
            </div>
            <ScrollArea className="flex-1">
              {notes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={cn(
                    "p-2 cursor-pointer border-b border-os-window-border",
                    selectedNoteId === note.id && "bg-os-selection-bg text-os-selection-text"
                  )}
                >
                  <div className="font-medium truncate">{note.title}</div>
                  <div className="text-xs opacity-60 truncate">{note.content}</div>
                </div>
              ))}
            </ScrollArea>
            <div className="p-2 border-t border-os-window-border">
              <Button onClick={handleCreateNote} size="sm" className="w-full">
                + New Note
              </Button>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 flex flex-col">
            {selectedNote ? (
              <>
                <Input
                  value={selectedNote.title}
                  onChange={(e) => updateNote(selectedNote.id, { title: e.target.value })}
                  className="border-0 border-b rounded-none font-bold text-lg"
                  placeholder="Title"
                />
                <textarea
                  value={selectedNote.content}
                  onChange={(e) => updateNote(selectedNote.id, { content: e.target.value })}
                  className="flex-1 p-3 resize-none outline-none font-os-ui bg-transparent"
                  placeholder="Start writing..."
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-os-text-secondary">
                Select a note or create a new one
              </div>
            )}
          </div>
        </div>
      </WindowFrame>

      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="notes"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="notes"
      />
    </>
  );
}
```
