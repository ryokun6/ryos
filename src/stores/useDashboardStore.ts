import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { EventColor } from "./useCalendarStore";
import {
  deriveMobileOrder,
  migrateDashboardLayout,
  reconcileMobileOrder,
  sameIdOrder,
} from "./dashboardLayout";
import {
  LEGACY_STORAGE_KEYS,
  migrateLocalStorageKey,
  STORAGE_KEYS,
} from "@/utils/storageKeys";

migrateLocalStorageKey(
  LEGACY_STORAGE_KEYS.dashboard,
  STORAGE_KEYS.dashboard
);

export type WidgetType =
  | "clock"
  | "weather"
  | "calendar"
  | "stocks"
  | "ipod"
  | "dictionary"
  | "stickynote"
  | "translation"
  | "currency"
  | "aquarium"
  | "terrarium";

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

export interface CurrencyWidgetConfig {
  fromCurrency?: string;
  toCurrency?: string;
  lastAmount?: string;
}

export type WidgetConfig =
  | WeatherWidgetConfig
  | ClockWidgetConfig
  | CalendarWidgetConfig
  | StocksWidgetConfig
  | IpodWidgetConfig
  | DictionaryWidgetConfig
  | StickyNoteWidgetConfig
  | TranslationWidgetConfig
  | CurrencyWidgetConfig;

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex?: number;
  config?: WidgetConfig;
}

interface DashboardStoreState {
  /** Desktop layout: 2D position, size, and stacking. */
  widgets: DashboardWidget[];
  /** Mobile layout: widget ids from top to bottom. */
  mobileOrder: string[];

  // Actions
  addWidget: (widget: Omit<DashboardWidget, "id">) => string;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
  updateWidgetConfig: (id: string, config: WidgetConfig | undefined) => void;
  moveWidget: (id: string, position: { x: number; y: number }) => void;
  /** Replace the mobile order. Desktop coordinates are left as they are. */
  reorderMobileWidgets: (orderedIds: string[]) => void;
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

const DASHBOARD_STORE_VERSION = 2;
const DEFAULT_MOBILE_ORDER = deriveMobileOrder(DEFAULT_WIDGETS);

function dashboardPersistStorage(): Storage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return localStorage;
}

export const useDashboardStore = create<DashboardStoreState>()(
  persist(
    (set, _get) => ({
      widgets: DEFAULT_WIDGETS,
      mobileOrder: DEFAULT_MOBILE_ORDER,

      addWidget: (widgetData) => {
        const id = crypto.randomUUID();
        const newWidget: DashboardWidget = { ...widgetData, id };
        set((state) => ({
          widgets: [...state.widgets, newWidget],
          mobileOrder: reconcileMobileOrder(
            [...state.mobileOrder, id],
            [...state.widgets.map((widget) => widget.id), id],
          ),
        }));
        return id;
      },

      removeWidget: (id) => {
        set((state) => ({
          widgets: state.widgets.filter((w) => w.id !== id),
          mobileOrder: state.mobileOrder.filter((widgetId) => widgetId !== id),
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

      reorderMobileWidgets: (orderedIds) => {
        set((state) => {
          const mobileOrder = reconcileMobileOrder(
            orderedIds,
            state.widgets.map((widget) => widget.id),
          );
          if (sameIdOrder(mobileOrder, state.mobileOrder)) return state;
          return { mobileOrder };
        });
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
        set({ widgets: DEFAULT_WIDGETS, mobileOrder: DEFAULT_MOBILE_ORDER });
      },
    }),
    {
      name: STORAGE_KEYS.dashboard,
      version: DASHBOARD_STORE_VERSION,
      storage: createJSONStorage(dashboardPersistStorage),
      migrate: (persistedState, version) =>
        migrateDashboardLayout(persistedState, version) as unknown as DashboardStoreState,
      partialize: (state) => ({
        widgets: state.widgets,
        mobileOrder: state.mobileOrder,
      }),
    }
  )
);
