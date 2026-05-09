import { spawn } from "node:child_process";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_PREFIX = "yt:extract:";
// yt-dlp-issued URLs typically expire ~6h. Cache for slightly less so we
// always hand out URLs the browser can still play.
const CACHE_TTL_SECONDS = 60 * 60 * 5;

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

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

/** Format we hand back to the client. */
interface ExtractedFormat {
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
}

interface ExtractResponse {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  channel: string | null;
  webpageUrl: string | null;
  isLive: boolean;
  /** ISO timestamp this cached payload expires (matches Redis TTL). */
  expiresAt: string;
  /** Best progressive (audio + video, single file) format playable directly via <video src=…>. */
  best: ExtractedFormat | null;
  /** Best audio-only format (m4a/webm). */
  bestAudio: ExtractedFormat | null;
  /** All candidate formats sorted by quality. */
  formats: ExtractedFormat[];
}

function ytDlpBinary(): string {
  return process.env.YT_DLP_PATH || "yt-dlp";
}

/**
 * Spawn yt-dlp and resolve the parsed JSON info dict. We pipe stdout straight
 * through since yt-dlp prints a single JSON object with `-J --no-playlist`.
 */
function runYtDlp(videoId: string): Promise<YtDlpInfo> {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      "-J",
      "--no-warnings",
      "--no-playlist",
      "--skip-download",
      // Don't hit the home page; reduces chance of geo-block detection.
      "--no-check-certificates",
      // Use the android client which is friendlier to URL extraction.
      "--extractor-args",
      "youtube:player_client=android,web",
      url,
    ];

    let child;
    try {
      child = spawn(ytDlpBinary(), args, {
        stdio: ["ignore", "pipe", "pipe"],
        // Inherit PATH from environment; let the OS resolve the binary.
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
      if (err) {
        reject(err);
      } else if (value) {
        resolve(value);
      } else {
        reject(new Error("yt-dlp returned no data"));
      }
    };

    // Hard cap so a stuck yt-dlp can't hang the request indefinitely.
    const timeoutMs = 25_000;
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error("yt-dlp timed out"));
    }, timeoutMs);

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
    (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
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
  const acodec = format.acodec && format.acodec !== "none" ? format.acodec : null;
  const vcodec = format.vcodec && format.vcodec !== "none" ? format.vcodec : null;
  const hasAudio = !!acodec;
  const hasVideo = !!vcodec;
  const protocol = format.protocol || null;
  // Skip formats the browser cannot play directly (HLS / DASH manifests, mhtml storyboards, etc.).
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
  };
}

function pickBestProgressive(formats: ExtractedFormat[]): ExtractedFormat | null {
  const progressive = formats.filter((f) => f.isProgressive);
  if (progressive.length === 0) return null;
  // Prefer mp4/avc1 (broadest browser support), then highest resolution, then highest bitrate.
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

function pickBestAudio(formats: ExtractedFormat[]): ExtractedFormat | null {
  const audio = formats.filter((f) => f.hasAudio && !f.hasVideo);
  if (audio.length === 0) return null;
  audio.sort((a, b) => {
    // Prefer m4a (AAC) for the broadest cross-browser support.
    const aM4a = a.ext === "m4a" ? 1 : 0;
    const bM4a = b.ext === "m4a" ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return (b.audioBitrate ?? b.bitrate ?? 0) - (a.audioBitrate ?? a.bitrate ?? 0);
  });
  return audio[0];
}

/** Extract a YouTube video id from any of the supported URL shapes. */
function parseVideoId(input: string): string | null {
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
      // /embed/<id>, /v/<id>, /shorts/<id>, /live/<id>
      if (segments.length >= 2 && /^(embed|v|shorts|live)$/i.test(segments[0])) {
        return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
      }
    }
  } catch {
    // not a URL; fall through
  }
  // Last-ditch: regex match anywhere in the string.
  const match = trimmed.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, redis, logger, startTime }) => {
    const idParam = (req.query.id as string | undefined) || undefined;
    const urlParam = (req.query.url as string | undefined) || undefined;
    const noCache = req.query.refresh === "1" || req.query.nocache === "1";

    const videoId = parseVideoId(idParam || urlParam || "");
    if (!videoId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Missing or invalid YouTube id/url" });
      return;
    }

    // Per-IP rate limiting: yt-dlp is expensive (subprocess + network).
    try {
      const ip = getClientIp(req);
      const burst = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "yt-extract", "burst", "ip", ip]),
        windowSeconds: 60,
        limit: 30,
      });
      if (!burst.allowed) {
        res.setHeader("Retry-After", String(burst.resetSeconds ?? 60));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
        return;
      }
      const daily = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "yt-extract", "daily", "ip", ip]),
        windowSeconds: 60 * 60 * 24,
        limit: 500,
      });
      if (!daily.allowed) {
        res.setHeader("Retry-After", String(daily.resetSeconds ?? 60 * 60 * 24));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: "rate_limit_exceeded", scope: "daily" });
        return;
      }
    } catch (err) {
      logger.error("Rate limit check failed (yt-extract)", err);
    }

    const cacheKey = `${CACHE_PREFIX}${videoId}`;
    if (!noCache) {
      try {
        const cached = (await redis.get(cacheKey)) as
          | string
          | ExtractResponse
          | null;
        if (cached) {
          const payload =
            typeof cached === "string"
              ? (JSON.parse(cached) as ExtractResponse)
              : cached;
          // Defensive: drop stale cache where the URLs may have already expired.
          const expiresAtMs = Date.parse(payload.expiresAt);
          if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + 30_000) {
            res.setHeader("X-Yt-Extract-Cache", "HIT");
            logger.response(200, Date.now() - startTime);
            res.status(200).json(payload);
            return;
          }
        }
      } catch (err) {
        logger.warn("yt-extract cache read failed", { err: String(err) });
      }
    }

    let info: YtDlpInfo;
    try {
      info = await runYtDlp(videoId);
    } catch (err) {
      const message = (err as Error).message || String(err);
      logger.error("yt-dlp failure", { videoId, message });
      const isMissingBin =
        /ENOENT|not found|spawn/i.test(message) &&
        /yt-dlp/i.test(message + " " + ytDlpBinary());
      const status = isMissingBin ? 503 : 502;
      logger.response(status, Date.now() - startTime);
      res.status(status).json({
        error: isMissingBin
          ? "yt-dlp binary not available on the server"
          : "Failed to extract YouTube video",
        detail: message.slice(0, 500),
      });
      return;
    }

    const allFormats = (info.formats || [])
      .map(normalizeFormat)
      .filter((f): f is ExtractedFormat => !!f);

    const best = pickBestProgressive(allFormats);
    const bestAudio = pickBestAudio(allFormats);

    const payload: ExtractResponse = {
      id: info.id || videoId,
      title: info.title || "",
      duration: typeof info.duration === "number" ? info.duration : null,
      thumbnail: pickThumbnail(info),
      channel: info.channel || info.uploader || null,
      webpageUrl: info.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
      isLive: !!info.is_live || info.live_status === "is_live",
      expiresAt: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
      best,
      bestAudio,
      formats: allFormats,
    };

    if (!best && !bestAudio) {
      logger.response(502, Date.now() - startTime);
      res.status(502).json({
        error: "No playable formats found",
        videoId,
      });
      return;
    }

    try {
      await redis.set(cacheKey, JSON.stringify(payload), {
        ex: CACHE_TTL_SECONDS,
      });
    } catch (err) {
      logger.warn("yt-extract cache write failed", { err: String(err) });
    }

    res.setHeader("X-Yt-Extract-Cache", "MISS");
    logger.response(200, Date.now() - startTime);
    res.status(200).json(payload);
  }
);
