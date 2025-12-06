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
];

interface DockStoreState {
  pinnedItems: DockItem[];
  // Actions
  addItem: (item: DockItem, insertIndex?: number) => boolean; // Returns false if duplicate
  removeItem: (id: string) => boolean; // Returns false if protected
  reorderItems: (fromIndex: number, toIndex: number) => void;
  hasItem: (id: string) => boolean;
  reset: () => void;
}

export const useDockStore = create<DockStoreState>()(
  persist(
    (set, get) => ({
      pinnedItems: DEFAULT_PINNED_ITEMS,

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

      reset: () => {
        set({ pinnedItems: DEFAULT_PINNED_ITEMS });
      },
    }),
    {
      name: "dock-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

