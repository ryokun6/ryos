import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Dock item can be an app or a file/applet
export interface DockItem {
  type: "app" | "file";
  id: string; // AppId for apps, or unique id for files
  path?: string; // File path for file type items
  name?: string; // Display name for file items
  icon?: string; // Custom icon for file items (emoji or path)
}

// Protected items that cannot be removed from dock
export const PROTECTED_DOCK_ITEMS = new Set(["finder", "__applications__", "__trash__"]);

// Default pinned items
const DEFAULT_PINNED_ITEMS: DockItem[] = [
  { type: "app", id: "finder" },
  { type: "app", id: "chats" },
  { type: "app", id: "internet-explorer" },
  { type: "app", id: "karaoke" },
];

interface DockStoreState {
  pinnedItems: DockItem[];
  scale: number; // Dock icon scale (0.5 to 1.5)
  hiding: boolean; // Whether dock auto-hides
  magnification: boolean; // Whether magnification is enabled
  // Actions
  addItem: (item: DockItem, insertIndex?: number) => boolean; // Returns false if duplicate
  removeItem: (id: string) => boolean; // Returns false if protected
  reorderItems: (fromIndex: number, toIndex: number) => void;
  hasItem: (id: string) => boolean;
  setScale: (scale: number) => void;
  setHiding: (hiding: boolean) => void;
  setMagnification: (magnification: boolean) => void;
  reset: () => void;
}

export const useDockStore = create<DockStoreState>()(
  persist(
    (set, get) => ({
      pinnedItems: DEFAULT_PINNED_ITEMS,
      scale: 1, // Default scale
      hiding: false, // Default: dock always visible
      magnification: true, // Default: magnification enabled

      addItem: (item: DockItem, insertIndex?: number) => {
        const { pinnedItems } = get();
        
        // Check for duplicates
        const exists = pinnedItems.some((existing) => {
          if (item.type === "app" && existing.type === "app") {
            return existing.id === item.id;
          }
          if (item.type === "file" && existing.type === "file") {
            return existing.path === item.path;
          }
          return false;
        });

        if (exists) {
          return false;
        }

        set((state) => {
          const newItems = [...state.pinnedItems];
          // Ensure Finder stays at position 0 - insert at minimum position 1
          const minIndex = newItems[0]?.id === "finder" ? 1 : 0;
          const index = insertIndex !== undefined 
            ? Math.max(minIndex, Math.min(insertIndex, newItems.length))
            : newItems.length;
          newItems.splice(index, 0, item);
          return { pinnedItems: newItems };
        });

        return true;
      },

      removeItem: (id: string) => {
        // Don't allow removing protected items
        if (PROTECTED_DOCK_ITEMS.has(id)) {
          return false;
        }

        set((state) => ({
          pinnedItems: state.pinnedItems.filter((item) => item.id !== id),
        }));

        return true;
      },

      reorderItems: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const newItems = [...state.pinnedItems];
          const movedItem = newItems[fromIndex];
          
          // Don't allow moving Finder (always stays at position 0)
          if (movedItem?.id === "finder") {
            return state;
          }
          
          // Don't allow moving items to position 0 (Finder's spot)
          if (toIndex === 0 && newItems[0]?.id === "finder") {
            return state;
          }
          
          const [removed] = newItems.splice(fromIndex, 1);
          if (removed) {
            newItems.splice(toIndex, 0, removed);
          }
          return { pinnedItems: newItems };
        });
      },

      hasItem: (id: string) => {
        return get().pinnedItems.some((item) => item.id === id);
      },

      setScale: (scale: number) => {
        // Clamp scale between 0.5 and 1.5
        const clampedScale = Math.max(0.5, Math.min(1.5, scale));
        set({ scale: clampedScale });
      },

      setHiding: (hiding: boolean) => {
        set({ hiding });
      },

      setMagnification: (magnification: boolean) => {
        set({ magnification });
      },

      reset: () => {
        set({ pinnedItems: DEFAULT_PINNED_ITEMS, scale: 1, hiding: false, magnification: true });
      },
    }),
    {
      name: "dock-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

