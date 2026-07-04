/**
 * Fetches Microsoft Agent MP3 sound maps from pithings/clippy (clippy.js lineage)
 * and writes bundled TS modules for offline assistant playback.
 *
 * Also restores stripped `sound` frame fields in public/assets/assistant/clippy/agent.json.
 *
 * Source: https://github.com/pithings/clippy (agents sounds-mp3.ts, agent.ts)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const UPSTREAM_BASE =
  "https://raw.githubusercontent.com/pithings/clippy/main/src/agents";

const CHARACTER_IDS = [
  "clippy",
  "links",
  "f1",
  "genius",
  "rocky",
  "merlin",
  "genie",
  "peedy",
  "rover",
] as const;

type CharacterId = (typeof CHARACTER_IDS)[number];

const ROOT = path.resolve(import.meta.dir, "..");
const SOUNDS_DIR = path.join(
  ROOT,
  "src/components/assistant/sounds"
);
const CLIPPY_AGENT_JSON = path.join(
  ROOT,
  "public/assets/assistant/clippy/agent.json"
);

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

function parseModuleExport(source: string): unknown {
  const objectLiteral = source
    .replace(/^export default\s*/, "")
    .trim()
    .replace(/;\s*$/, "");
  return Function(`"use strict"; return (${objectLiteral});`)();
}

function parseSoundsModule(source: string): Record<string, string> {
  const parsed = parseModuleExport(source);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Could not parse sounds module export");
  }

  const sounds: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      sounds[String(key)] = value;
    }
  }
  return sounds;
}

function parseAgentModule(source: string): {
  animations: Record<
    string,
    { frames: Array<{ sound?: string }> }
  >;
} {
  const parsed = parseModuleExport(source) as {
    animations?: Record<string, { frames: Array<{ sound?: string }> }>;
  };
  if (!parsed?.animations || typeof parsed.animations !== "object") {
    throw new Error("Could not parse agent module export");
  }
  return parsed as {
    animations: Record<string, { frames: Array<{ sound?: string }> }>;
  };
}

function toTsModule(id: CharacterId, sounds: Record<string, string>): string {
  const entries = Object.entries(sounds)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([key, value]) => `  "${key}": ${JSON.stringify(value)},`)
    .join("\n");

  return `/** MP3 clips from clippy.js — https://github.com/clippyjs/clippy.js */\nexport const ${id.toUpperCase()}_SOUNDS: Record<string, string> = {\n${entries}\n};\n`;
}

async function writeSoundModules(): Promise<void> {
  await mkdir(SOUNDS_DIR, { recursive: true });

  const importLines: string[] = [];
  const mapLines: string[] = [];

  for (const id of CHARACTER_IDS) {
    const url = `${UPSTREAM_BASE}/${id}/sounds-mp3.ts`;
    const source = await fetchText(url);
    const sounds = parseSoundsModule(source);
    const fileName = `${id}.ts`;
    await writeFile(
      path.join(SOUNDS_DIR, fileName),
      toTsModule(id, sounds),
      "utf8"
    );
    importLines.push(
      `import { ${id.toUpperCase()}_SOUNDS } from "./${id}";`
    );
    mapLines.push(`  ${id}: ${id.toUpperCase()}_SOUNDS,`);
    console.log(`Wrote ${fileName} (${Object.keys(sounds).length} sounds)`);
  }

  const indexSource = `${importLines.join("\n")}
import type { AssistantCharacterId } from "../characters";

/** MP3 clips from clippy.js — https://github.com/clippyjs/clippy.js */
export const ASSISTANT_SOUND_MAPS: Record<
  AssistantCharacterId,
  Record<string, string>
> = {
${mapLines.join("\n")}
};
`;

  await writeFile(path.join(SOUNDS_DIR, "index.ts"), indexSource, "utf8");
  console.log("Wrote index.ts");
}

async function restoreClippySoundFields(): Promise<number> {
  const [localRaw, upstreamRaw] = await Promise.all([
    readFile(CLIPPY_AGENT_JSON, "utf8"),
    fetchText(`${UPSTREAM_BASE}/clippy/agent.ts`),
  ]);

  const local = JSON.parse(localRaw) as {
    animations: Record<
      string,
      { frames: Array<Record<string, unknown>> }
    >;
  };
  const upstream = parseAgentModule(upstreamRaw);
  let patched = 0;

  for (const [animationName, upstreamAnim] of Object.entries(
    upstream.animations
  )) {
    const localAnim = local.animations[animationName];
    if (!localAnim) continue;

    upstreamAnim.frames.forEach((upstreamFrame, index) => {
      const localFrame = localAnim.frames[index];
      if (!localFrame || upstreamFrame.sound === undefined) return;
      if (localFrame.sound === upstreamFrame.sound) return;
      localFrame.sound = upstreamFrame.sound;
      patched += 1;
    });
  }

  if (patched > 0) {
    await writeFile(
      CLIPPY_AGENT_JSON,
      `${JSON.stringify(local)}\n`,
      "utf8"
    );
  }

  return patched;
}

const patchedCount = await writeSoundModules().then(restoreClippySoundFields);
console.log(`Restored ${patchedCount} clippy frame sound field(s)`);
