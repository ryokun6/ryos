import { create } from "zustand";

// Ephemeral, debug-only override for the weather wallpaper's condition. It is
// intentionally NOT persisted and NOT cloud-synced: it exists purely to preview
// the shader / overlay / accent / menubar for a chosen condition and resets to
// live weather (`null`) on reload.

interface WeatherSimulationState {
  /** Representative WMO code to force, or `null` to use live weather. */
  simulatedWeatherCode: number | null;
  setSimulatedWeatherCode: (code: number | null) => void;
}

export const useWeatherSimulationStore = create<WeatherSimulationState>(
  (set) => ({
    simulatedWeatherCode: null,
    setSimulatedWeatherCode: (code) => set({ simulatedWeatherCode: code }),
  })
);
