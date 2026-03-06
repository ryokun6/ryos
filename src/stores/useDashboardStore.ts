import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventColor } from "./useCalendarStore";

export type WidgetType = "clock" | "weather" | "calendar" | "stocks" | "ipod" | "dictionary" | "stickynote" | "translation";

export interface WeatherWidgetConfig {
  cityName?: string;
  cityKey?: string;
  lat?: number;
  lon?: number;
}

export interface ClockWidgetConfig {
  timezone?: string;
  cityName?: string;
  cityKey?: string;
}

export interface CalendarWidgetConfig {
  hiddenColors?: EventColor[];
}

export interface StocksWidgetConfig {
  symbols?: string[];
}

export interface IpodWidgetConfig {
  placeholder?: boolean;
  controlMode?: "ipod" | "karaoke";
}

export interface DictionaryWidgetConfig {
  lastWord?: string;
}

export interface StickyNoteWidgetConfig {
  text?: string;
  color?: string;
}

export interface TranslationWidgetConfig {
  fromLang?: string;
  toLang?: string;
}

export type WidgetConfig = WeatherWidgetConfig | ClockWidgetConfig | CalendarWidgetConfig | StocksWidgetConfig | IpodWidgetConfig | DictionaryWidgetConfig | StickyNoteWidgetConfig | TranslationWidgetConfig;

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex?: number;
  config?: WidgetConfig;
}

interface DashboardStoreState {
  widgets: DashboardWidget[];

  // Actions
  addWidget: (widget: Omit<DashboardWidget, "id">) => string;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
  updateWidgetConfig: (id: string, config: WidgetConfig | undefined) => void;
  moveWidget: (id: string, position: { x: number; y: number }) => void;
  bringToFront: (id: string) => void;
  resetToDefaults: () => void;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: "default-clock",
    type: "clock",
    position: { x: 80, y: 120 },
    size: { width: 170, height: 170 },
  },
  {
    id: "default-calendar",
    type: "calendar",
    position: { x: 300, y: 100 },
    size: { width: 240, height: 350 },
  },
  {
    id: "default-weather",
    type: "weather",
    position: { x: 580, y: 120 },
    size: { width: 340, height: 180 },
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

      updateWidgetConfig: (id, config) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, config } : w
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

      bringToFront: (id) => {
        set((state) => {
          const maxZ = Math.max(0, ...state.widgets.map((w) => w.zIndex ?? 0));
          return {
            widgets: state.widgets.map((w) =>
              w.id === id ? { ...w, zIndex: maxZ + 1 } : w
            ),
          };
        });
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
