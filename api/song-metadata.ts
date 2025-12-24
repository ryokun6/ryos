/**
 * @deprecated This endpoint is deprecated. Use /api/song and /api/song/{id} instead.
 * The unified song endpoint consolidates metadata, lyrics, translations, and furigana.
 * This endpoint will be removed in a future version.
 */
import { Redis } from "@upstash/redis";
import { z } from "zod";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "./_utils/cors.js";
import { validateAuthToken } from "./_utils/auth-validate.js";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
};

// Deprecation warning - will be logged on first request
let deprecationLogged = false;
function logDeprecationWarning(requestId: string) {
  if (!deprecationLogged) {
    console.warn(`[${requestId}] DEPRECATION WARNING: /api/song-metadata is deprecated. Use /api/song and /api/song/{id} instead.`);
    deprecationLogged = true;
  }
}

// Song metadata cache key prefix
const SONG_METADATA_PREFIX = "song:metadata:";
// Set to track all song IDs for listing
const SONG_METADATA_SET = "song:metadata:all";

/**
 * Schema for lyrics search selection
 */
const LyricsSearchSelectionSchema = z.object({
  hash: z.string(),
  albumId: z.union([z.string(), z.number()]),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
});

/**
 * Schema for saving song metadata
 */
const SaveSongMetadataSchema = z.object({
  youtubeId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  lyricOffset: z.number().optional(),
  lyricsSearch: z.object({
    query: z.string().optional(),
    selection: LyricsSearchSelectionSchema.optional(),
  }).optional(),
  // Optional hashes for lyrics/translation content (for cache validation)
  lyricsHash: z.string().optional(),
  translationHash: z.string().optional(),
});

type SaveSongMetadataRequest = z.infer<typeof SaveSongMetadataSchema>;

/**
 * Schema for bulk import request (array of songs)
 */
const BulkImportSchema = z.object({
  songs: z.array(z.object({
    id: z.string().min(1),
    url: z.string().optional(),
    title: z.string().min(1),
    artist: z.string().optional(),
    album: z.string().optional(),
    lyricOffset: z.number().optional(),
    lyricsSearch: z.object({
      query: z.string().optional(),
      selection: LyricsSearchSelectionSchema.optional(),
    }).optional(),
  })),
});

/**
 * Stored song metadata structure
 */
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
  // Optional import order for stable sorting when createdAt is identical
  importOrder?: number;
}

/**
 * Main handler for song metadata API
 * 
 * GET /api/song-metadata?id=YOUTUBE_ID - Retrieve cached song metadata
 * GET /api/song-metadata?list=true - List all cached song metadata
 * GET /api/song-metadata?list=true&createdBy=ryo - List songs by specific user (for sync)
 * POST /api/song-metadata - Save song metadata to cache (requires auth)
 * DELETE /api/song-metadata?id=YOUTUBE_ID - Delete song metadata (requires auth, admin only)
 */
export default async function handler(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 10);
  logDeprecationWarning(requestId);
  const startTime = Date.now();
  
  console.log(`[${requestId}] ${req.method} ${req.url}`);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["GET", "POST", "DELETE", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    console.log(`[${requestId}] INFO: Method not allowed`, { method: req.method });
    return new Response("Method not allowed", { status: 405 });
  }

  // Create Redis client
  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });

  // Parse and validate origin
  let effectiveOrigin: string | null;
  try {
    effectiveOrigin = getEffectiveOrigin(req);
    if (!isAllowedOrigin(effectiveOrigin)) {
      return new Response("Unauthorized", { status: 403 });
    }
  } catch {
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    // GET: Retrieve song metadata by YouTube ID or list all
    if (req.method === "GET") {
      const url = new URL(req.url);
      const youtubeId = url.searchParams.get("id");
      const listAll = url.searchParams.get("list") === "true";

      // List all songs endpoint (for sync)
      if (listAll) {
        const createdByFilter = url.searchParams.get("createdBy");
        console.log(`[${requestId}] INFO: Listing all songs`, { createdByFilter: createdByFilter || "none" });
        
        // Get all song IDs from the set
        const songIds = await redis.smembers(SONG_METADATA_SET);
        
        if (!songIds || songIds.length === 0) {
          console.log(`[${requestId}] INFO: No songs found`, { duration: `${Date.now() - startTime}ms` });
          return new Response(
            JSON.stringify({ songs: [] }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": effectiveOrigin!,
              },
            }
          );
        }

        // Fetch all metadata in parallel
        const keys = songIds.map((id) => `${SONG_METADATA_PREFIX}${id}`);
        const metadataList = await redis.mget(...keys);

        const songs: SongMetadata[] = [];
        for (let i = 0; i < metadataList.length; i++) {
          const raw = metadataList[i];
          if (!raw) continue;
          
          try {
            const metadata = typeof raw === "string" ? JSON.parse(raw) : raw as SongMetadata;
            // Filter by createdBy if specified
            if (createdByFilter && metadata.createdBy !== createdByFilter) {
              continue;
            }
            songs.push(metadata);
          } catch {
            // Skip invalid entries
          }
        }

        // Sort by createdAt (most recently added first)
        // Use importOrder as secondary sort when createdAt is the same (lower order = appears first)
        songs.sort((a, b) => {
          const createdAtDiff = (b.createdAt || 0) - (a.createdAt || 0);
          if (createdAtDiff !== 0) return createdAtDiff;
          // When createdAt is the same, sort by importOrder (ascending)
          return (a.importOrder ?? Infinity) - (b.importOrder ?? Infinity);
        });

        console.log(`[${requestId}] INFO: Returning songs`, { count: songs.length, totalInDb: songIds.length, duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({ songs }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Single song lookup
      if (!youtubeId) {
        console.log(`[${requestId}] INFO: Missing id parameter`);
        return new Response(
          JSON.stringify({ error: "Missing id parameter" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      console.log(`[${requestId}] INFO: Looking up song`, { youtubeId });
      const key = `${SONG_METADATA_PREFIX}${youtubeId}`;
      const metadataRaw = await redis.get(key);

      if (!metadataRaw) {
        console.log(`[${requestId}] INFO: Song cache MISS`, { youtubeId, duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({ found: false }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Parse stored data
      let metadata: SongMetadata;
      try {
        metadata = typeof metadataRaw === "string"
          ? JSON.parse(metadataRaw)
          : metadataRaw as SongMetadata;
      } catch {
        console.log(`[${requestId}] INFO: Invalid cached data`, { youtubeId, duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({ found: false, error: "Invalid cached data" }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      console.log(`[${requestId}] INFO: Song cache HIT`, { youtubeId, title: metadata.title, duration: `${Date.now() - startTime}ms` });
      return new Response(
        JSON.stringify({ found: true, metadata }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        }
      );
    }

    // POST: Save song metadata (requires authentication)
    if (req.method === "POST") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action");

      // Extract authentication from headers
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      console.log(`[${requestId}] INFO: POST request`, { user: username || "anonymous", action: action || "save" });

      // Validate authentication
      const authResult = await validateAuthToken(redis, username, authToken);
      if (!authResult.valid) {
        console.log(`[${requestId}] INFO: Auth failed`, { user: username || "anonymous", duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({ error: "Unauthorized - authentication required" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Handle bulk import action (admin only)
      if (action === "import") {
        console.log(`[${requestId}] INFO: Bulk import requested`, { user: username });
        
        // Only admin (ryo) can bulk import songs
        if (username?.toLowerCase() !== "ryo") {
          console.log(`[${requestId}] INFO: Bulk import denied - admin required`, { user: username, duration: `${Date.now() - startTime}ms` });
          return new Response(
            JSON.stringify({ error: "Forbidden - admin access required" }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": effectiveOrigin!,
              },
            }
          );
        }

        // Parse and validate bulk import request
        let importBody: z.infer<typeof BulkImportSchema>;
        try {
          const rawBody = await req.json();
          const validation = BulkImportSchema.safeParse(rawBody);
          
          if (!validation.success) {
            return new Response(
              JSON.stringify({
                error: "Invalid request body",
                details: validation.error.format(),
              }),
              {
                status: 400,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": effectiveOrigin!,
                },
              }
            );
          }
          importBody = validation.data;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON in request body" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": effectiveOrigin!,
              },
            }
          );
        }

        const { songs } = importBody;
        const now = Date.now();
        let imported = 0;
        let updated = 0;
        const skipped = 0;

        console.log(`[${requestId}] INFO: Starting bulk import`, { songCount: songs.length });

        // Process songs in order, with sequential timestamps to maintain order
        // Songs at the beginning of the array are "oldest" (imported first)
        // This maintains top-to-bottom order in the library
        for (let i = 0; i < songs.length; i++) {
          const song = songs[i];
          const key = `${SONG_METADATA_PREFIX}${song.id}`;

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
          // Songs are ordered from top (index 0) to bottom (last index)
          // To sort "newest first", we assign higher timestamps to songs at the top
          // createdAt = now - i so first song (i=0) has highest timestamp
          const songCreatedAt = existingMetadata?.createdAt || (now - i);

          const metadata: SongMetadata = {
            youtubeId: song.id,
            title: song.title,
            artist: song.artist || undefined,
            album: song.album || undefined,
            lyricOffset: song.lyricOffset ?? undefined,
            lyricsSearch: song.lyricsSearch as SongMetadata["lyricsSearch"],
            // Preserve original creator, or set admin as creator for imports
            createdBy: existingMetadata?.createdBy || username || undefined,
            createdAt: songCreatedAt,
            updatedAt: now,
            // Store import order for stable sorting (lower = appears first)
            importOrder: existingMetadata?.importOrder ?? i,
          };

          // Save to Redis
          await redis.set(key, JSON.stringify(metadata));
          
          // Add to the set of all song IDs
          await redis.sadd(SONG_METADATA_SET, song.id);

          if (existingMetadata) {
            updated++;
          } else {
            imported++;
          }
        }

        console.log(`[${requestId}] INFO: Bulk import complete`, { imported, updated, skipped, total: songs.length, duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({
            success: true,
            imported,
            updated,
            skipped,
            total: songs.length,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Parse and validate request body (single song save)
      let body: SaveSongMetadataRequest;
      try {
        const rawBody = await req.json();
        const validation = SaveSongMetadataSchema.safeParse(rawBody);
        
        if (!validation.success) {
          return new Response(
            JSON.stringify({
              error: "Invalid request body",
              details: validation.error.format(),
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": effectiveOrigin!,
              },
            }
          );
        }
        body = validation.data;
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request body" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const { youtubeId, title, artist, album, lyricOffset, lyricsSearch, lyricsHash, translationHash } = body;
      const key = `${SONG_METADATA_PREFIX}${youtubeId}`;
      const now = Date.now();
      const isAdmin = username?.toLowerCase() === "ryo";

      console.log(`[${requestId}] INFO: Saving song`, { youtubeId, title, artist: artist || "unknown" });

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

      // Check if user can update this song:
      // - Admin (ryo) can update any song
      // - Original creator can update their own song
      // - Anyone can create a new song
      // - Non-creators cannot update songs created by others
      const isOwnSong = !existingMetadata?.createdBy || existingMetadata.createdBy === username;
      const canUpdate = isAdmin || isOwnSong || !existingMetadata;

      if (!canUpdate) {
        // Song exists and was created by someone else - don't update, but return success
        // This allows the share dialog to still work
        console.log(`[${requestId}] INFO: Skipped update - owned by another user`, { youtubeId, owner: existingMetadata?.createdBy, duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({
            success: true,
            youtubeId,
            isUpdate: false,
            skipped: true,
            createdBy: existingMetadata?.createdBy,
            message: "Song already exists, created by another user",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Build metadata object
      const metadata: SongMetadata = {
        youtubeId,
        title,
        artist: artist || undefined,
        album: album || undefined,
        lyricOffset: lyricOffset ?? undefined,
        lyricsSearch: lyricsSearch as SongMetadata["lyricsSearch"],
        lyricsHash: lyricsHash || undefined,
        translationHash: translationHash || undefined,
        // Preserve original creator, or set current user as creator
        createdBy: existingMetadata?.createdBy || username || undefined,
        createdAt: existingMetadata?.createdAt || now,
        updatedAt: now,
      };

      // Save to Redis (no expiration - songs are cached indefinitely)
      await redis.set(key, JSON.stringify(metadata));
      
      // Add to the set of all song IDs for listing
      await redis.sadd(SONG_METADATA_SET, youtubeId);

      console.log(`[${requestId}] INFO: Song ${existingMetadata ? "updated" : "created"}`, { youtubeId, createdBy: metadata.createdBy, duration: `${Date.now() - startTime}ms` });
      return new Response(
        JSON.stringify({
          success: true,
          youtubeId,
          isUpdate: !!existingMetadata,
          createdBy: metadata.createdBy,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        }
      );
    }

    // DELETE: Remove song metadata (requires authentication, admin only)
    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const youtubeId = url.searchParams.get("id");

      console.log(`[${requestId}] INFO: DELETE request`, { youtubeId: youtubeId || "none" });

      if (!youtubeId) {
        console.log(`[${requestId}] INFO: DELETE missing id parameter`);
        return new Response(
          JSON.stringify({ error: "Missing id parameter" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Extract authentication from headers
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuthToken(redis, username, authToken);
      if (!authResult.valid) {
        console.log(`[${requestId}] INFO: DELETE auth failed`, { user: username || "anonymous", duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({ error: "Unauthorized - authentication required" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Only admin (ryo) can delete songs
      if (username?.toLowerCase() !== "ryo") {
        console.log(`[${requestId}] INFO: DELETE denied - admin required`, { user: username, duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({ error: "Forbidden - admin access required" }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const key = `${SONG_METADATA_PREFIX}${youtubeId}`;

      // Check if song exists
      const existingRaw = await redis.get(key);
      if (!existingRaw) {
        console.log(`[${requestId}] INFO: DELETE song not found`, { youtubeId, duration: `${Date.now() - startTime}ms` });
        return new Response(
          JSON.stringify({ error: "Song not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      // Delete from Redis
      await redis.del(key);
      
      // Remove from the set of all song IDs
      await redis.srem(SONG_METADATA_SET, youtubeId);

      console.log(`[${requestId}] INFO: Song deleted`, { youtubeId, user: username, duration: `${Date.now() - startTime}ms` });
      return new Response(
        JSON.stringify({
          success: true,
          youtubeId,
          deleted: true,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        }
      );
    }

    // Should not reach here
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": effectiveOrigin!,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error(`[${requestId}] ERROR: song-metadata API error`, { error: errorMessage, duration: `${Date.now() - startTime}ms` });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": effectiveOrigin!,
        },
      }
    );
  }
}
