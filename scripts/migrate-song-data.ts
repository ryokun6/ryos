#!/usr/bin/env bun
/**
 * Migrate song data from legacy format to unified format
 * 
 * Run with: bun run scripts/migrate-song-data.ts
 * 
 * This script migrates data from:
 * - song:metadata:{id} -> song:{id}
 * - lyrics:cache:{hash} -> embedded in song:{id}.lyrics
 * - lyrics:translations:{lang}:{hash} -> embedded in song:{id}.translations
 * - lyrics:furigana:{hash} -> embedded in song:{id}.furigana
 * 
 * Options:
 * --dry-run    Don't actually write to Redis, just show what would be done
 * --cleanup    Delete old keys after successful migration
 * --verbose    Show detailed progress
 */

import { Redis } from "@upstash/redis";

// ANSI color codes
const COLOR = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  MAGENTA: "\x1b[35m",
};

// Key prefixes
const LEGACY_SONG_METADATA_PREFIX = "song:metadata:";
const LEGACY_LYRICS_CACHE_PREFIX = "lyrics:cache:";
const LEGACY_TRANSLATION_PREFIX = "lyrics:translations:";
// const LEGACY_FURIGANA_PREFIX = "lyrics:furigana:"; // TODO: Migrate furigana data
const LEGACY_SONG_SET = "song:metadata:all";

const NEW_SONG_PREFIX = "song:";
const NEW_SONG_SET = "song:all";

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CLEANUP = args.includes("--cleanup");
const VERBOSE = args.includes("--verbose");

interface LegacySongMetadata {
  youtubeId?: string;
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
  importOrder?: number;
}

interface LegacyLyricsCache {
  title: string;
  artist: string;
  album?: string;
  lyrics: string;
  krcLyrics?: string;
  cover?: string;
}

interface NewSongDocument {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSource?: {
    hash: string;
    albumId: string | number;
    title: string;
    artist: string;
    album?: string;
  };
  lyrics?: {
    lrc: string;
    krc?: string;
    cover?: string;
  };
  translations?: Record<string, string>;
  furigana?: Array<Array<{ text: string; reading?: string }>>;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number;
}

// Initialize Redis client
function getRedisClient(): Redis | null {
  const url = process.env.REDIS_KV_REST_API_URL;
  const token = process.env.REDIS_KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

// Simple djb2 string hash for cache key generation
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// Build legacy lyrics cache key
function buildLyricsCacheKey(title: string, artist: string, songHash?: string): string {
  const normalized = [title.trim().toLowerCase(), artist.trim().toLowerCase()]
    .filter(Boolean)
    .join("|");
  const keySource = songHash ? `${normalized}|${songHash}` : normalized;
  const fingerprint = hashString(keySource);
  return `${LEGACY_LYRICS_CACHE_PREFIX}${fingerprint}`;
}

// Parse raw data
function parseData<T>(raw: unknown): T | null {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as T);
  } catch {
    return null;
  }
}

function log(message: string, level: "info" | "success" | "warn" | "error" | "verbose" = "info") {
  if (level === "verbose" && !VERBOSE) return;
  
  const prefix = {
    info: `${COLOR.CYAN}ℹ${COLOR.RESET}`,
    success: `${COLOR.GREEN}✓${COLOR.RESET}`,
    warn: `${COLOR.YELLOW}⚠${COLOR.RESET}`,
    error: `${COLOR.RED}✗${COLOR.RESET}`,
    verbose: `${COLOR.DIM}›${COLOR.RESET}`,
  }[level];
  
  console.log(`  ${prefix} ${message}`);
}

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  
  do {
    const [newCursor, batch] = await redis.scan(cursor, {
      match: pattern,
      count: 100,
    });
    cursor = parseInt(String(newCursor));
    keys.push(...batch);
  } while (cursor !== 0);
  
  return keys;
}

async function migrateData(redis: Redis): Promise<{ migrated: number; skipped: number; errors: number }> {
  const stats = { migrated: 0, skipped: 0, errors: 0 };
  const keysToDelete: string[] = [];

  // Step 1: Get all legacy song metadata
  log("Scanning for legacy song metadata...", "info");
  const metadataKeys = await scanKeys(redis, `${LEGACY_SONG_METADATA_PREFIX}*`);
  log(`Found ${metadataKeys.length} legacy song metadata entries`, "verbose");

  // Step 2: Process each song
  for (const metadataKey of metadataKeys) {
    const songId = metadataKey.replace(LEGACY_SONG_METADATA_PREFIX, "");
    
    // Skip special keys
    if (songId === "all") {
      continue;
    }

    log(`Processing song: ${songId}`, "verbose");

    try {
      // Check if already migrated
      const newKey = `${NEW_SONG_PREFIX}${songId}`;
      const existingNew = await redis.get(newKey);
      if (existingNew) {
        log(`Song ${songId} already migrated, skipping`, "verbose");
        stats.skipped++;
        continue;
      }

      // Get legacy metadata
      const metadataRaw = await redis.get(metadataKey);
      const metadata = parseData<LegacySongMetadata>(metadataRaw);
      
      if (!metadata) {
        log(`Failed to parse metadata for ${songId}`, "warn");
        stats.errors++;
        continue;
      }

      // Build new document
      const newDoc: NewSongDocument = {
        id: songId,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        lyricOffset: metadata.lyricOffset,
        lyricsSource: metadata.lyricsSearch?.selection,
        createdBy: metadata.createdBy,
        createdAt: metadata.createdAt || Date.now(),
        updatedAt: metadata.updatedAt || Date.now(),
        importOrder: metadata.importOrder,
      };

      // Try to find and migrate lyrics
      if (metadata.title) {
        const lyricsKey = buildLyricsCacheKey(
          metadata.title,
          metadata.artist || "",
          metadata.lyricsSearch?.selection?.hash
        );
        
        const lyricsRaw = await redis.get(lyricsKey);
        const lyrics = parseData<LegacyLyricsCache>(lyricsRaw);
        
        if (lyrics?.lyrics) {
          log(`  Found lyrics for ${songId}`, "verbose");
          newDoc.lyrics = {
            lrc: lyrics.lyrics,
            krc: lyrics.krcLyrics,
            cover: lyrics.cover,
          };
          keysToDelete.push(lyricsKey);
        }
      }

      // Try to find translations
      const translationPattern = `${LEGACY_TRANSLATION_PREFIX}*`;
      const translationKeys = await scanKeys(redis, translationPattern);
      
      // Note: Translation migration is complex because translation keys use content hashes
      // not song IDs. A full migration would need to:
      // 1. Parse lyrics to compute the hash
      // 2. Look up matching translation keys
      // 3. Migrate translations to the new song document
      // For now, translations will be regenerated on-demand via the new endpoint
      void translationKeys; // Acknowledge we're not migrating translations yet

      // Save new document
      if (DRY_RUN) {
        log(`Would migrate: ${songId} (${metadata.title})`, "info");
      } else {
        await redis.set(newKey, JSON.stringify(newDoc));
        await redis.sadd(NEW_SONG_SET, songId);
        log(`Migrated: ${songId} (${metadata.title})`, "success");
      }

      keysToDelete.push(metadataKey);
      stats.migrated++;
    } catch (error) {
      log(`Error migrating ${songId}: ${error}`, "error");
      stats.errors++;
    }
  }

  // Step 3: Cleanup old keys if requested
  if (CLEANUP && !DRY_RUN && keysToDelete.length > 0) {
    log(`\nCleaning up ${keysToDelete.length} old keys...`, "info");
    
    // Delete in batches
    const batchSize = 100;
    for (let i = 0; i < keysToDelete.length; i += batchSize) {
      const batch = keysToDelete.slice(i, i + batchSize);
      await redis.del(...batch);
      log(`Deleted ${Math.min(i + batchSize, keysToDelete.length)}/${keysToDelete.length} keys`, "verbose");
    }
    
    // Remove from old set
    if (metadataKeys.length > 0) {
      const songIds = metadataKeys
        .map(k => k.replace(LEGACY_SONG_METADATA_PREFIX, ""))
        .filter(id => id !== "all");
      if (songIds.length > 0) {
        await redis.srem(LEGACY_SONG_SET, ...songIds);
      }
    }
    
    log("Cleanup complete", "success");
  }

  return stats;
}

async function main(): Promise<void> {
  console.log(`\n${COLOR.CYAN}${COLOR.BOLD}Song Data Migration${COLOR.RESET}`);
  console.log(`${COLOR.DIM}Legacy format → Unified format${COLOR.RESET}`);
  
  if (DRY_RUN) {
    console.log(`${COLOR.YELLOW}${COLOR.BOLD}DRY RUN MODE${COLOR.RESET} - No changes will be made\n`);
  } else {
    console.log("");
  }

  // Initialize Redis
  const redis = getRedisClient();
  if (!redis) {
    console.error(`${COLOR.RED}${COLOR.BOLD}ERROR:${COLOR.RESET} Redis not configured!`);
    console.error("Make sure REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN are set.");
    process.exit(1);
  }

  log("Connected to Redis", "success");

  // Run migration
  const stats = await migrateData(redis);

  // Print summary
  console.log(`\n${COLOR.CYAN}${COLOR.BOLD}Summary${COLOR.RESET}`);
  console.log(`  ${COLOR.GREEN}Migrated:${COLOR.RESET} ${stats.migrated}`);
  console.log(`  ${COLOR.YELLOW}Skipped:${COLOR.RESET}  ${stats.skipped}`);
  console.log(`  ${COLOR.RED}Errors:${COLOR.RESET}   ${stats.errors}`);

  if (DRY_RUN) {
    console.log(`\n${COLOR.DIM}Run without --dry-run to apply changes${COLOR.RESET}`);
  }

  if (!CLEANUP && stats.migrated > 0) {
    console.log(`\n${COLOR.DIM}Run with --cleanup to delete old keys after migration${COLOR.RESET}`);
  }

  console.log("");
  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Migration script error:", error);
  process.exit(1);
});
