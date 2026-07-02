import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

const SHELL_TOP_LEVEL_KEYS = [
  "common",
  "spotlight",
  "components",
  "debug",
  "updates",
  "settings",
] as const;

const APP_METADATA_KEYS = ["name", "description", "nameForMacosX"] as const;

const SHELL_APP_SLICES: Record<string, readonly string[] | "*"> = {
  finder: [
    "folders",
    "contextMenu",
    "window",
    "airdrop",
    "menu",
    "dialogs",
    "fileTypes",
  ],
  dashboard: "*",
  chats: ["messages.greeting", "notification", "toolCalls"],
  "control-panels": [
    "autoSync",
    "telegram",
    "recoveryEmail",
    "deleteAccount",
    "screenSaverExitHint",
    "downloadMacApp",
  ],
  ipod: ["menu", "menuItems", "dialogs", "translationLanguages"],
  karaoke: ["liveListen"],
  "internet-explorer": ["futureTimeline", "year"],
  tv: ["status", "menu"],
  calendar: ["title"],
  soundboard: ["newSoundboardDefault", "importedSoundboard"],
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function copyPath(source: JsonObject, target: JsonObject, pathValue: string) {
  const segments = pathValue.split(".");
  let sourceCursor: unknown = source;
  for (const segment of segments) {
    if (!isObject(sourceCursor) || !(segment in sourceCursor)) {
      return;
    }
    sourceCursor = sourceCursor[segment];
  }

  let targetCursor = target;
  for (const segment of segments.slice(0, -1)) {
    if (!isObject(targetCursor[segment])) {
      targetCursor[segment] = {};
    }
    targetCursor = targetCursor[segment] as JsonObject;
  }
  targetCursor[segments.at(-1)!] = clone(sourceCursor);
}

export function buildShellTranslation(translation: JsonObject): JsonObject {
  const shell: JsonObject = {};
  for (const key of SHELL_TOP_LEVEL_KEYS) {
    if (key in translation) {
      shell[key] = clone(translation[key]);
    }
  }

  const sourceApps = isObject(translation.apps) ? translation.apps : {};
  const shellApps: JsonObject = {};
  for (const [appId, appValue] of Object.entries(sourceApps)) {
    if (!isObject(appValue)) {
      continue;
    }

    const appShell: JsonObject = {};
    for (const key of APP_METADATA_KEYS) {
      if (key in appValue) {
        appShell[key] = clone(appValue[key]);
      }
    }

    const slices = SHELL_APP_SLICES[appId];
    if (slices === "*") {
      Object.assign(appShell, clone(appValue));
    } else {
      for (const slice of slices ?? []) {
        copyPath(appValue, appShell, slice);
      }
    }
    shellApps[appId] = appShell;
  }
  shell.apps = shellApps;
  return shell;
}

async function generateShellTranslation() {
  const sourcePath = path.join(
    process.cwd(),
    "src/lib/locales/en/translation.json"
  );
  const outputPath = path.join(
    process.cwd(),
    "src/lib/locales/en/shell.json"
  );
  const translation = JSON.parse(await readFile(sourcePath, "utf8")) as JsonObject;
  const shell = buildShellTranslation(translation);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(shell, null, 2)}\n`);
  console.log(`[i18n] Generated ${path.relative(process.cwd(), outputPath)}`);
}

if (import.meta.main) {
  await generateShellTranslation();
}
