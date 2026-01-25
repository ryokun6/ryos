#!/usr/bin/env bun

/**
 * Generate documentation pages for each app using AI subagents.
 * Reads app metadata and source code, then uses Gemini to generate comprehensive doc pages.
 * 
 * Usage:
 *   bun run scripts/generate-app-docs.ts                    # Generate all app docs (skip existing)
 *   bun run scripts/generate-app-docs.ts --app ipod         # Generate docs for specific app
 *   bun run scripts/generate-app-docs.ts --dry-run          # Preview without generating
 *   bun run scripts/generate-app-docs.ts --force            # Regenerate all docs even if they exist
 */

import { readFile, readdir, stat, writeFile } from "fs/promises";
import { join } from "path";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

const DOCS_DIR = "docs";
const APPS_DIR = "src/apps";
const OUTPUT_DIR = DOCS_DIR;

// App IDs with their section numbers (under section 2 - Apps)
const APP_CONFIGS: Record<string, { sectionNum: string; docName: string }> = {
  "chats": { sectionNum: "2.1", docName: "chats" },
  "internet-explorer": { sectionNum: "2.2", docName: "internet-explorer" },
  "ipod": { sectionNum: "2.3", docName: "ipod" },
  "karaoke": { sectionNum: "2.4", docName: "karaoke" },
  "textedit": { sectionNum: "2.5", docName: "textedit" },
  "finder": { sectionNum: "2.6", docName: "finder" },
  "paint": { sectionNum: "2.7", docName: "paint" },
  "photo-booth": { sectionNum: "2.8", docName: "photo-booth" },
  "terminal": { sectionNum: "2.9", docName: "terminal" },
  "control-panels": { sectionNum: "2.10", docName: "control-panels" },
  "soundboard": { sectionNum: "2.11", docName: "soundboard" },
  "synth": { sectionNum: "2.12", docName: "synth" },
  "videos": { sectionNum: "2.13", docName: "videos" },
  "minesweeper": { sectionNum: "2.14", docName: "minesweeper" },
  "pc": { sectionNum: "2.15", docName: "virtual-pc" },
  "admin": { sectionNum: "2.16", docName: "admin" },
  "applet-viewer": { sectionNum: "2.17", docName: "applet-store" },
  "stickies": { sectionNum: "2.18", docName: "stickies" },
};

const APP_IDS = Object.keys(APP_CONFIGS) as (keyof typeof APP_CONFIGS)[];

interface AppMetadata {
  name: string;
  version: string;
  creator: {
    name: string;
    url: string;
  };
  github: string;
  icon: string;
}

interface HelpItem {
  icon: string;
  title: string;
  description: string;
}

interface AppInfo {
  id: string;
  name: string;
  description: string;
  metadata: AppMetadata;
  helpItems: HelpItem[];
  windowConfig: {
    defaultSize: { width: number; height: number };
    minSize?: { width: number; height: number };
    maxSize?: { width: number; height: number };
    mobileDefaultSize?: { width: number; height: number };
    mobileSquare?: boolean;
  };
  componentFiles: string[];
  hookFiles: string[];
  utilityFiles: string[];
}

/**
 * Check if API key is available
 */
function checkApiKey(): boolean {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return false;
  }
  return true;
}

/**
 * Check if all doc files already exist
 */
async function allDocsExist(): Promise<boolean> {
  for (const appId of APP_IDS) {
    const config = APP_CONFIGS[appId];
    const docFileName = `${config.sectionNum}-${config.docName}.md`;
    const docFilePath = join(OUTPUT_DIR, docFileName);
    try {
      await stat(docFilePath);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Read app index file to extract metadata and help items
 */
async function readAppIndex(appId: string): Promise<{
  metadata: AppMetadata | null;
  helpItems: HelpItem[];
}> {
  const indexPath = join(APPS_DIR, appId, "index.tsx");
  const indexPathAlt = join(APPS_DIR, appId, "index.ts");
  
  let content = "";
  try {
    content = await readFile(indexPath, "utf-8");
  } catch {
    try {
      content = await readFile(indexPathAlt, "utf-8");
    } catch {
      console.warn(`⚠️  No index file found for ${appId}`);
      return { metadata: null, helpItems: [] };
    }
  }

  // Extract appMetadata export - handle multiline objects
  const metadataMatch = content.match(/export const appMetadata\s*=\s*(\{[\s\S]*?\});/s);
  let metadata: AppMetadata | null = null;
  if (metadataMatch) {
    try {
      const metadataCode = metadataMatch[1];
      // Simple extraction - look for name, version, etc. - handle escaped quotes and newlines
      const nameMatch = metadataCode.match(/name:\s*["']([^"']+)["']/);
      const versionMatch = metadataCode.match(/version:\s*["']([^"']+)["']/);
      const iconMatch = metadataCode.match(/icon:\s*["']([^"']+)["']/);
      
      if (nameMatch) {
        metadata = {
          name: nameMatch[1],
          version: versionMatch ? versionMatch[1] : "1.0",
          creator: {
            name: "Ryo Lu",
            url: "https://ryo.lu",
          },
          github: "https://github.com/ryokun6/ryos",
          icon: iconMatch ? iconMatch[1] : "/icons/default/question.png",
        };
      }
    } catch (e) {
      console.warn(`⚠️  Could not parse metadata for ${appId}:`, e);
    }
  }

  // Extract helpItems export - handle multiline content with dotall flag
  const helpItemsMatch = content.match(/export const helpItems\s*=\s*(\[[\s\S]*?\]);/s);
  const helpItems: HelpItem[] = [];
  if (helpItemsMatch) {
    try {
      // Use a simple pattern that matches icon, title, description fields - works reliably
      const itemPattern = /icon:\s*["']([^"']+)["'],\s*title:\s*["']([^"']+)["'],\s*description:\s*["']([^"']+)["']/g;
      const itemMatches = content.matchAll(itemPattern);
      for (const match of itemMatches) {
        helpItems.push({
          icon: match[1],
          title: match[2],
          description: match[3],
        });
      }
    } catch (e) {
      console.warn(`⚠️  Could not parse helpItems for ${appId}:`, e);
    }
  }

  return { metadata, helpItems };
}

/**
 * Get window config from app registry type info or defaults
 */
function getWindowConfig(appId: string): AppInfo["windowConfig"] {
  // Default window configs - these match appRegistry.tsx
  const configs: Record<string, AppInfo["windowConfig"]> = {
    finder: {
      defaultSize: { width: 400, height: 300 },
      minSize: { width: 300, height: 200 },
    },
    soundboard: {
      defaultSize: { width: 650, height: 475 },
      minSize: { width: 550, height: 375 },
    },
    "internet-explorer": {
      defaultSize: { width: 730, height: 600 },
      minSize: { width: 400, height: 300 },
    },
    chats: {
      defaultSize: { width: 560, height: 360 },
      minSize: { width: 300, height: 320 },
    },
    textedit: {
      defaultSize: { width: 430, height: 475 },
      minSize: { width: 430, height: 200 },
    },
    paint: {
      defaultSize: { width: 713, height: 480 },
      minSize: { width: 400, height: 400 },
      maxSize: { width: 713, height: 535 },
    },
    "photo-booth": {
      defaultSize: { width: 644, height: 510 },
      minSize: { width: 644, height: 510 },
      maxSize: { width: 644, height: 510 },
    },
    minesweeper: {
      defaultSize: { width: 305, height: 400 },
      minSize: { width: 305, height: 400 },
      maxSize: { width: 305, height: 400 },
    },
    videos: {
      defaultSize: { width: 400, height: 420 },
      minSize: { width: 400, height: 340 },
    },
    ipod: {
      defaultSize: { width: 300, height: 480 },
      minSize: { width: 300, height: 480 },
    },
    karaoke: {
      defaultSize: { width: 560, height: 560 },
      minSize: { width: 400, height: 300 },
      mobileSquare: true,
    },
    synth: {
      defaultSize: { width: 720, height: 400 },
      minSize: { width: 720, height: 290 },
    },
    pc: {
      defaultSize: { width: 645, height: 511 },
      minSize: { width: 645, height: 511 },
      maxSize: { width: 645, height: 511 },
    },
    terminal: {
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 400, height: 300 },
    },
    "applet-viewer": {
      defaultSize: { width: 320, height: 450 },
      minSize: { width: 300, height: 200 },
    },
    "control-panels": {
      defaultSize: { width: 365, height: 415 },
      minSize: { width: 320, height: 415 },
      maxSize: { width: 365, height: 600 },
    },
    admin: {
      defaultSize: { width: 800, height: 500 },
      minSize: { width: 600, height: 400 },
    },
    stickies: {
      defaultSize: { width: 500, height: 400 },
      minSize: { width: 300, height: 250 },
    },
  };

  return configs[appId] || {
    defaultSize: { width: 730, height: 475 },
    minSize: { width: 300, height: 200 },
  };
}

/**
 * Scan app directory for component, hook, and utility files
 * Returns full paths like src/apps/{appId}/components/...
 */
async function scanAppFiles(appId: string): Promise<{
  componentFiles: string[];
  hookFiles: string[];
  utilityFiles: string[];
}> {
  const appDir = join(APPS_DIR, appId);
  const appPrefix = `src/apps/${appId}/`;
  
  try {
    await stat(appDir);
  } catch {
    return { componentFiles: [], hookFiles: [], utilityFiles: [] };
  }

  const componentFiles: string[] = [];
  const hookFiles: string[] = [];
  const utilityFiles: string[] = [];

  async function scanDir(dir: string, baseDir: string = appDir) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      // Normalize path separators to forward slashes for consistent matching
      const relativePath = fullPath.replace(baseDir + "/", "").replace(/\\/g, "/");
      // Create full path with src/apps/{appId}/ prefix
      const fullRelativePath = appPrefix + relativePath;
      
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          await scanDir(fullPath, baseDir);
        }
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          if (relativePath.includes("components/")) {
            componentFiles.push(fullRelativePath);
          } else if (relativePath.includes("hooks/")) {
            hookFiles.push(fullRelativePath);
          } else if (relativePath.includes("utils/") || relativePath.includes("commands/")) {
            utilityFiles.push(fullRelativePath);
          }
        }
      }
    }
  }

  await scanDir(appDir);
  
  return { componentFiles, hookFiles, utilityFiles };
}

/**
 * Read key component file to understand app functionality
 */
async function readComponentFile(appId: string): Promise<string> {
  const appComponentPath = join(APPS_DIR, appId, "components", `${appId.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("")}AppComponent.tsx`);
  const altPaths = [
    join(APPS_DIR, appId, "components", "PhotoBoothComponent.tsx"), // photo-booth special case
    join(APPS_DIR, appId, "components", "AppletViewerAppComponent.tsx"), // applet-viewer special case
  ];

  let content = "";
  try {
    content = await readFile(appComponentPath, "utf-8");
  } catch {
    for (const altPath of altPaths) {
      try {
        content = await readFile(altPath, "utf-8");
        break;
      } catch {
        // continue
      }
    }
  }

  if (!content) {
    // Try to find any component file
    const { componentFiles } = await scanAppFiles(appId);
    if (componentFiles.length > 0) {
      const firstComponent = join(APPS_DIR, appId, "components", componentFiles[0].split("/").pop() || "");
      try {
        content = await readFile(firstComponent, "utf-8");
      } catch {
        // ignore
      }
    }
  }

  // Limit content size to avoid token limits - take first 3000 chars
  return content.slice(0, 3000);
}

/**
 * Generate doc content for an app using AI
 */
async function generateAppDoc(appInfo: AppInfo, componentContent: string): Promise<string> {
  const { metadata, helpItems, windowConfig, componentFiles, hookFiles, utilityFiles } = appInfo;

  const prompt = `You are a technical documentation writer for ryOS, a web-based desktop environment. Generate a comprehensive markdown documentation page for the "${metadata.name}" app.

App Information:
- Name: ${metadata.name}
- Version: ${metadata.version}
- Description: ${appInfo.description}
- Window Size: ${windowConfig.defaultSize.width}x${windowConfig.defaultSize.height} (default), ${windowConfig.minSize ? `${windowConfig.minSize.width}x${windowConfig.minSize.height} minimum` : "no minimum"}
${windowConfig.maxSize ? `- Max Size: ${windowConfig.maxSize.width}x${windowConfig.maxSize.height}` : ""}
${windowConfig.mobileSquare ? "- Mobile: Square aspect ratio" : ""}

Key Features (from help items):
${helpItems.map(item => `- ${item.icon} **${item.title}**: ${item.description}`).join("\n")}

Component Files: ${componentFiles.length > 0 ? componentFiles.join(", ") : "None"}
Hook Files: ${hookFiles.length > 0 ? hookFiles.join(", ") : "None"}
Utility Files: ${utilityFiles.length > 0 ? utilityFiles.join(", ") : "None"}

Component Code Preview:
\`\`\`typescript
${componentContent.slice(0, 2000)}
\`\`\`

Generate a markdown document with the following structure:

# ${metadata.name}

Brief overview (2-3 sentences) of what this app does and its purpose in ryOS.

## Overview

Describe the app's main functionality, target use cases, and key capabilities. Keep it concise but informative (2-3 paragraphs).

## Features

Create a bulleted list of main features based on the help items above. Group related features together. Include:
- Core functionality
- User interface highlights
- Technical capabilities
- Integration with other ryOS features

## User Guide

### Getting Started
Brief instructions on how to launch and use the app (2-3 sentences).

### Key Actions
List the main user actions with brief descriptions. Use the help items as reference but write naturally flowing prose, not just copying descriptions.

### Tips & Shortcuts
Include any notable UI patterns, keyboard shortcuts, or workflow tips that would help users.

## Technical Details

### Window Configuration
- Default size: ${windowConfig.defaultSize.width}×${windowConfig.defaultSize.height}px
${windowConfig.minSize ? `- Minimum size: ${windowConfig.minSize.width}×${windowConfig.minSize.height}px` : ""}
${windowConfig.maxSize ? `- Maximum size: ${windowConfig.maxSize.width}×${windowConfig.maxSize.height}px` : ""}
${windowConfig.mobileSquare ? "- Mobile: Square aspect ratio (height = width)" : windowConfig.mobileDefaultSize ? `- Mobile default: ${windowConfig.mobileDefaultSize.width}×${windowConfig.mobileDefaultSize.height}px` : ""}

### Component Architecture
${componentFiles.length > 0 ? `The app consists of ${componentFiles.length} component file(s):\n\n${componentFiles.map(f => `- \`${f}\``).join("\n")}` : "No separate component files (single component app)."}

### Hooks & Utilities
${hookFiles.length > 0 ? `**Custom Hooks:**\n${hookFiles.map(f => `- \`${f}\``).join("\n")}\n\n` : ""}
${utilityFiles.length > 0 ? `**Utilities:**\n${utilityFiles.map(f => `- \`${f}\``).join("\n")}` : "No custom hooks or utilities."}

### State Management
Briefly describe what state the app manages (if applicable). Mention if it uses Zustand stores, local state, or both.

## Related Apps

Mention 1-2 related apps that work well with this app or share similar functionality. Keep it brief (1 sentence per related app).

---

Write the documentation in a clear, professional tone. Use markdown formatting properly. Do not include a table of contents. Keep the total length reasonable (around 400-600 words for the main content sections).`;

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    return text;
  } catch (error) {
    console.error(`❌ Error generating doc for ${appInfo.id}:`, error);
    throw error;
  }
}

/**
 * Generate documentation for a single app
 */
async function generateAppDocumentation(appId: string, dryRun: boolean = false, force: boolean = false): Promise<void> {
  console.log(`\n📱 Processing app: ${appId}`);

  // Read app metadata
  const { metadata, helpItems } = await readAppIndex(appId);
  
  if (!metadata) {
    console.warn(`⚠️  No metadata found for ${appId}, skipping...`);
    return;
  }

  // Get window config
  const windowConfig = getWindowConfig(appId);

  // Scan app files
  const { componentFiles, hookFiles, utilityFiles } = await scanAppFiles(appId);

  // Read component content
  const componentContent = await readComponentFile(appId);

  // Build app info
  const appInfo: AppInfo = {
    id: appId,
    name: metadata.name,
    description: `App description for ${metadata.name}`, // We'll get this from registry or generate
    metadata,
    helpItems,
    windowConfig,
    componentFiles,
    hookFiles,
    utilityFiles,
  };

  // Get description from app registry or use a default
  const descriptions: Record<string, string> = {
    finder: "Browse and manage files in a virtual file system backed by IndexedDB",
    soundboard: "Record and play sound effects with keyboard shortcuts and waveform visualization",
    "internet-explorer": "Browse the web with AI-powered content generation and time machine view",
    chats: "Chat with Ryo AI assistant, join chat rooms, and control ryOS apps through natural language",
    textedit: "Rich text editor with markdown support, slash commands, and speech-to-text integration",
    paint: "Draw and edit images with canvas-based tools, filters, and pattern support",
    "photo-booth": "Take photos with your webcam and apply fun visual effects",
    minesweeper: "Classic puzzle game where you find mines without triggering them",
    videos: "Watch videos with React Player supporting YouTube and local file playback",
    ipod: "1st generation iPod music player with YouTube integration, cover flow, and synced lyrics",
    karaoke: "Karaoke player with synced lyrics display, translations, and pronunciation guides",
    synth: "Virtual synthesizer with 3D waveform visualization using Three.js and Tone.js",
    pc: "3D PC simulation experience using js-dos emulator integration",
    terminal: "Command line interface with AI integration, file system navigation, and custom commands",
    "applet-viewer": "Browse and run user-created HTML applets from the Applet Store",
    "control-panels": "System settings for themes, wallpapers, screen savers, and audio volume mixing",
    admin: "System administration panel for managing users, songs, and system configuration (admin only)",
    stickies: "Create and manage colorful sticky notes for quick reminders and note-taking",
  };

  appInfo.description = descriptions[appId] || `A ${metadata.name} application for ryOS`;

  // Check if doc file already exists
  const config = APP_CONFIGS[appId];
  const docFileName = `${config.sectionNum}-${config.docName}.md`;
  const docFilePath = join(OUTPUT_DIR, docFileName);
  
  let docExists = false;
  try {
    await stat(docFilePath);
    docExists = true;
  } catch {
    // File doesn't exist, will generate
  }

  if (dryRun) {
    console.log(`🔍 Dry-run: Would generate doc for ${appId}`);
    if (docExists) {
      console.log(`   ℹ️  Doc file already exists: ${docFileName}`);
    }
    console.log(`   - Name: ${metadata.name}`);
    console.log(`   - Help items: ${helpItems.length}`);
    console.log(`   - Components: ${componentFiles.length}`);
    console.log(`   - Hooks: ${hookFiles.length}`);
    console.log(`   - Utilities: ${utilityFiles.length}`);
    return;
  }

  // Skip generation if file exists and force is not set
  if (docExists && !force) {
    console.log(`   ⏭️  Skipping ${docFileName} (already exists, use --force to regenerate)`);
    return;
  }

  // Generate doc content
  if (docExists && force) {
    console.log(`   🔄 Regenerating documentation...`);
  } else {
    console.log(`   Generating documentation...`);
  }
  
  const docContent = await generateAppDoc(appInfo, componentContent);

  // Write doc file
  await writeFile(docFilePath, docContent + "\n", "utf-8");
  
  console.log(`   ✅ Generated: ${docFileName}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const appArg = args.find((arg) => arg.startsWith("--app="))?.split("=")[1] || 
                 (args.includes("--app") && args[args.indexOf("--app") + 1]) || 
                 undefined;

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run scripts/generate-app-docs.ts [options]

Options:
  --app=<appId>         Generate docs for specific app only
  --dry-run             Preview what would be generated without creating files
  --force               Regenerate docs even if they already exist
  --help, -h            Show this help message

Examples:
  bun run scripts/generate-app-docs.ts
  bun run scripts/generate-app-docs.ts --app ipod
  bun run scripts/generate-app-docs.ts --dry-run
  bun run scripts/generate-app-docs.ts --force

Environment:
  GOOGLE_GENERATIVE_AI_API_KEY  Required: Your Google Gemini API key
`);
    process.exit(0);
  }

  const hasApiKey = checkApiKey();

  // If no API key and not forcing regeneration, check if all docs exist
  // If they do, we can skip gracefully (docs are already committed to git)
  if (!dryRun && !hasApiKey) {
    const docsExist = await allDocsExist();
    if (docsExist && !force) {
      console.log("ℹ️  All documentation files already exist, skipping generation");
      console.log("   (Set GOOGLE_GENERATIVE_AI_API_KEY to regenerate docs)");
      return;
    } else if (force || !docsExist) {
      console.error("❌ Error: GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set");
      console.error("\nPlease set it with:");
      console.error("  export GOOGLE_GENERATIVE_AI_API_KEY=your_api_key");
      console.error("\nOr add it to your .env file");
      process.exit(1);
    }
  }

  console.log("🤖 Generating App Documentation using Gemini 2.5 Flash");
  console.log("═".repeat(60));

  const appsToProcess = appArg ? [appArg] : APP_IDS;

  if (dryRun) {
    console.log("🔍 Dry-run mode: No documentation will be generated\n");
  } else if (force) {
    console.log("🔄 Force mode: Will regenerate all documentation files\n");
  } else {
    console.log("ℹ️  Skipping existing documentation files (use --force to regenerate)\n");
  }

  let successCount = 0;
  let failCount = 0;

  for (const appId of appsToProcess) {
    if (!(APP_IDS as readonly string[]).includes(appId)) {
      console.error(`❌ Invalid app ID: ${appId}`);
      failCount++;
      continue;
    }

    try {
      await generateAppDocumentation(appId, dryRun, force);
      successCount++;
      
      // Small delay to avoid rate limiting
      if (!dryRun && appsToProcess.indexOf(appId) < appsToProcess.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Failed to generate docs for ${appId}:`, error);
      failCount++;
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("                         SUMMARY");
  console.log("═".repeat(60));
  console.log(`\n✅ Successfully processed: ${successCount} app(s)`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount} app(s)`);
  }
  if (dryRun) {
    console.log("\n💡 Run without --dry-run to generate documentation files");
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});