import {
  getControlPanelCategory,
  type ControlPanelPaneId,
} from "./controlPanelsCategories";

/**
 * A single searchable preference. Each entry maps a user-facing setting to the
 * pane that hosts it, mirroring the Mac OS X System Preferences search index.
 *
 * - `labelKey` is the i18n key shown as the result title.
 * - `keywords` are locale-independent fallbacks (brand names, synonyms) matched
 *   in addition to the localized label + pane name.
 */
export type ControlPanelSearchEntry = {
  paneId: ControlPanelPaneId;
  labelKey: string;
  keywords?: string[];
};

const CP = "apps.control-panels";

export const CONTROL_PANEL_SEARCH_ENTRIES: ControlPanelSearchEntry[] = [
  // Appearance
  {
    paneId: "appearance",
    labelKey: `${CP}.panes.appearance`,
    keywords: ["appearance", "look", "skin"],
  },
  {
    paneId: "appearance",
    labelKey: `${CP}.theme`,
    keywords: ["theme", "system 7", "aqua", "glass", "windows", "xp", "98"],
  },
  {
    paneId: "appearance",
    labelKey: `${CP}.darkMode`,
    keywords: ["dark", "light", "mode", "night", "appearance"],
  },
  {
    paneId: "appearance",
    labelKey: `${CP}.accent`,
    keywords: ["accent", "color", "colour", "tint", "highlight"],
  },

  // Desktop & Screen Saver
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.panes.desktopScreenSaver`,
    keywords: ["desktop", "wallpaper", "background", "screen saver", "screensaver"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.desktopTab`,
    keywords: ["wallpaper", "background", "desktop", "pattern", "picture"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.patterns`,
    keywords: ["pattern", "patterns", "tile", "background", "desktop"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverTab`,
    keywords: ["screensaver", "screen saver", "idle", "sleep"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverType`,
    keywords: ["screensaver", "screen saver", "type", "style", "module"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.startAfter`,
    keywords: ["screensaver", "idle", "delay", "timeout", "minutes", "start after"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverOptions.starfield.name`,
    keywords: ["screensaver", "starfield", "stars", "warp", "space"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverOptions.flyingToasters.name`,
    keywords: ["screensaver", "flying toasters", "after dark", "toaster"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverOptions.matrix.name`,
    keywords: ["screensaver", "matrix", "digital rain", "code"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverOptions.bouncingLogo.name`,
    keywords: ["screensaver", "bouncing logo", "dvd", "logo"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverOptions.pipes.name`,
    keywords: ["screensaver", "pipes", "3d pipes", "windows"],
  },
  {
    paneId: "desktop-screen-saver",
    labelKey: `${CP}.screenSaverOptions.maze.name`,
    keywords: ["screensaver", "maze", "3d maze", "labyrinth"],
  },

  // International
  {
    paneId: "international",
    labelKey: `${CP}.panes.international`,
    keywords: ["language", "region", "locale", "international", "translation"],
  },
  {
    paneId: "international",
    labelKey: "settings.language.title",
    keywords: [
      "language",
      "locale",
      "region",
      "translation",
      "english",
      "chinese",
      "japanese",
      "korean",
      "french",
      "german",
      "spanish",
      "portuguese",
      "italian",
      "russian",
    ],
  },
  {
    paneId: "international",
    labelKey: `${CP}.timeZone`,
    keywords: [
      "timezone",
      "time zone",
      "clock",
      "utc",
      "gmt",
      "globe",
      "region",
      "offset",
    ],
  },

  // Assistant
  {
    paneId: "assistant",
    labelKey: `${CP}.panes.assistant`,
    keywords: ["assistant", "clippy", "helper", "character", "agent"],
  },
  {
    paneId: "assistant",
    labelKey: `${CP}.assistant.title`,
    keywords: [
      "assistant",
      "desktop assistant",
      "clippy",
      "merlin",
      "rover",
      "links",
      "genie",
      "peedy",
      "character",
      "office assistant",
    ],
  },

  // Security
  {
    paneId: "security",
    labelKey: `${CP}.panes.security`,
    keywords: ["security", "privacy", "lock"],
  },
  {
    paneId: "security",
    labelKey: `${CP}.password`,
    keywords: ["password", "passcode", "lock", "change password", "set password"],
  },
  {
    paneId: "security",
    labelKey: `${CP}.recoveryEmailTitle`,
    keywords: ["recovery", "email", "reset"],
  },
  {
    paneId: "security",
    labelKey: `${CP}.logOut`,
    keywords: ["log out", "logout", "sign out", "signout", "exit"],
  },
  {
    paneId: "security",
    labelKey: `${CP}.logOutOfAllDevices`,
    keywords: [
      "log out all",
      "logout all",
      "sign out all",
      "all devices",
      "everywhere",
      "revoke",
      "sessions",
    ],
  },
  {
    paneId: "security",
    labelKey: `${CP}.deleteAccount.title`,
    keywords: ["delete account", "remove account", "erase account", "close account"],
  },

  // Displays
  {
    paneId: "displays",
    labelKey: `${CP}.panes.displays`,
    keywords: ["display", "screen", "monitor"],
  },
  {
    paneId: "displays",
    labelKey: `${CP}.displayMode`,
    keywords: [
      "color filter",
      "mono",
      "monochrome",
      "crt",
      "sepia",
      "high contrast",
      "dream",
      "invert",
      "display mode",
    ],
  },
  {
    paneId: "displays",
    labelKey: `${CP}.shaderEffect`,
    keywords: ["shader", "crt", "galaxy", "aurora", "effect"],
  },

  // Sound
  {
    paneId: "sound",
    labelKey: `${CP}.panes.sound`,
    keywords: ["sound", "audio", "volume"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.uiSounds`,
    keywords: ["ui sounds", "clicks", "feedback"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.speech`,
    keywords: ["speech", "voice", "tts"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.browserTtsVoice`,
    keywords: [
      "tts",
      "voice",
      "tts voice",
      "text to speech",
      "read aloud",
      "speech voice",
      "books",
      "calculator",
    ],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.terminalIeAmbientSynth`,
    keywords: [
      "synth",
      "ambient synth",
      "terminal",
      "ie",
      "internet explorer",
      "sound effects",
    ],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.chatSynth`,
    keywords: ["chat synth", "synth", "typing", "preset", "chats"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.masterVolume`,
    keywords: ["volume", "master", "mute"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.uiVolume`,
    keywords: ["volume", "ui volume", "interface", "mute"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.speechVolume`,
    keywords: ["volume", "speech volume", "voice", "tts", "mute"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.chatSynthVolume`,
    keywords: ["volume", "chat synth volume", "synth", "mute"],
  },
  {
    paneId: "sound",
    labelKey: `${CP}.ipodVolume`,
    keywords: ["volume", "ipod volume", "music", "mute"],
  },

  // Cloud Sync (.mac)
  {
    paneId: "dot-mac",
    labelKey: `${CP}.panes.dotMac`,
    keywords: ["cloud", "sync", "icloud", ".mac"],
  },
  {
    paneId: "dot-mac",
    labelKey: `${CP}.autoSync.title`,
    keywords: ["auto sync", "sync", "devices"],
  },

  // Backup & Restore (sharing)
  {
    paneId: "sharing",
    labelKey: `${CP}.panes.sharing`,
    keywords: ["backup", "restore", "export", "import", "sharing"],
  },
  {
    paneId: "sharing",
    labelKey: `${CP}.backup`,
    keywords: ["backup", "export", "save"],
  },
  {
    paneId: "sharing",
    labelKey: `${CP}.restore`,
    keywords: ["restore", "import", "load"],
  },
  {
    paneId: "sharing",
    labelKey: `${CP}.resetAllSettings`,
    keywords: ["reset", "reset all", "restore defaults", "clear settings", "defaults"],
  },
  {
    paneId: "sharing",
    labelKey: `${CP}.formatFileSystem`,
    keywords: [
      "format",
      "format file system",
      "erase",
      "wipe",
      "reset disk",
      "clear files",
    ],
  },

  // Accounts
  {
    paneId: "accounts",
    labelKey: `${CP}.panes.accounts`,
    keywords: ["account", "user", "login", "profile", "sign in"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.email.title`,
    keywords: ["email", "recovery email", "mail", "address"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.telegram.title`,
    keywords: ["telegram", "link", "bot"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.systemFont`,
    keywords: ["font", "typeface", "ui font"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.aiModel`,
    keywords: ["ai", "model", "chat", "llm"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.ttsModel`,
    keywords: ["tts", "text to speech", "voice", "openai", "elevenlabs"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.ttsVoice`,
    keywords: ["tts", "voice", "speech"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.debugMode`,
    keywords: ["debug", "developer"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.showResizers`,
    keywords: ["resizers", "resize handles", "debug", "developer"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.bootScreen`,
    keywords: ["boot", "boot screen", "startup", "splash", "debug"],
  },
  {
    paneId: "accounts",
    labelKey: `${CP}.errorBoundaries`,
    keywords: ["error", "crash", "boundary", "test", "debug"],
  },

  // Software Update
  {
    paneId: "software-update",
    labelKey: `${CP}.panes.softwareUpdate`,
    keywords: ["update", "software", "version", "upgrade"],
  },
  {
    paneId: "software-update",
    labelKey: `${CP}.checkForUpdates`,
    keywords: ["update", "check", "version"],
  },
  {
    paneId: "software-update",
    labelKey: `${CP}.viewChangelog`,
    keywords: ["changelog", "release notes", "whats new", "what's new", "history"],
  },
  {
    paneId: "software-update",
    labelKey: `${CP}.privacyPolicy`,
    keywords: ["privacy", "policy", "data"],
  },
  {
    paneId: "software-update",
    labelKey: `${CP}.termsOfService`,
    keywords: ["terms", "tos", "service", "legal", "agreement"],
  },
];

export type ControlPanelSearchResult = {
  paneId: ControlPanelPaneId;
  /** Localized setting label (result title). */
  label: string;
  /** Localized pane name (result subtitle). */
  paneLabel: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns matching preference entries for the given query, in index order, with
 * duplicate labels removed. The matcher is a case-insensitive substring match
 * against the localized label, the pane name, and the entry keywords.
 */
export function searchControlPanels(
  query: string,
  t: (key: string) => string
): ControlPanelSearchResult[] {
  const q = normalize(query);
  if (!q) return [];

  const results: ControlPanelSearchResult[] = [];
  const seen = new Set<string>();

  for (const entry of CONTROL_PANEL_SEARCH_ENTRIES) {
    const category = getControlPanelCategory(entry.paneId);
    if (!category) continue;

    const label = t(entry.labelKey);
    const paneLabel = t(category.labelKey);
    const haystack = [
      label,
      paneLabel,
      ...(entry.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(q)) continue;

    const dedupeKey = `${entry.paneId}:${label}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({ paneId: entry.paneId, label, paneLabel });
  }

  return results;
}

/** Union of pane IDs that match the query — used to drive the spotlight. */
export function getSpotlightPaneIds(
  results: ControlPanelSearchResult[]
): Set<ControlPanelPaneId> {
  return new Set(results.map((result) => result.paneId));
}
