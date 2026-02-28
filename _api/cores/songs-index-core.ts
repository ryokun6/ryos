import { z } from "zod";
import pako from "pako";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  listSongs,
  saveSong,
  canModifySong,
  getSong,
  deleteAllSongs,
  getSongMetaKey,
  getSongContentKey,
  SONG_SET_KEY,
  type SongMetadata,
  type SongContent,
  type GetSongOptions,
  type LyricsSource,
} from "../_utils/_song-service.js";
import { fetchCoverUrl } from "../songs/_kugou.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

const RATE_LIMITS = {
  list: { windowSeconds: 60, limit: 120 },
  create: { windowSeconds: 60, limit: 30 },
  import: { windowSeconds: 60, limit: 5 },
  delete: { windowSeconds: 60, limit: 5 },
};

const LyricsSourceSchema = z.object({
  hash: z.string(),
  albumId: z.union([z.string(), z.number()]),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
});

const CreateSongSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  lyricOffset: z.number().optional(),
  lyricsSource: LyricsSourceSchema.optional(),
});

const FuriganaSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

const LyricsContentSchema = z.object({
  lrc: z.string().optional(),
  krc: z.string().optional(),
  cover: z.string().optional(),
});

const compressedOrRaw = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.string().startsWith("gzip:"), schema]);

const BulkImportSchema = z.object({
  action: z.literal("import"),
  songs: z.array(
    z.object({
      id: z.string().min(1),
      url: z.string().optional(),
      title: z.string().min(1),
      artist: z.string().optional(),
      album: z.string().optional(),
      lyricOffset: z.number().optional(),
      lyricsSource: LyricsSourceSchema.optional(),
      lyricsSearch: z
        .object({
          query: z.string().optional(),
          selection: LyricsSourceSchema.optional(),
        })
        .optional(),
      lyrics: compressedOrRaw(LyricsContentSchema).optional(),
      translations: compressedOrRaw(z.record(z.string(), z.string())).optional(),
      furigana: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
      soramimi: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
      soramimiByLang: compressedOrRaw(
        z.record(z.string(), z.array(z.array(FuriganaSegmentSchema)))
      ).optional(),
      createdBy: z.string().optional(),
      createdAt: z.number().optional(),
      updatedAt: z.number().optional(),
      importOrder: z.number().optional(),
    })
  ),
});

function decompressFromBase64<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.startsWith("gzip:")) {
    return null;
  }

  try {
    const base64Data = value.slice(5);
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.ungzip(bytes);
    const text = new TextDecoder("utf-8").decode(decompressed);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function getFieldValue<T>(value: unknown): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const decompressed = decompressFromBase64<T>(value);
  if (decompressed !== null) {
    return decompressed;
  }
  return value as T;
}

interface SongsIndexCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
  clientIp: string;
}

function json(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): CoreResponse {
  return { status, body, headers };
}

function error(status: number, message: string): CoreResponse {
  return json(status, { error: message });
}

export async function executeSongsIndexCore(
  input: SongsIndexCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: "Unauthorized" };
  }

  const redis = createRedis();

  try {
    if (input.method === "GET") {
      const rlKey = RateLimit.makeKey(["rl", "song", "list", "ip", input.clientIp]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.list.windowSeconds,
        limit: RATE_LIMITS.list.limit,
      });

      if (!rlResult.allowed) {
        return json(
          429,
          {
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          },
          { "Retry-After": String(rlResult.resetSeconds) }
        );
      }

      const createdBy = input.query.createdBy as string | undefined;
      const idsParam = input.query.ids as string | undefined;
      const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
      const includeParam = (input.query.include as string) || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());

      const getOptions: GetSongOptions = {
        includeMetadata: includes.includes("metadata"),
        includeLyrics: includes.includes("lyrics"),
        includeTranslations: includes.includes("translations"),
        includeFurigana: includes.includes("furigana"),
        includeSoramimi: includes.includes("soramimi"),
      };

      const songs = await listSongs(redis, {
        createdBy,
        ids,
        getOptions,
      });

      return json(200, { songs });
    }

    if (input.method === "POST") {
      const authToken =
        input.authHeader && input.authHeader.startsWith("Bearer ")
          ? input.authHeader.slice(7)
          : null;
      const username = input.usernameHeader || null;

      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        return error(401, "Unauthorized - authentication required");
      }

      const body = (input.body || {}) as Record<string, unknown>;

      if (body?.action === "import") {
        if (username?.toLowerCase() !== "ryo") {
          return error(403, "Forbidden - admin access required for bulk import");
        }

        const rlKey = RateLimit.makeKey([
          "rl",
          "song",
          "import",
          "user",
          username || "unknown",
        ]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.import.windowSeconds,
          limit: RATE_LIMITS.import.limit,
        });

        if (!rlResult.allowed) {
          return json(
            429,
            {
              error: "rate_limit_exceeded",
              limit: rlResult.limit,
              retryAfter: rlResult.resetSeconds,
            },
            { "Retry-After": String(rlResult.resetSeconds) }
          );
        }

        const parsed = BulkImportSchema.safeParse(body);
        if (!parsed.success) {
          return json(400, {
            error: "Invalid request body",
            details: parsed.error.format(),
          });
        }

        const { songs } = parsed.data;
        const now = Date.now();
        const songIds = songs.map((s) => s.id);
        const existingSongs = await listSongs(redis, {
          ids: songIds,
          getOptions: { includeMetadata: true },
        });
        const existingMap = new Map(existingSongs.map((s) => [s.id, s]));

        const songDocs = await Promise.all(
          songs.map(async (songData, i) => {
            const existing = existingMap.get(songData.id);
            let lyricsSource: LyricsSource | undefined =
              songData.lyricsSource as LyricsSource | undefined;
            if (!lyricsSource && songData.lyricsSearch?.selection) {
              lyricsSource = songData.lyricsSearch.selection as LyricsSource;
            }

            const lyricsValue = getFieldValue<{ lrc?: string; krc?: string; cover?: string }>(
              songData.lyrics
            );
            const cover = lyricsValue?.cover || existing?.cover;

            const meta: SongMetadata = {
              id: songData.id,
              title: songData.title,
              artist: songData.artist,
              album: songData.album,
              cover,
              lyricOffset: songData.lyricOffset,
              lyricsSource,
              createdBy: songData.createdBy || existing?.createdBy,
              createdAt: songData.createdAt || existing?.createdAt || now - i,
              updatedAt: songData.updatedAt || now,
              importOrder: songData.importOrder ?? existing?.importOrder ?? i,
            };

            const content: SongContent = {};
            if (lyricsValue?.lrc) {
              content.lyrics = {
                lrc: lyricsValue.lrc,
                krc: lyricsValue.krc,
              };
            }

            const translationsValue = getFieldValue<Record<string, string>>(
              songData.translations
            );
            if (translationsValue && Object.keys(translationsValue).length > 0) {
              content.translations = translationsValue;
            }

            const furiganaValue = getFieldValue<
              Array<Array<{ text: string; reading?: string }>>
            >(songData.furigana);
            if (furiganaValue && furiganaValue.length > 0) {
              content.furigana = furiganaValue;
            }

            const soramimiValue = getFieldValue<
              Array<Array<{ text: string; reading?: string }>>
            >(songData.soramimi);
            if (soramimiValue && soramimiValue.length > 0) {
              content.soramimi = soramimiValue;
            }

            const soramimiByLangValue = getFieldValue<
              Record<string, Array<Array<{ text: string; reading?: string }>>>
            >(songData.soramimiByLang);
            if (soramimiByLangValue && Object.keys(soramimiByLangValue).length > 0) {
              content.soramimiByLang = soramimiByLangValue;
            }

            const hasContent = Object.keys(content).length > 0;

            return {
              meta,
              content: hasContent ? content : null,
              isUpdate: !!existing,
              needsCover: !meta.cover && !!lyricsSource,
            };
          })
        );

        const songsNeedingCovers = songDocs.filter((d) => d.needsCover && d.meta.lyricsSource);
        if (songsNeedingCovers.length > 0) {
          const COVER_FETCH_BATCH_SIZE = 10;
          for (let i = 0; i < songsNeedingCovers.length; i += COVER_FETCH_BATCH_SIZE) {
            const batch = songsNeedingCovers.slice(i, i + COVER_FETCH_BATCH_SIZE);
            const coverPromises = batch.map(async (doc) => {
              const source = doc.meta.lyricsSource!;
              try {
                const coverResult = await fetchCoverUrl(source.hash, source.albumId);
                if (coverResult) {
                  doc.meta.cover = coverResult;
                }
              } catch {
                // ignore cover fetch errors
              }
            });
            await Promise.all(coverPromises);
          }
        }

        const pipeline = redis.pipeline();
        for (const { meta, content } of songDocs) {
          pipeline.set(getSongMetaKey(meta.id), JSON.stringify(meta));
          pipeline.sadd(SONG_SET_KEY, meta.id);
          if (content) {
            pipeline.set(getSongContentKey(meta.id), JSON.stringify(content));
          }
        }
        await pipeline.exec();

        const contentCount = songDocs.filter((d) => d.content !== null).length;
        const imported = songDocs.filter((d) => !d.isUpdate).length;
        const updated = songDocs.filter((d) => d.isUpdate).length;

        return json(200, {
          success: true,
          imported,
          updated,
          withContent: contentCount,
          total: songs.length,
        });
      }

      const createRlKey = RateLimit.makeKey([
        "rl",
        "song",
        "create",
        "user",
        username || "unknown",
      ]);
      const createRlResult = await RateLimit.checkCounterLimit({
        key: createRlKey,
        windowSeconds: RATE_LIMITS.create.windowSeconds,
        limit: RATE_LIMITS.create.limit,
      });

      if (!createRlResult.allowed) {
        return json(
          429,
          {
            error: "rate_limit_exceeded",
            limit: createRlResult.limit,
            retryAfter: createRlResult.resetSeconds,
          },
          { "Retry-After": String(createRlResult.resetSeconds) }
        );
      }

      const parsed = CreateSongSchema.safeParse(body);
      if (!parsed.success) {
        return json(400, {
          error: "Invalid request body",
          details: parsed.error.format(),
        });
      }

      const songData = parsed.data;
      const existing = await getSong(redis, songData.id, { includeMetadata: true });
      const permission = canModifySong(existing, username);
      if (!permission.canModify) {
        if (existing) {
          return json(200, {
            success: true,
            id: songData.id,
            isUpdate: false,
            skipped: true,
            createdBy: existing.createdBy,
            message: "Song already exists, created by another user",
          });
        }
        return error(403, permission.reason || "Permission denied");
      }

      const song = await saveSong(
        redis,
        {
          id: songData.id,
          title: songData.title,
          artist: songData.artist,
          album: songData.album,
          lyricOffset: songData.lyricOffset,
          lyricsSource: songData.lyricsSource as LyricsSource | undefined,
          createdBy: existing?.createdBy || username || undefined,
        },
        { preserveLyrics: true, preserveTranslations: true, preserveFurigana: true }
      );

      return json(200, {
        success: true,
        id: song.id,
        isUpdate: !!existing,
        createdBy: song.createdBy,
      });
    }

    if (input.method === "DELETE") {
      const authToken =
        input.authHeader && input.authHeader.startsWith("Bearer ")
          ? input.authHeader.slice(7)
          : null;
      const username = input.usernameHeader || null;

      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        return error(401, "Unauthorized - authentication required");
      }
      if (username?.toLowerCase() !== "ryo") {
        return error(403, "Forbidden - admin access required");
      }

      const rlKey = RateLimit.makeKey([
        "rl",
        "song",
        "delete",
        "user",
        username || "unknown",
      ]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.delete.windowSeconds,
        limit: RATE_LIMITS.delete.limit,
      });

      if (!rlResult.allowed) {
        return json(
          429,
          {
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          },
          { "Retry-After": String(rlResult.resetSeconds) }
        );
      }

      const deletedCount = await deleteAllSongs(redis);
      return json(200, {
        success: true,
        deleted: deletedCount,
      });
    }

    return error(405, "Method not allowed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return error(500, message);
  }
}
