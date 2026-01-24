import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StickyColor = "yellow" | "blue" | "green" | "pink" | "purple" | "orange";

export interface StickyNote {
  id: string;
  content: string;
  color: StickyColor;
  position: { x: number; y: number };
  size: { width: number; height: number };
  createdAt: number;
  updatedAt: number;
}

interface StickiesState {
  notes: StickyNote[];
  addNote: (color?: StickyColor) => string;
  updateNote: (id: string, updates: Partial<Omit<StickyNote, "id" | "createdAt">>) => void;
  deleteNote: (id: string) => void;
  bringToFront: (id: string) => void;
  clearAllNotes: () => void;
}

const DEFAULT_NOTE_SIZE = { width: 220, height: 240 };

// Stack new notes with slight offset from existing notes
const getNextPosition = (existingNotes: StickyNote[]) => {
  const baseX = 100;
  const baseY = 60; // Account for menu bar
  const offset = 25; // Offset for each new note
  
  if (existingNotes.length === 0) {
    return { x: baseX, y: baseY };
  }
  
  // Get the last note's position and offset from it
  const lastNote = existingNotes[existingNotes.length - 1];
  let newX = lastNote.position.x + offset;
  let newY = lastNote.position.y + offset;
  
  // Wrap around if going off screen
  const maxX = typeof window !== "undefined" ? window.innerWidth - DEFAULT_NOTE_SIZE.width - 50 : 600;
  const maxY = typeof window !== "undefined" ? window.innerHeight - DEFAULT_NOTE_SIZE.height - 50 : 400;
  
  if (newX > maxX) newX = baseX + (existingNotes.length % 5) * offset;
  if (newY > maxY) newY = baseY + (existingNotes.length % 5) * offset;
  
  return { x: newX, y: newY };
};

export const useStickiesStore = create<StickiesState>()(
  persist(
    (set, get) => ({
      notes: [],

      addNote: (color: StickyColor = "yellow") => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const existingNotes = get().notes;
        const newNote: StickyNote = {
          id,
          content: "",
          color,
          position: getNextPosition(existingNotes),
          size: DEFAULT_NOTE_SIZE,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          notes: [...state.notes, newNote],
        }));
        return id;
      },

      updateNote: (id, updates) => {
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id
              ? { ...note, ...updates, updatedAt: Date.now() }
              : note
          ),
        }));
      },

      deleteNote: (id) => {
        set((state) => ({
          notes: state.notes.filter((note) => note.id !== id),
        }));
      },

      bringToFront: (id) => {
        const { notes } = get();
        const noteIndex = notes.findIndex((n) => n.id === id);
        if (noteIndex === -1 || noteIndex === notes.length - 1) return;
        
        set((state) => {
          const newNotes = [...state.notes];
          const [note] = newNotes.splice(noteIndex, 1);
          newNotes.push(note);
          return { notes: newNotes };
        });
      },

      clearAllNotes: () => {
        set({ notes: [] });
      },
    }),
    {
      name: "stickies-storage",
    }
  )
);
