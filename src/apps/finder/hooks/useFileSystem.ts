import { useState, useEffect } from "react";
import { FileItem } from "../components/FileList";
import { APP_STORAGE_KEYS } from "@/utils/storage";
import { getNonFinderApps } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";

// Database setup
const DB_NAME = "ryOS";
const DB_VERSION = 3;

// Store names
const STORES = {
  DOCUMENTS: "documents",
  IMAGES: "images",
  TRASH: "trash",
  CUSTOM_WALLPAPERS: "custom_wallpapers",
} as const;

// Database initialization
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
        db.createObjectStore(STORES.DOCUMENTS, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(STORES.IMAGES)) {
        db.createObjectStore(STORES.IMAGES, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(STORES.TRASH)) {
        db.createObjectStore(STORES.TRASH, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(STORES.CUSTOM_WALLPAPERS)) {
        db.createObjectStore(STORES.CUSTOM_WALLPAPERS, { keyPath: "name" });
      }
    };
  });
};

// Generic CRUD operations
const dbOperations = {
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put<T>(storeName: string, item: T): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName: string, key: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clear(storeName: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
};

// Sample documents
interface Document {
  name: string;
  content: string;
  type?: string;
}

interface TrashItem extends FileItem {
  originalPath: string;
  deletedAt: number;
}

export const DOCUMENTS: Document[] = [
  {
    name: "README.md",
    content: `# ryOS 8.2

A web-based operating system experience inspired by classic Mac OS System 7. Built using modern web technologies including React, Vite, TailwindCSS, and shadcn/ui components.

## Features
- Classic System 7 UI with authentic typography
- Window management (drag, resize, maximize)
- File system with Documents, Applications, and Trash
- Multiple built-in applications
- Local storage persistence
- Modern audio features with WaveSurfer.js and Tone.js
- Responsive design for all screen sizes
- System-wide sound effects and themes
- Backup and restore functionality
- Virtual PC with classic games

## Built-in Applications
- **Finder**: Browse and manage your files
- **TextEdit**: Create and edit documents with markdown
- **MacPaint**: Classic bitmap graphics editor with image support
- **Soundboard**: Create and play custom soundboards
- **Synth**: Virtual synthesizer with retro aesthetics
- **Photo Booth**: Camera app with effects and filters
- **Control Panels**: Customize ryOS system settings
- **Minesweeper**: Classic puzzle game
- **Internet Explorer**: Browse historical web content
- **Chats**: Chat with Ryo AI assistant
- **Videos**: VCR-style video playlist player
- **Virtual PC**: Play classic DOS games

## Getting Started
- Double-click on any app icon to launch it
- Use the **Apple menu (🍎)** in the top-left to access system functions
- Files are automatically saved to your browser's storage
- Drag windows to move them, click and drag window edges to resize
- Use Control Panels to customize your experience
- Launch Virtual PC from Applications folder to play classic games

## Technical Details
- Built with React 18 and TypeScript
- Vite for fast development and bundling
- TailwindCSS for styling
- shadcn/ui components
- Bun as package manager
- WaveSurfer.js for audio visualization
- Tone.js for audio synthesis
- Virtual PC Emulator powered by DOSBox

Visit https://github.com/ryokun6/ryos for more information.`,
  },
  {
    name: "Quick Tips.md",
    content: `# Quick Tips

## Using Apps
- Launch apps from the Finder, Desktop, or Apple menu
- Multiple apps can run simultaneously
- Windows can be moved, resized, and minimized
- Use Control Panels to customize your experience

## Finder
- Browse files in Documents, Applications, and Trash
- Navigate with back/forward buttons or path bar
- Sort files by name, kind, size, or date
- Multiple view options (icons, list)
- Move files to Trash and empty when needed
- Monitor available storage space

## TextEdit
- Create and edit rich text documents
- Format text with bold, italic, and underline
- Align text and create ordered/unordered lists
- Use slash commands (/) for quick formatting
- Support for markdown syntax
- Task list support with checkboxes
- Auto-saves your work
- Export documents when needed

## MacPaint
- Classic bitmap graphics editor
- Multiple drawing tools and patterns
- Shape tools with fill options
- Selection and move capabilities
- Image file import/export
- Undo/redo support

## Soundboard
- Create multiple custom soundboards
- Record sounds directly from your microphone
- Enhanced synth effects and processing
- Customize with emojis and titles
- Play sounds with clicks or number keys (1-9)
- View sound waveforms with WaveSurfer.js
- Import/export soundboards for sharing
- Auto-saves your recordings
- Choose input device
- Toggle waveform/emoji display

## Synth
- Play using on-screen keyboard or computer keys
- Choose between multiple waveforms:
  - Sine wave (smooth, pure tones)
  - Square wave (rich, buzzy sounds)
  - Sawtooth (bright, sharp tones)
  - Triangle (soft, hollow sounds)
- Add effects:
  - Reverb for space and depth
  - Delay for echo effects
  - Distortion for gritty tones
- Save and load custom presets
- MIDI keyboard support
- Classic synthesizer interface
- Real-time parameter control

## Photo Booth
- Take photos with your webcam
- Apply real-time effects:
  - Green Tint
  - High Contrast
  - Warm Vintage
  - Soft Sepia
  - Soft Focus
  - Black & White
  - Inverted
  - Green Boost
- Adjust brightness and contrast
- Multi-photo sequence mode
- Built-in photo gallery
- Export photos to Files
- Multiple camera support
- Flash effect on capture

## Control Panels
- Customize system appearance
  - Choose from tiled patterns or photos
  - Multiple categories of wallpapers
  - Real-time preview
- Adjust sound settings
  - Enable/disable UI sounds
  - Configure typing synthesis
  - Choose synth presets
- Manage system
  - Backup all settings
  - Restore from backup
  - Reset to defaults
  - Format file system

## Internet Explorer
- Browse historical web content
- Time travel with Wayback Machine
- Classic System 7 style interface
- Add websites to favorites
- View content from different years

## Chats with Ryo
- Natural conversation with Ryo AI
- Control system through chat
- Launch and manage apps
- Edit documents directly
- Get help with features
- Ask about design and concepts

## Videos
- VCR-style video playlist player
- Add and manage YouTube videos
- Shuffle and repeat modes
- LCD display with scrolling titles
- Classic CD player controls
- Playlist management
- Local storage for favorites

## Virtual PC
- Play classic DOS games
- Doom, SimCity, and more
- Save game states
- Full DOS environment
- Keyboard and mouse support`,
  },
];

// Initialize database with sample documents if empty
const initializeDatabase = async () => {
  try {
    const existingDocs = await dbOperations.getAll<Document>(STORES.DOCUMENTS);
    if (existingDocs.length === 0) {
      for (const doc of DOCUMENTS) {
        await dbOperations.put(STORES.DOCUMENTS, doc);
      }
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

// Helper function to detect file type
function getFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
      return "image";
    case "md":
      return "markdown";
    case "txt":
      return "text";
    default:
      return "unknown";
  }
}

// Helper function to get file icon based on type
function getFileIcon(fileName: string, isDirectory: boolean): string {
  if (isDirectory) return "/icons/directory.png";

  const type = getFileType(fileName);
  switch (type) {
    case "image":
      return "/icons/image.png";
    case "markdown":
    case "text":
      return "/icons/file-text.png";
    default:
      return "/icons/file.png";
  }
}

export function useFileSystem(initialPath: string = "/") {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [images, setImages] = useState<Document[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [history, setHistory] = useState<string[]>([initialPath]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const launchApp = useLaunchApp();

  // Initialize database and load data
  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeDatabase();
        const [docs, imgs, trash] = await Promise.all([
          dbOperations.getAll<Document>(STORES.DOCUMENTS),
          dbOperations.getAll<Document>(STORES.IMAGES),
          dbOperations.getAll<TrashItem>(STORES.TRASH),
        ]);
        setDocuments(docs);
        setImages(imgs);
        setTrashItems(trash);
      } catch (err) {
        console.error("Error loading data:", err);
        setError("Failed to load data");
      }
    };
    loadData();
  }, []);

  // Load files whenever path, documents, or trash items change
  useEffect(() => {
    loadFiles();
  }, [currentPath, documents, images, trashItems]);

  // Listen for file save events
  useEffect(() => {
    const handleFileSave = async (event: CustomEvent<FileItem>) => {
      if (!event.detail.content) return;

      const newDoc: Document = {
        name: event.detail.name,
        content: event.detail.content,
        type: event.detail.type || getFileType(event.detail.name),
      };

      try {
        // Only save to one location based on the file path
        if (event.detail.path.startsWith("/Images/")) {
          await dbOperations.put(STORES.IMAGES, newDoc);
          await dbOperations.delete(STORES.DOCUMENTS, newDoc.name);
          setImages((prev) => {
            const newImages = [...prev];
            const existingIndex = newImages.findIndex(
              (img) => img.name === newDoc.name
            );
            if (existingIndex >= 0) {
              newImages[existingIndex] = newDoc;
            } else {
              newImages.push(newDoc);
            }
            return newImages;
          });
          setDocuments((prev) =>
            prev.filter((doc) => doc.name !== newDoc.name)
          );
        } else if (event.detail.path.startsWith("/Documents/")) {
          await dbOperations.put(STORES.DOCUMENTS, newDoc);
          await dbOperations.delete(STORES.IMAGES, newDoc.name);
          setDocuments((prev) => {
            const newDocs = [...prev];
            const existingIndex = newDocs.findIndex(
              (doc) => doc.name === newDoc.name
            );
            if (existingIndex >= 0) {
              newDocs[existingIndex] = newDoc;
            } else {
              newDocs.push(newDoc);
            }
            return newDocs;
          });
          setImages((prev) => prev.filter((img) => img.name !== newDoc.name));
        }
      } catch (err) {
        console.error("Error saving file:", err);
        setError("Failed to save file");
      }
    };

    const eventListener = (event: Event) => {
      handleFileSave(event as CustomEvent<FileItem>);
    };

    window.addEventListener("saveFile", eventListener);
    return () => {
      window.removeEventListener("saveFile", eventListener);
    };
  }, []);

  async function loadFiles() {
    setIsLoading(true);
    setError(undefined);

    try {
      let simulatedFiles: FileItem[] = [];

      // Root directory
      if (currentPath === "/") {
        simulatedFiles = [
          {
            name: "Applications",
            isDirectory: true,
            path: "/Applications",
            icon: "/icons/applications.png",
            type: "directory",
          },
          {
            name: "Documents",
            isDirectory: true,
            path: "/Documents",
            icon: "/icons/documents.png",
            type: "directory",
          },
          {
            name: "Images",
            isDirectory: true,
            path: "/Images",
            icon: "/icons/images.png",
            type: "directory",
          },
          {
            name: "Trash",
            isDirectory: true,
            path: "/Trash",
            icon:
              trashItems.length > 0
                ? "/icons/trash-full.png"
                : "/icons/trash-empty.png",
            type: "directory",
          },
        ];
      }
      // Applications directory
      else if (currentPath === "/Applications") {
        simulatedFiles = getNonFinderApps().map((app) => ({
          name: app.name,
          isDirectory: false,
          path: `/Applications/${app.name}`,
          icon: app.icon,
          appId: app.id,
          type: "application",
        }));
      }
      // Documents directory
      else if (currentPath === "/Documents") {
        simulatedFiles = documents.map((doc) => ({
          name: doc.name,
          isDirectory: false,
          path: `/Documents/${doc.name}`,
          icon: getFileIcon(doc.name, false),
          content: doc.content,
          type: doc.type || getFileType(doc.name),
        }));
      }
      // Images directory
      else if (currentPath === "/Images") {
        simulatedFiles = images.map((img) => ({
          name: img.name,
          isDirectory: false,
          path: `/Images/${img.name}`,
          icon: getFileIcon(img.name, false),
          content: img.content,
          type: img.type || getFileType(img.name),
        }));
      }
      // Trash directory
      else if (currentPath === "/Trash") {
        simulatedFiles = trashItems.map((item) => ({
          ...item,
          path: `/Trash/${item.name}`,
          icon: getFileIcon(item.name, item.isDirectory),
          type: item.type || getFileType(item.name),
        }));
      }

      setFiles(simulatedFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFileOpen(file: FileItem) {
    if (file.isDirectory) {
      setCurrentPath(file.path);
      return;
    }

    // Handle opening files based on their location
    if (file.path.startsWith("/Applications/")) {
      // Launch the corresponding app
      if (file.appId) {
        const appState = localStorage.getItem(
          APP_STORAGE_KEYS[file.appId as keyof typeof APP_STORAGE_KEYS]?.WINDOW
        );
        if (!appState) {
          // Set initial window state if not exists
          localStorage.setItem(
            APP_STORAGE_KEYS[file.appId as keyof typeof APP_STORAGE_KEYS]
              ?.WINDOW,
            JSON.stringify({
              position: { x: 100, y: 100 },
              size: { width: 600, height: 400 },
            })
          );
        }
        // Dispatch app launch event
        launchApp(file.appId);
      }
    } else if (file.path.startsWith("/Documents/")) {
      // Open document in TextEdit
      if (file.content) {
        // Launch TextEdit first
        const textEditState = localStorage.getItem(
          APP_STORAGE_KEYS.textedit.WINDOW
        );
        if (!textEditState) {
          localStorage.setItem(
            APP_STORAGE_KEYS.textedit.WINDOW,
            JSON.stringify({
              position: { x: 100, y: 100 },
              size: { width: 600, height: 400 },
            })
          );
        }

        // Store the file content temporarily
        localStorage.setItem(
          "pending_file_open",
          JSON.stringify({
            path: file.path,
            content: file.content,
          })
        );

        // Launch TextEdit
        launchApp("textedit");
      }
    } else if (file.path.startsWith("/Images/")) {
      // Launch Paint app with the image
      const paintState = localStorage.getItem(APP_STORAGE_KEYS.paint.WINDOW);
      if (!paintState) {
        localStorage.setItem(
          APP_STORAGE_KEYS.paint.WINDOW,
          JSON.stringify({
            position: { x: 100, y: 100 },
            size: { width: 713, height: 480 },
          })
        );
      }

      // Store the file content temporarily
      localStorage.setItem(
        "pending_file_open",
        JSON.stringify({
          path: file.path,
          content: file.content,
        })
      );

      // Launch Paint
      launchApp("paint");
    }
  }

  function handleFileSelect(file: FileItem) {
    setSelectedFile(file);
  }

  function navigateUp() {
    if (currentPath === "/") return;
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    navigateToPath(parentPath);
  }

  function navigateToPath(path: string) {
    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // Add to history if it's a new path
    if (normalizedPath !== currentPath) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(normalizedPath);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setCurrentPath(normalizedPath);
    }
  }

  function navigateBack() {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
    }
  }

  function navigateForward() {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
    }
  }

  function canNavigateBack() {
    return historyIndex > 0;
  }

  function canNavigateForward() {
    return historyIndex < history.length - 1;
  }

  async function moveToTrash(file: FileItem) {
    if (file.path === "/Trash" || file.path.startsWith("/Trash/")) return;

    const trashItem: TrashItem = {
      ...file,
      originalPath: file.path,
      deletedAt: Date.now(),
    };

    try {
      await dbOperations.put(STORES.TRASH, trashItem);
      setTrashItems((prev) => [...prev, trashItem]);

      // Remove from documents if it's a document
      if (file.path.startsWith("/Documents/")) {
        await dbOperations.delete(STORES.DOCUMENTS, file.name);
        setDocuments((prev) => prev.filter((doc) => doc.name !== file.name));
      }
      // Remove from images if it's an image
      else if (file.path.startsWith("/Images/")) {
        await dbOperations.delete(STORES.IMAGES, file.name);
        setImages((prev) => prev.filter((img) => img.name !== file.name));
      }
    } catch (err) {
      console.error("Error moving to trash:", err);
      setError("Failed to move file to trash");
    }
  }

  async function restoreFromTrash(file: FileItem) {
    if (!file.path.startsWith("/Trash/")) return;

    const trashItem = trashItems.find((item) => item.name === file.name);
    if (!trashItem) return;

    try {
      // Restore to original location
      if (trashItem.originalPath.startsWith("/Documents/")) {
        const newDoc: Document = {
          name: trashItem.name,
          content: trashItem.content || "",
          type: trashItem.type || getFileType(trashItem.name),
        };
        await dbOperations.put(STORES.DOCUMENTS, newDoc);
        setDocuments((prev) => [...prev, newDoc]);
      }
      // Restore to images if it was originally an image
      else if (trashItem.originalPath.startsWith("/Images/")) {
        const newImage: Document = {
          name: trashItem.name,
          content: trashItem.content || "",
          type: trashItem.type || getFileType(trashItem.name),
        };
        await dbOperations.put(STORES.IMAGES, newImage);
        setImages((prev) => [...prev, newImage]);
      }

      // Remove from trash
      await dbOperations.delete(STORES.TRASH, file.name);
      setTrashItems((prev) => prev.filter((item) => item.name !== file.name));
    } catch (err) {
      console.error("Error restoring from trash:", err);
      setError("Failed to restore file from trash");
    }
  }

  async function emptyTrash() {
    try {
      await dbOperations.clear(STORES.TRASH);
      setTrashItems([]);
    } catch (err) {
      console.error("Error emptying trash:", err);
      setError("Failed to empty trash");
    }
  }

  async function saveFile(file: FileItem) {
    if (!file.content) return;

    const newDoc: Document = {
      name: file.name,
      content: file.content,
      type: file.type || getFileType(file.name),
    };

    try {
      // Only save to one location based on the file path
      if (file.path.startsWith("/Images/")) {
        await dbOperations.put(STORES.IMAGES, newDoc);
        await dbOperations.delete(STORES.DOCUMENTS, newDoc.name);
        setImages((prev) => {
          const newImages = [...prev];
          const existingIndex = newImages.findIndex(
            (img) => img.name === newDoc.name
          );
          if (existingIndex >= 0) {
            newImages[existingIndex] = newDoc;
          } else {
            newImages.push(newDoc);
          }
          return newImages;
        });
        setDocuments((prev) => prev.filter((doc) => doc.name !== newDoc.name));
      } else if (file.path.startsWith("/Documents/")) {
        await dbOperations.put(STORES.DOCUMENTS, newDoc);
        await dbOperations.delete(STORES.IMAGES, newDoc.name);
        setDocuments((prev) => {
          const newDocs = [...prev];
          const existingIndex = newDocs.findIndex(
            (doc) => doc.name === newDoc.name
          );
          if (existingIndex >= 0) {
            newDocs[existingIndex] = newDoc;
          } else {
            newDocs.push(newDoc);
          }
          return newDocs;
        });
        setImages((prev) => prev.filter((img) => img.name !== newDoc.name));
      }
    } catch (err) {
      console.error("Error saving file:", err);
      setError("Failed to save file");
    }
  }

  async function renameFile(oldName: string, newName: string) {
    try {
      const doc = await dbOperations.get<Document>(STORES.DOCUMENTS, oldName);
      if (doc) {
        const newDoc = { ...doc, name: newName };
        await dbOperations.put(STORES.DOCUMENTS, newDoc);
        await dbOperations.delete(STORES.DOCUMENTS, oldName);
        setDocuments((prev) => {
          const newDocs = [...prev];
          const existingIndex = newDocs.findIndex((d) => d.name === oldName);
          if (existingIndex >= 0) {
            newDocs[existingIndex] = newDoc;
          }
          return newDocs;
        });
      }
    } catch (err) {
      console.error("Error renaming file:", err);
      setError("Failed to rename file");
    }
  }

  async function formatFileSystem() {
    try {
      // Clear all stores except DOCUMENTS (which will be reset to sample documents)
      await Promise.all([
        dbOperations.clear(STORES.IMAGES),
        dbOperations.clear(STORES.TRASH),
        dbOperations.clear(STORES.CUSTOM_WALLPAPERS),
      ]);

      // Reset documents to sample documents
      await dbOperations.clear(STORES.DOCUMENTS);
      for (const doc of DOCUMENTS) {
        await dbOperations.put(STORES.DOCUMENTS, doc);
      }

      // Reset wallpaper to default
      localStorage.removeItem(APP_STORAGE_KEYS["control-panels"].WALLPAPER);

      // Update state
      setDocuments(DOCUMENTS);
      setImages([]);
      setTrashItems([]);
      setError(undefined);
    } catch (err) {
      console.error("Error formatting file system:", err);
      setError("Failed to format file system");
    }
  }

  return {
    currentPath,
    files,
    selectedFile,
    isLoading,
    error,
    handleFileOpen,
    handleFileSelect,
    navigateUp,
    navigateToPath,
    moveToTrash,
    restoreFromTrash,
    emptyTrash,
    trashItems,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    saveFile,
    setSelectedFile,
    renameFile,
    formatFileSystem,
  };
}
