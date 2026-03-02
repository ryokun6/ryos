import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WidgetType = "clock" | "weather" | "calendar";

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface DashboardStoreState {
  widgets: DashboardWidget[];

  // Actions
  addWidget: (widget: Omit<DashboardWidget, "id">) => string;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
  moveWidget: (id: string, position: { x: number; y: number }) => void;
  resetToDefaults: () => void;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: "default-clock",
    type: "clock",
    position: { x: 80, y: 120 },
    size: { width: 160, height: 160 },
  },
  {
    id: "default-calendar",
    type: "calendar",
    position: { x: 300, y: 100 },
    size: { width: 220, height: 240 },
  },
  {
    id: "default-weather",
    type: "weather",
    position: { x: 580, y: 120 },
    size: { width: 200, height: 170 },
  },
];

export const useDashboardStore = create<DashboardStoreState>()(
  persist(
    (set, _get) => ({
      widgets: DEFAULT_WIDGETS,

      addWidget: (widgetData) => {
        const id = crypto.randomUUID();
        const newWidget: DashboardWidget = { ...widgetData, id };
        set((state) => ({
          widgets: [...state.widgets, newWidget],
        }));
        return id;
      },

      removeWidget: (id) => {
        set((state) => ({
          widgets: state.widgets.filter((w) => w.id !== id),
        }));
      },

      updateWidget: (id, updates) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        }));
      },

      moveWidget: (id, position) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, position } : w
          ),
        }));
      },

      resetToDefaults: () => {
        set({ widgets: DEFAULT_WIDGETS });
      },
    }),
    {
      name: "dashboard-storage",
    }
  )
);
