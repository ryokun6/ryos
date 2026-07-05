/**
 * Settings tool partial-update guardrails — schema normalization and client
 * sanitization so overfilled tool calls do not mutate unrelated preferences.
 */
import "fake-indexeddb/auto";
import { describe, expect, test, beforeEach, mock } from "bun:test";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
  navigator?: Navigator;
};
if (!browserGlobals.localStorage) {
  Object.defineProperty(browserGlobals, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}
Object.defineProperty(browserGlobals, "navigator", {
  value: {
    ...(browserGlobals.navigator ?? {}),
    onLine: true,
    userAgent: "test",
  },
  configurable: true,
});

const { settingsSchema } = await import("../api/chat/tools/schemas");
const { sanitizeSettingsInput } = await import(
  "../src/apps/chats/tools/sanitizeSettingsInput"
);
const { useLanguageStore } = await import("../src/stores/useLanguageStore");
const { useThemeStore } = await import("../src/stores/useThemeStore");
const { useAudioSettingsStore } = await import(
  "../src/stores/useAudioSettingsStore"
);
const { useDisplaySettingsStore } = await import(
  "../src/stores/useDisplaySettingsStore"
);

const BASE_SNAPSHOT = {
  language: "en" as const,
  theme: "macosx" as const,
  accent: "wallpaper" as const,
  masterVolume: 1,
  speechEnabled: false,
  uiSoundsEnabled: true,
};

const OVERFILLED_CURRENT_VALUES = {
  language: "en",
  theme: "macosx",
  accent: "wallpaper",
  masterVolume: 1,
  speechEnabled: false,
  uiSoundsEnabled: true,
  checkForUpdates: false,
};

describe("settingsSchema partial updates", () => {
  test("accepts an empty object (no settings to change)", () => {
    expect(settingsSchema.safeParse({}).success).toBe(true);
  });

  test("drops checkForUpdates: false during schema normalization", () => {
    expect(
      settingsSchema.safeParse({
        checkForUpdates: false,
        theme: "xp",
      })
    ).toEqual({
      success: true,
      data: { theme: "xp" },
    });
  });

  test("normalizes empty wallpaper strings to undefined", () => {
    expect(
      settingsSchema.safeParse({
        wallpaper: "",
        theme: "xp",
      })
    ).toEqual({
      success: true,
      data: { theme: "xp" },
    });
  });

  test("accepts wallpaper, accent, and uiSoundsEnabled fields", () => {
    expect(
      settingsSchema.safeParse({
        wallpaper: "aurora",
        accent: "purple",
        uiSoundsEnabled: false,
      }).success
    ).toBe(true);
  });
});

describe("sanitizeSettingsInput", () => {
  test("wallpaper-only request strips echoed current settings", () => {
    expect(
      sanitizeSettingsInput(
        {
          wallpaper: "aurora",
          ...OVERFILLED_CURRENT_VALUES,
        },
        BASE_SNAPSHOT
      )
    ).toEqual({ wallpaper: "aurora" });
  });

  test("theme-only request does not keep echoed current settings", () => {
    expect(
      sanitizeSettingsInput(
        {
          ...OVERFILLED_CURRENT_VALUES,
          theme: "xp",
        },
        BASE_SNAPSHOT
      )
    ).toEqual({ theme: "xp" });
  });

  test("volume-only request does not keep other settings", () => {
    expect(
      sanitizeSettingsInput(
        {
          masterVolume: 0,
          theme: "macosx",
          language: "en",
          uiSoundsEnabled: true,
        },
        BASE_SNAPSHOT
      )
    ).toEqual({ masterVolume: 0 });
  });

  test("checkForUpdates-only request does not mutate other settings", () => {
    expect(
      sanitizeSettingsInput(
        {
          ...OVERFILLED_CURRENT_VALUES,
          checkForUpdates: true,
        },
        BASE_SNAPSHOT
      )
    ).toEqual({ checkForUpdates: true });
  });

  test("preserves legitimate multi-setting requests", () => {
    expect(
      sanitizeSettingsInput(
        {
          theme: "xp",
          uiSoundsEnabled: false,
          language: "en",
          masterVolume: 1,
        },
        BASE_SNAPSHOT
      )
    ).toEqual({
      theme: "xp",
      uiSoundsEnabled: false,
    });
  });

  test("returns empty object when every field matches the snapshot", () => {
    expect(
      sanitizeSettingsInput(OVERFILLED_CURRENT_VALUES, BASE_SNAPSHOT)
    ).toEqual({});
  });
});

describe("handleSettings applies only sanitized fields", () => {
  const setLanguage = mock(() => {});
  const setTheme = mock(() => {});
  const setAccent = mock(() => {});
  const setMasterVolume = mock(() => {});
  const setSpeechEnabled = mock(() => {});
  const setUiSoundsEnabled = mock(() => {});
  const setWallpaper = mock(async () => {});
  const forceRefreshCache = mock(() => {});
  const addToolOutput = mock(() => {});

  mock.module("@/utils/wallpapers", () => ({
    loadWallpaperManifest: async () => ({
      version: 1,
      generatedAt: "test",
      tiles: [],
      photos: { nature: ["photos/nature/aurora.jpg"] },
      videos: [],
    }),
  }));
  mock.module("@/utils/prefetch", () => ({
    forceRefreshCache,
  }));

  beforeEach(() => {
    setLanguage.mockClear();
    setTheme.mockClear();
    setAccent.mockClear();
    setMasterVolume.mockClear();
    setSpeechEnabled.mockClear();
    setUiSoundsEnabled.mockClear();
    setWallpaper.mockClear();
    forceRefreshCache.mockClear();
    addToolOutput.mockClear();

    useLanguageStore.setState({
      current: "en",
      setLanguage,
    } as Partial<ReturnType<typeof useLanguageStore.getState>>);
    useThemeStore.setState({
      current: "macosx",
      accentByTheme: { macosx: "wallpaper" },
      setTheme,
      setAccent,
    } as Partial<ReturnType<typeof useThemeStore.getState>>);
    useAudioSettingsStore.setState({
      masterVolume: 1,
      speechEnabled: false,
      uiSoundsEnabled: true,
      setMasterVolume,
      setSpeechEnabled,
      setUiSoundsEnabled,
    } as Partial<ReturnType<typeof useAudioSettingsStore.getState>>);
    useDisplaySettingsStore.setState({
      setWallpaper,
    } as Partial<ReturnType<typeof useDisplaySettingsStore.getState>>);
  });

  test("wallpaper-only overfilled call changes wallpaper but not theme or volume", async () => {
    const { handleSettings } = await import(
      "../src/apps/chats/tools/settingsHandler"
    );

    await handleSettings(
      {
        wallpaper: "aurora",
        theme: "macosx",
        language: "en",
        accent: "wallpaper",
        masterVolume: 1,
        speechEnabled: false,
        uiSoundsEnabled: true,
        checkForUpdates: false,
      },
      "tc_wallpaper",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(setWallpaper).toHaveBeenCalledTimes(1);
    expect(setWallpaper.mock.calls[0]?.[0]).toBe(
      "/wallpapers/photos/nature/aurora.jpg"
    );
    expect(setTheme).not.toHaveBeenCalled();
    expect(setLanguage).not.toHaveBeenCalled();
    expect(setAccent).not.toHaveBeenCalled();
    expect(setMasterVolume).not.toHaveBeenCalled();
    expect(setSpeechEnabled).not.toHaveBeenCalled();
    expect(setUiSoundsEnabled).not.toHaveBeenCalled();
    expect(forceRefreshCache).not.toHaveBeenCalled();
  });

  test("multi-setting XP theme and muted UI sounds both apply", async () => {
    const { handleSettings } = await import(
      "../src/apps/chats/tools/settingsHandler"
    );

    await handleSettings(
      {
        theme: "xp",
        uiSoundsEnabled: false,
        language: "en",
        masterVolume: 1,
      },
      "tc_multi",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(setTheme).toHaveBeenCalledWith("xp");
    expect(setUiSoundsEnabled).toHaveBeenCalledWith(false);
    expect(setLanguage).not.toHaveBeenCalled();
    expect(setMasterVolume).not.toHaveBeenCalled();
    expect(setWallpaper).not.toHaveBeenCalled();
  });

  test("checkForUpdates-only call does not touch persisted settings", async () => {
    const { handleSettings } = await import(
      "../src/apps/chats/tools/settingsHandler"
    );

    await handleSettings(
      {
        ...OVERFILLED_CURRENT_VALUES,
        checkForUpdates: true,
      },
      "tc_updates",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(forceRefreshCache).toHaveBeenCalledTimes(1);
    expect(setTheme).not.toHaveBeenCalled();
    expect(setWallpaper).not.toHaveBeenCalled();
    expect(setMasterVolume).not.toHaveBeenCalled();
  });
});
