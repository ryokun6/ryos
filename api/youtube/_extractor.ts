/**
 * Shared yt-dlp + Redis-cache extraction layer used by `extract.ts`
 * (metadata) and `stream.ts` (byte proxy). File name starts with `_` so
 * the route discoverer skips it.
 */

import { spawn } from "node:child_process";
import type { Redis } from "../_utils/redis.js";

const CACHE_PREFIX = "yt:extract:";
/**
 * yt-dlp signed URLs typically expire ~6h. Cache slightly less so we always
 * hand out URLs the browser can still play, but the proxy endpoint also
 * refetches on its own when upstream returns 403/410.
 */
export const EXTRACT_CACHE_TTL_SECONDS = 60 * 60 * 5;

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Output produced by yt-dlp `-J` (single-video JSON dump). */
interface YtDlpFormat {
  format_id?: string;
  ext?: string;
  acodec?: string;
  vcodec?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  tbr?: number | null;
  abr?: number | null;
  vbr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  protocol?: string;
  url?: string;
  format_note?: string;
  language?: string | null;
  language_preference?: number | null;
  has_drm?: boolean | null;
  http_headers?: Record<string, string> | null;
}

interface YtDlpInfo {
  id?: string;
  title?: string;
  duration?: number | null;
  thumbnail?: string | null;
  thumbnails?: { url?: string; width?: number; height?: number }[];
  channel?: string;
  channel_id?: string;
  uploader?: string;
  webpage_url?: string;
  url?: string;
  ext?: string;
  formats?: YtDlpFormat[];
  is_live?: boolean | null;
  live_status?: string | null;
}

export interface ExtractedFormat {
  formatId: string;
  url: string;
  ext: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  bitrate: number | null;
  audioBitrate: number | null;
  videoBitrate: number | null;
  filesize: number | null;
  protocol: string | null;
  hasAudio: boolean;
  hasVideo: boolean;
  /** True iff this format is a single muxed file with both audio + video. */
  isProgressive: boolean;
  formatNote: string | null;
  language: string | null;
  /**
   * yt-dlp-recommended request headers (User-Agent, Accept, etc.). These
   * MUST be replayed by the byte proxy because YouTube sometimes ties the
   * signed URL to a specific User-Agent / Accept-Language pair.
   */
  httpHeaders: Record<string, string> | null;
}

export interface ExtractResponse {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  channel: string | null;
  webpageUrl: string | null;
  isLive: boolean;
  /** ISO timestamp this cached payload expires (matches Redis TTL). */
  expiresAt: string;
  best: ExtractedFormat | null;
  bestAudio: ExtractedFormat | null;
  formats: ExtractedFormat[];
}

export function ytDlpBinary(): string {
  return process.env.YT_DLP_PATH || "yt-dlp";
}

/**
 * Realistic Chrome desktop User-Agent. We pin a value rather than letting
 * the user's UA leak through because YouTube's signed URLs are sometimes
 * tied to whichever UA yt-dlp's `web` client used to extract them.
 */
export const PROXY_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Default request headers our byte proxy sends to googlevideo.com when no
 * `httpHeaders` survived the cache. Mirrors what yt-dlp's `web` client
 * itself sends; in particular the `Origin` / `Referer` are critical
 * because googlevideo.com blocks requests with mismatching referrers.
 *
 * See yt-dlp FAQ: "HTTP Error 403: Forbidden" / "Why am I getting an
 * error message saying 'YouTube made significant changes...'?"
 *  https://github.com/yt-dlp/yt-dlp/wiki/FAQ
 */
export function defaultProxyHeaders(): Record<string, string> {
  return {
    "User-Agent": PROXY_USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://www.youtube.com",
    Referer: "https://www.youtube.com/",
  };
}

/** Spawn yt-dlp and resolve the parsed `-J` JSON dump. */
export function runYtDlp(videoId: string): Promise<YtDlpInfo> {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      "-J",
      "--no-warnings",
      "--no-playlist",
      "--skip-download",
      "--no-check-certificates",
      // `web` first so the resulting URLs work with browser-style requests
      // (User-Agent matches the one we replay in the proxy). `android` /
      // `ios` provide a fallback for age-restricted or otherwise gated
      // videos that the web client refuses to extract.
      "--extractor-args",
      "youtube:player_client=web,android,ios",
      // Force the same UA we'll later send from the proxy so URL bindings
      // line up.
      "--user-agent",
      PROXY_USER_AGENT,
      url,
    ];

    let child;
    try {
      child = spawn(ytDlpBinary(), args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (err) {
      reject(err);
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finish = (err: Error | null, value?: YtDlpInfo) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else if (value) resolve(value);
      else reject(new Error("yt-dlp returned no data"));
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error("yt-dlp timed out"));
    }, 25_000);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      finish(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const stderrText = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        finish(
          new Error(
            `yt-dlp exited with code ${code}: ${stderrText.trim().slice(0, 500)}`
          )
        );
        return;
      }
      try {
        const json = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8"));
        finish(null, json as YtDlpInfo);
      } catch (parseErr) {
        finish(
          new Error(
            `Failed to parse yt-dlp JSON: ${(parseErr as Error).message}`
          )
        );
      }
    });
  });
}

function pickThumbnail(info: YtDlpInfo): string | null {
  if (info.thumbnail) return info.thumbnail;
  const candidates = (info.thumbnails || []).filter((t) => !!t.url);
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
  );
  return candidates[0].url ?? null;
}

function mimeFromFormat(format: YtDlpFormat): string | null {
  const ext = format.ext?.toLowerCase();
  if (!ext) return null;
  const hasVideo = !!format.vcodec && format.vcodec !== "none";
  const hasAudio = !!format.acodec && format.acodec !== "none";
  if (ext === "mp4" || ext === "m4v") {
    return hasVideo ? "video/mp4" : hasAudio ? "audio/mp4" : "video/mp4";
  }
  if (ext === "m4a") return "audio/mp4";
  if (ext === "webm") return hasVideo ? "video/webm" : "audio/webm";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg") return "audio/ogg";
  return null;
}

function normalizeFormat(format: YtDlpFormat): ExtractedFormat | null {
  if (!format.url || !format.format_id) return null;
  const acodec =
    format.acodec && format.acodec !== "none" ? format.acodec : null;
  const vcodec =
    format.vcodec && format.vcodec !== "none" ? format.vcodec : null;
  const hasAudio = !!acodec;
  const hasVideo = !!vcodec;
  const protocol = format.protocol || null;
  if (!protocol || !/^https?$/i.test(protocol)) return null;
  if (format.has_drm) return null;
  return {
    formatId: format.format_id,
    url: format.url,
    ext: (format.ext || "").toLowerCase(),
    mimeType: mimeFromFormat(format),
    width: format.width ?? null,
    height: format.height ?? null,
    fps: format.fps ?? null,
    vcodec,
    acodec,
    bitrate: format.tbr ?? null,
    audioBitrate: format.abr ?? null,
    videoBitrate: format.vbr ?? null,
    filesize: format.filesize ?? format.filesize_approx ?? null,
    protocol,
    hasAudio,
    hasVideo,
    isProgressive: hasAudio && hasVideo,
    formatNote: format.format_note ?? null,
    language: format.language ?? null,
    httpHeaders: format.http_headers ?? null,
  };
}

export function pickBestProgressive(
  formats: ExtractedFormat[]
): ExtractedFormat | null {
  const progressive = formats.filter((f) => f.isProgressive);
  if (progressive.length === 0) return null;
  progressive.sort((a, b) => {
    const aMp4 = a.ext === "mp4" ? 1 : 0;
    const bMp4 = b.ext === "mp4" ? 1 : 0;
    if (aMp4 !== bMp4) return bMp4 - aMp4;
    const aArea = (a.width ?? 0) * (a.height ?? 0);
    const bArea = (b.width ?? 0) * (b.height ?? 0);
    if (aArea !== bArea) return bArea - aArea;
    return (b.bitrate ?? 0) - (a.bitrate ?? 0);
  });
  return progressive[0];
}

export function pickBestAudio(
  formats: ExtractedFormat[]
): ExtractedFormat | null {
  const audio = formats.filter((f) => f.hasAudio && !f.hasVideo);
  if (audio.length === 0) return null;
  audio.sort((a, b) => {
    const aM4a = a.ext === "m4a" ? 1 : 0;
    const bM4a = b.ext === "m4a" ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return (
      (b.audioBitrate ?? b.bitrate ?? 0) - (a.audioBitrate ?? a.bitrate ?? 0)
    );
  });
  return audio[0];
}

/** Extract a YouTube video id from any of the supported URL shapes. */
export function parseVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0];
      return VIDEO_ID_RE.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      if (v && VIDEO_ID_RE.test(v)) return v;
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length >= 2 && /^(embed|v|shorts|live)$/i.test(segments[0])) {
        return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
      }
    }
  } catch {
    /* not a URL */
  }
  const match = trimmed.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

interface CacheEnv {
  redis: Redis;
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
}

/** Build the full payload from a yt-dlp info dict. */
export function buildExtractResponse(
  videoId: string,
  info: YtDlpInfo
): ExtractResponse {
  const allFormats = (info.formats || [])
    .map(normalizeFormat)
    .filter((f): f is ExtractedFormat => !!f);
  return {
    id: info.id || videoId,
    title: info.title || "",
    duration: typeof info.duration === "number" ? info.duration : null,
    thumbnail: pickThumbnail(info),
    channel: info.channel || info.uploader || null,
    webpageUrl: info.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
    isLive: !!info.is_live || info.live_status === "is_live",
    expiresAt: new Date(
      Date.now() + EXTRACT_CACHE_TTL_SECONDS * 1000
    ).toISOString(),
    best: pickBestProgressive(allFormats),
    bestAudio: pickBestAudio(allFormats),
    formats: allFormats,
  };
}

interface ResolveOptions {
  /** Skip the Redis cache and force a fresh yt-dlp invocation. */
  refresh?: boolean;
}

/**
 * Resolve the extraction response for `videoId`, using the Redis cache
 * when available. Concurrent callers for the same id share a single
 * yt-dlp invocation via `inflight` to avoid request stampedes.
 */
const inflight = new Map<string, Promise<ExtractResponse>>();

export async function resolveExtraction(
  videoId: string,
  env: CacheEnv,
  opts: ResolveOptions = {}
): Promise<{ payload: ExtractResponse; cache: "HIT" | "MISS" }> {
  const cacheKey = `${CACHE_PREFIX}${videoId}`;

  if (!opts.refresh) {
    try {
      const cached = (await env.redis.get(cacheKey)) as
        | string
        | ExtractResponse
        | null;
      if (cached) {
        const payload =
          typeof cached === "string"
            ? (JSON.parse(cached) as ExtractResponse)
            : cached;
        const expiresAtMs = Date.parse(payload.expiresAt);
        if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + 30_000) {
          return { payload, cache: "HIT" };
        }
      }
    } catch (err) {
      env.logger.warn("yt-extract cache read failed", { err: String(err) });
    }
  }

  const inflightKey = `${videoId}:${opts.refresh ? "fresh" : "normal"}`;
  let promise = inflight.get(inflightKey);
  if (!promise) {
    promise = (async () => {
      const info = await runYtDlp(videoId);
      const payload = buildExtractResponse(videoId, info);
      try {
        await env.redis.set(cacheKey, JSON.stringify(payload), {
          ex: EXTRACT_CACHE_TTL_SECONDS,
        });
      } catch (err) {
        env.logger.warn("yt-extract cache write failed", { err: String(err) });
      }
      return payload;
    })();
    inflight.set(inflightKey, promise);
    promise.finally(() => inflight.delete(inflightKey));
  }
  const payload = await promise;
  return { payload, cache: "MISS" };
}
