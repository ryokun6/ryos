#!/usr/bin/env bun
/**
 * Seed song metadata from ipod-videos.json to Redis cache
 * Run with: bun run scripts/seed-song-metadata.ts
 *
 * Prerequisites:
 * - For local dev: Run `vercel dev` first, then authenticate as ryo
 * - For production: Set RYO_AUTH_TOKEN environment variable
 * 
 * Environment variables:
 * - API_URL: Base URL for API (default: http://localhost:3000)
 * - RYO_AUTH_TOKEN: Authentication token for user ryo
 * - RYO_PASSWORD: Password to authenticate (alternative to token)
 */

import { readFile } from "fs/promises";
import { join } from "path";

const BASE_URL = process.env.API_URL || "http://localhost:3000";
const RYO_USERNAME = "ryo";

// ANSI color codes
const COLOR = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  BLUE: "\x1b[34m",
};

interface LyricsSearchSelection {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
  score?: number;
}

interface VideoEntry {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSearch?: {
    query?: string;
    selection?: LyricsSearchSelection;
  };
}

interface IpodVideosJson {
  version?: number;
  videos: VideoEntry[];
}

/**
 * Authenticate with password and get token
 */
async function authenticateWithPassword(password: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/chat-rooms?action=authenticateWithPassword`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: BASE_URL,
        },
        body: JSON.stringify({ username: RYO_USERNAME, password }),
      }
    );

    if (res.status === 200) {
      const data = await res.json();
      return data.token || null;
    }
    
    const errorData = await res.json().catch(() => ({}));
    console.error(`${COLOR.RED}Authentication failed:${COLOR.RESET}`, errorData.error || `status ${res.status}`);
    return null;
  } catch (error) {
    console.error(`${COLOR.RED}Authentication error:${COLOR.RESET}`, error);
    return null;
  }
}

/**
 * Save song metadata to cache
 */
async function saveSongMetadata(
  video: VideoEntry,
  authToken: string
): Promise<{ success: boolean; isUpdate: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/song-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "X-Username": RYO_USERNAME,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        youtubeId: video.id,
        title: video.title,
        artist: video.artist,
        album: video.album,
        lyricOffset: video.lyricOffset,
        lyricsSearch: video.lyricsSearch,
      }),
    });

    if (res.status === 200) {
      const data = await res.json();
      return { success: true, isUpdate: data.isUpdate };
    }

    const errorData = await res.json().catch(() => ({}));
    return { success: false, isUpdate: false, error: errorData.error || `status ${res.status}` };
  } catch (error) {
    return {
      success: false,
      isUpdate: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  console.log(`\n${COLOR.CYAN}${COLOR.BOLD}Seeding Song Metadata to Redis Cache${COLOR.RESET}`);
  console.log(`${COLOR.DIM}API URL: ${BASE_URL}${COLOR.RESET}\n`);

  // Get authentication token
  let authToken: string | null = process.env.RYO_AUTH_TOKEN ?? null;
  
  if (!authToken) {
    const password = process.env.RYO_PASSWORD || "testtest";
    console.log(`${COLOR.DIM}Authenticating as '${RYO_USERNAME}'...${COLOR.RESET}`);
    authToken = await authenticateWithPassword(password);
    
    if (!authToken) {
      console.error(`\n${COLOR.RED}${COLOR.BOLD}ERROR:${COLOR.RESET} Failed to authenticate.`);
      console.error(`Set RYO_AUTH_TOKEN or RYO_PASSWORD environment variable.`);
      process.exit(1);
    }
    console.log(`${COLOR.GREEN}✓${COLOR.RESET} Authenticated successfully\n`);
  } else {
    console.log(`${COLOR.GREEN}✓${COLOR.RESET} Using provided auth token\n`);
  }

  // Read ipod-videos.json
  const jsonPath = join(process.cwd(), "public/data/ipod-videos.json");
  console.log(`${COLOR.DIM}Reading ${jsonPath}...${COLOR.RESET}`);
  
  let data: IpodVideosJson;
  try {
    const content = await readFile(jsonPath, "utf-8");
    data = JSON.parse(content);
  } catch (error) {
    console.error(`\n${COLOR.RED}${COLOR.BOLD}ERROR:${COLOR.RESET} Failed to read ipod-videos.json`);
    console.error(error);
    process.exit(1);
  }

  const videos = data.videos || [];
  console.log(`${COLOR.GREEN}✓${COLOR.RESET} Found ${videos.length} songs to seed\n`);

  // Seed each song
  let successCount = 0;
  let updateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const progress = `[${(i + 1).toString().padStart(3)}/${videos.length}]`;
    
    const result = await saveSongMetadata(video, authToken);
    
    if (result.success) {
      successCount++;
      if (result.isUpdate) {
        updateCount++;
        console.log(`${COLOR.DIM}${progress}${COLOR.RESET} ${COLOR.BLUE}↻${COLOR.RESET} ${video.title} ${COLOR.DIM}(updated)${COLOR.RESET}`);
      } else {
        console.log(`${COLOR.DIM}${progress}${COLOR.RESET} ${COLOR.GREEN}+${COLOR.RESET} ${video.title}`);
      }
    } else {
      errorCount++;
      console.log(`${COLOR.DIM}${progress}${COLOR.RESET} ${COLOR.RED}✗${COLOR.RESET} ${video.title} ${COLOR.DIM}(${result.error})${COLOR.RESET}`);
    }

    // Small delay to avoid rate limiting
    if (i < videos.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // Summary
  console.log(`\n${COLOR.BOLD}Summary:${COLOR.RESET}`);
  console.log(`  ${COLOR.GREEN}✓${COLOR.RESET} Added: ${successCount - updateCount}`);
  console.log(`  ${COLOR.BLUE}↻${COLOR.RESET} Updated: ${updateCount}`);
  if (errorCount > 0) {
    console.log(`  ${COLOR.RED}✗${COLOR.RESET} Errors: ${errorCount}`);
  }

  if (errorCount === 0) {
    console.log(`\n${COLOR.GREEN}${COLOR.BOLD}Done!${COLOR.RESET} All songs have been seeded.\n`);
    process.exit(0);
  } else {
    console.log(`\n${COLOR.YELLOW}${COLOR.BOLD}Warning:${COLOR.RESET} Some songs could not be seeded.\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Seed script error:", error);
  process.exit(1);
});
