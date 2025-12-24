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
}

/**
 * Main handler for song metadata API
 * 
 * GET /api/song-metadata?id=YOUTUBE_ID - Retrieve cached song metadata
 * GET /api/song-metadata?list=true - List all cached song metadata (for sync)
 * POST /api/song-metadata - Save song metadata to cache (requires auth)
 */
export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["GET", "POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "GET" && req.method !== "POST") {
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
        // Get all song IDs from the set
        const songIds = await redis.smembers(SONG_METADATA_SET);
        
        if (!songIds || songIds.length === 0) {
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
            songs.push(metadata);
          } catch {
            // Skip invalid entries
          }
        }

        // Sort by updatedAt (most recent first)
        songs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

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

      const key = `${SONG_METADATA_PREFIX}${youtubeId}`;
      const metadataRaw = await redis.get(key);

      if (!metadataRaw) {
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
      // Extract authentication from headers
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");

      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuthToken(redis, username, authToken);
      if (!authResult.valid) {
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

      // Parse and validate request body
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
        youtubeId,
        title,
        artist: artist || undefined,
        album: album || undefined,
        lyricOffset: lyricOffset ?? undefined,
        lyricsSearch: lyricsSearch || undefined,
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

    // Should not reach here
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": effectiveOrigin!,
      },
    });
  } catch (error: unknown) {
    console.error("Error in song-metadata API:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";

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
