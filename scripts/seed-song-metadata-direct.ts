#!/usr/bin/env bun
/**
 * Seed song metadata from ipod-videos.json directly to Redis
 * Run with: bun run scripts/seed-song-metadata-direct.ts
 *
 * This script writes directly to Redis, bypassing the API.
 * Requires REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN env vars.
 */

import { Redis } from "@upstash/redis";
import { readFile } from "fs/promises";
import { join } from "path";

// Song metadata cache key prefix (must match api/song-metadata.ts)
const SONG_METADATA_PREFIX = "song:metadata:";
const SONG_METADATA_SET = "song:metadata:all";
const CREATED_BY_USERNAME = "ryo";

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

interface SongMetadata {
  youtubeId: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSearch?: {
    query?: string;
    selection?: {
      hash: string;
      albumId: string | number;
      title: string;
      artist: string;
      album?: string;
    };
  };
  lyricsHash?: string;
  translationHash?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

async function main(): Promise<void> {
  console.log(`\n${COLOR.CYAN}${COLOR.BOLD}Seeding Song Metadata Directly to Redis${COLOR.RESET}`);
  console.log(`${COLOR.DIM}Created by: ${CREATED_BY_USERNAME}${COLOR.RESET}\n`);

  // Check Redis credentials
  const redisUrl = process.env.REDIS_KV_REST_API_URL;
  const redisToken = process.env.REDIS_KV_REST_API_TOKEN;

  if (!redisUrl || !redisToken) {
    console.error(`${COLOR.RED}${COLOR.BOLD}ERROR:${COLOR.RESET} Missing Redis credentials.`);
    console.error(`Set REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN environment variables.`);
    process.exit(1);
  }

  const redis = new Redis({ url: redisUrl, token: redisToken });
  console.log(`${COLOR.GREEN}✓${COLOR.RESET} Connected to Redis\n`);

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
  const now = Date.now();

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const progress = `[${(i + 1).toString().padStart(3)}/${videos.length}]`;
    const key = `${SONG_METADATA_PREFIX}${video.id}`;

    try {
      // Check if metadata already exists
      const existingRaw = await redis.get(key);
      let existingMetadata: SongMetadata | null = null;
      
      if (existingRaw) {
        try {
          existingMetadata = typeof existingRaw === "string"
            ? JSON.parse(existingRaw)
            : existingRaw as SongMetadata;
        } catch {
          // Ignore parse errors, will overwrite
        }
      }

      // Build metadata object
      const metadata: SongMetadata = {
        youtubeId: video.id,
        title: video.title,
        artist: video.artist || undefined,
        album: video.album || undefined,
        lyricOffset: video.lyricOffset ?? undefined,
        lyricsSearch: video.lyricsSearch || undefined,
        createdBy: existingMetadata?.createdBy || CREATED_BY_USERNAME,
        createdAt: existingMetadata?.createdAt || now,
        updatedAt: now,
      };

      // Save to Redis
      await redis.set(key, JSON.stringify(metadata));
      
      // Add to the set of all song IDs
      await redis.sadd(SONG_METADATA_SET, video.id);

      successCount++;
      if (existingMetadata) {
        updateCount++;
        console.log(`${COLOR.DIM}${progress}${COLOR.RESET} ${COLOR.BLUE}↻${COLOR.RESET} ${video.title} ${COLOR.DIM}(updated)${COLOR.RESET}`);
      } else {
        console.log(`${COLOR.DIM}${progress}${COLOR.RESET} ${COLOR.GREEN}+${COLOR.RESET} ${video.title}`);
      }
    } catch (error) {
      errorCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`${COLOR.DIM}${progress}${COLOR.RESET} ${COLOR.RED}✗${COLOR.RESET} ${video.title} ${COLOR.DIM}(${errorMsg})${COLOR.RESET}`);
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
    console.log(`\n${COLOR.GREEN}${COLOR.BOLD}Done!${COLOR.RESET} All ${successCount} songs have been seeded.\n`);
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
