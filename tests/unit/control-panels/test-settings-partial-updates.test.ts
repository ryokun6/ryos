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

const { settingsSchema, settingsToolInputSchema } = await import(
  "../../../api/chat/tools/schemas"
);
const { sanitizeSettingsInput, resolveWallpaperConflict } = await import(
  "../../../src/apps/chats/tools/sanitizeSettingsInput"
);
const { useLanguageStore } = await import("../../../src/stores/useLanguageStore");
const { useThemeStore } = await import("../../../src/stores/useThemeStore");
const { useAudioSettingsStore } = await import(
  "../../../src/stores/useAudioSettingsStore"
);
const { useDisplaySettingsStore } = await import(
  "../../../src/stores/useDisplaySettingsStore"
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

  test("strips null fields during normalization (strict-mode wire format)", () => {
    expect(
      settingsSchema.safeParse({
        language: null,
        theme: null,
        wallpaper: null,
        wallpaperShuffle: "aqua",
        wallpaperDynamic: null,
        accent: null,
        masterVolume: null,
        speechEnabled: null,
        uiSoundsEnabled: null,
        checkForUpdates: null,
      })
    ).toEqual({
      success: true,
      data: { wallpaperShuffle: "aqua" },
    });
  });
});

describe("settingsToolInputSchema (strict-mode wire schema)", () => {
  test("marks every field required and nullable so models emit null, not junk", () => {
    const wire = settingsToolInputSchema.jsonSchema as {
      properties: Record<string, { description?: string; anyOf?: unknown[] }>;
      required: string[];
      additionalProperties: boolean;
    };
    const keys = Object.keys(wire.properties);
    expect(keys).toContain("wallpaperShuffle");
    expect(wire.required.sort()).toEqual(keys.sort());
    expect(wire.additionalProperties).toBe(false);
    for (const key of keys) {
      const property = wire.properties[key];
      expect(property.anyOf).toHaveLength(2);
      expect(property.anyOf![1]).toEqual({ type: "null" });
      expect(property.description).toContain("Set to null");
    }
  });

  test("validate strips nulls to a sparse settings object", async () => {
    const result = await settingsToolInputSchema.validate!({
      language: null,
      theme: null,
      wallpaper: null,
      wallpaperShuffle: "aqua",
      wallpaperDynamic: null,
      accent: null,
      masterVolume: null,
      speechEnabled: null,
      uiSoundsEnabled: null,
      checkForUpdates: null,
    });
    expect(result).toEqual({
      success: true,
      value: { wallpaperShuffle: "aqua" },
    });
  });

  test("validate still rejects invalid values", async () => {
    const result = await settingsToolInputSchema.validate!({
      wallpaperShuffle: "rainbows",
    });
    expect(result.success).toBe(false);
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

  test("wallpaper request keeps theme when it differs from snapshot", () => {
    expect(
      sanitizeSettingsInput(
        {
          wallpaper: "aurora",
          theme: "macosx",
          language: "en",
          accent: "wallpaper",
          masterVolume: 1,
          speechEnabled: false,
          uiSoundsEnabled: true,
        },
        { ...BASE_SNAPSHOT, theme: "xp" }
      )
    ).toEqual({ wallpaper: "aurora", theme: "macosx" });
  });

  test("wallpaper plus intentional theme change still applies both", () => {
    expect(
      sanitizeSettingsInput(
        {
          wallpaper: "aurora",
          theme: "xp",
        },
        BASE_SNAPSHOT
      )
    ).toEqual({ wallpaper: "aurora", theme: "xp" });
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

  test("keeps wallpaperShuffle when it differs from the current selection", () => {
    expect(
      sanitizeSettingsInput(
        { wallpaperShuffle: "nature", ...OVERFILLED_CURRENT_VALUES },
        { ...BASE_SNAPSHOT, currentWallpaper: "/wallpapers/tiles/bondi.png" }
      )
    ).toEqual({ wallpaperShuffle: "nature" });
  });

  test("drops wallpaperShuffle echoing the current shuffle descriptor", () => {
    expect(
      sanitizeSettingsInput(
        { wallpaperShuffle: "nature" },
        { ...BASE_SNAPSHOT, currentWallpaper: "shuffle://photos/nature" }
      )
    ).toEqual({});
  });

  test("keeps wallpaperDynamic when it differs from the current selection", () => {
    expect(
      sanitizeSettingsInput(
        { wallpaperDynamic: "weather" },
        { ...BASE_SNAPSHOT, currentWallpaper: "dynamic://cover" }
      )
    ).toEqual({ wallpaperDynamic: "weather" });
  });

  test("drops wallpaperDynamic echoing the current dynamic descriptor", () => {
    expect(
      sanitizeSettingsInput(
        { wallpaperDynamic: "weather" },
        { ...BASE_SNAPSHOT, currentWallpaper: "dynamic://weather" }
      )
    ).toEqual({});
  });
});

describe("resolveWallpaperConflict", () => {
  const AURORA_PATH = "/wallpapers/photos/nature/aurora.jpg";
  const resolveName = (query: string) =>
    query === "aurora" ? AURORA_PATH : null;

  test("a single wallpaper param passes through untouched", () => {
    expect(
      resolveWallpaperConflict(
        { wallpaperShuffle: "nature", masterVolume: 0 },
        BASE_SNAPSHOT,
        resolveName
      )
    ).toEqual({
      params: { wallpaperShuffle: "nature", masterVolume: 0 },
      conflict: null,
    });
  });

  test("drops a wallpaper name echoing the current wallpaper, keeping the requested shuffle", () => {
    expect(
      resolveWallpaperConflict(
        { wallpaper: "aurora", wallpaperShuffle: "nature" },
        { ...BASE_SNAPSHOT, currentWallpaper: AURORA_PATH },
        resolveName
      )
    ).toEqual({
      params: { wallpaperShuffle: "nature" },
      conflict: null,
    });
  });

  test("reports remaining conflicts after dropping the echoed name", () => {
    expect(
      resolveWallpaperConflict(
        {
          wallpaper: "aurora",
          wallpaperShuffle: "nature",
          wallpaperDynamic: "day-night",
        },
        { ...BASE_SNAPSHOT, currentWallpaper: AURORA_PATH },
        resolveName
      )
    ).toEqual({
      params: {},
      conflict: ["wallpaperShuffle", "wallpaperDynamic"],
    });
  });

  test("strips all wallpaper params on an unresolvable conflict, keeping other settings", () => {
    expect(
      resolveWallpaperConflict(
        {
          wallpaper: "aurora",
          wallpaperShuffle: "nature",
          wallpaperDynamic: "day-night",
          masterVolume: 0,
        },
        { ...BASE_SNAPSHOT, currentWallpaper: "/wallpapers/tiles/bondi.png" },
        resolveName
      )
    ).toEqual({
      params: { masterVolume: 0 },
      conflict: ["wallpaper", "wallpaperShuffle", "wallpaperDynamic"],
    });
  });

  test("without a name resolver, multi-wallpaper bundles report a conflict", () => {
    expect(
      resolveWallpaperConflict(
        { wallpaper: "aurora", wallpaperShuffle: "nature" },
        { ...BASE_SNAPSHOT, currentWallpaper: AURORA_PATH }
      )
    ).toEqual({
      params: {},
      conflict: ["wallpaper", "wallpaperShuffle"],
    });
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
  const addToolOutput = mock(() => {});

  beforeEach(() => {
    setLanguage.mockClear();
    setTheme.mockClear();
    setAccent.mockClear();
    setMasterVolume.mockClear();
    setSpeechEnabled.mockClear();
    setUiSoundsEnabled.mockClear();
    setWallpaper.mockClear();
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
      currentWallpaper: "/wallpapers/tiles/bondi.png",
      setWallpaper,
    } as Partial<ReturnType<typeof useDisplaySettingsStore.getState>>);
  });

  test("multi-setting XP theme and muted UI sounds both apply", async () => {
    const { handleSettings } = await import(
      "../../../src/apps/chats/tools/settingsHandler"
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

  test("wallpaperShuffle applies the shuffle descriptor directly", async () => {
    const { handleSettings } = await import(
      "../../../src/apps/chats/tools/settingsHandler"
    );

    await handleSettings(
      { wallpaperShuffle: "nature" },
      "tc_shuffle",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(setWallpaper).toHaveBeenCalledWith("shuffle://photos/nature");
    expect(setTheme).not.toHaveBeenCalled();
  });

  test("wallpaperDynamic applies the dynamic descriptor directly", async () => {
    const { handleSettings } = await import(
      "../../../src/apps/chats/tools/settingsHandler"
    );

    await handleSettings(
      { wallpaperDynamic: "day-night" },
      "tc_dynamic",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(setWallpaper).toHaveBeenCalledWith("dynamic://gradient/day-night");
    expect(setTheme).not.toHaveBeenCalled();
  });

  test("junk-filled bundle with three wallpaper fields changes nothing and reports the conflict", async () => {
    // Regression: asking for the nature shuffle produced a tool call with
    // every field populated with junk defaults (observed live): language,
    // theme "system7", wallpaper "string", nature shuffle, day-night dynamic,
    // accent, masterVolume 0, speech/sounds, and an update check. The
    // wallpaper-field conflict marks the whole bundle untrustworthy: nothing
    // may be applied (no theme switch, no mute, no update check) and the
    // model gets one retry-hint error instead of a schema rejection.
    const { handleSettings } = await import(
      "../../../src/apps/chats/tools/settingsHandler"
    );

    await handleSettings(
      {
        language: "en",
        theme: "system7",
        wallpaper: "string",
        wallpaperShuffle: "nature",
        wallpaperDynamic: "day-night",
        accent: "default",
        masterVolume: 0,
        speechEnabled: true,
        uiSoundsEnabled: true,
        checkForUpdates: true,
      },
      "tc_bundle",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(setWallpaper).not.toHaveBeenCalled();
    expect(setTheme).not.toHaveBeenCalled();
    expect(setLanguage).not.toHaveBeenCalled();
    expect(setMasterVolume).not.toHaveBeenCalled();
    expect(setSpeechEnabled).not.toHaveBeenCalled();
    expect(setUiSoundsEnabled).not.toHaveBeenCalled();
    expect(setAccent).not.toHaveBeenCalled();
    expect(addToolOutput).toHaveBeenCalledTimes(1);
    expect(addToolOutput.mock.calls[0][0]).toMatchObject({
      tool: "settings",
      toolCallId: "tc_bundle",
      state: "output-error",
    });
  });

  test("shuffle plus an echoed dynamic wallpaper resolves to the shuffle", async () => {
    const { handleSettings } = await import(
      "../../../src/apps/chats/tools/settingsHandler"
    );

    useDisplaySettingsStore.setState({
      currentWallpaper: "dynamic://gradient/day-night",
      setWallpaper,
    } as Partial<ReturnType<typeof useDisplaySettingsStore.getState>>);

    await handleSettings(
      { wallpaperShuffle: "nature", wallpaperDynamic: "day-night" },
      "tc_echo_dynamic",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(setWallpaper).toHaveBeenCalledTimes(1);
    expect(setWallpaper).toHaveBeenCalledWith("shuffle://photos/nature");
    expect(addToolOutput.mock.calls[0][0]).not.toMatchObject({
      state: "output-error",
    });
  });

  test("checkForUpdates-only call does not touch persisted settings", async () => {
    const { handleSettings } = await import(
      "../../../src/apps/chats/tools/settingsHandler"
    );

    await handleSettings(
      {
        ...OVERFILLED_CURRENT_VALUES,
        checkForUpdates: true,
      },
      "tc_updates",
      { addToolOutput, launchApp: () => {}, detectUserOS: () => "mac" }
    );

    expect(setTheme).not.toHaveBeenCalled();
    expect(setWallpaper).not.toHaveBeenCalled();
    expect(setMasterVolume).not.toHaveBeenCalled();
    expect(setLanguage).not.toHaveBeenCalled();
    expect(setUiSoundsEnabled).not.toHaveBeenCalled();
  });
});
