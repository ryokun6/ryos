/**
 * TV Control Tool Handler
 *
 * Manages the TV app's channel lineup: lists channels, tunes in, creates and
 * deletes custom channels, and adds/removes videos within custom channels.
 *
 * Built-in channels (RyoTV, MTV, 台視) are read-only — only custom channels
 * can be edited.
 */

import type { ToolContext } from "./types";
import i18n from "@/lib/i18n";
import { useAppStore } from "@/stores/useAppStore";
import { useTvStore, type CustomChannel } from "@/stores/useTvStore";
import { DEFAULT_CHANNELS, type Channel } from "@/apps/tv/data/channels";
import type { Video } from "@/stores/useVideoStore";
import { isYouTubeUrl } from "@/apps/tv/utils";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { createShortIdMap, resolveId, type ShortIdMap } from "./helpers";

export interface TvControlInput {
  action:
    | "list"
    | "tune"
    | "createChannel"
    | "deleteChannel"
    | "addVideo"
    | "removeVideo";
  channelId?: string;
  channelNumber?: number;
  name?: string;
  description?: string;
  videoId?: string;
  url?: string;
  title?: string;
  artist?: string;
  removeVideoId?: string;
  videos?: Array<
    | string
    | {
        videoId?: string;
        url?: string;
        title?: string;
        artist?: string;
      }
  >;
}

interface VideoEntryDescriptor {
  videoId?: string;
  url?: string;
  title?: string;
  artist?: string;
}

/** Module-level mapping so AI-friendly short ids returned by 'list' resolve back. */
let tvChannelIdMap: ShortIdMap | undefined;

const ensureTvAppOpen = (context: ToolContext): void => {
  const appStore = useAppStore.getState();
  const tvInstances = appStore.getInstancesByAppId("tv");
  if (!tvInstances.some((inst) => inst.isOpen)) {
    context.launchApp("tv");
  }
};

/** Extract a YouTube video id from a raw id or URL. Returns null if invalid. */
const extractVideoId = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (
      url.hostname.includes("youtube.com") ||
      url.hostname.includes("youtu.be")
    ) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      if (url.hostname === "youtu.be") {
        const id = url.pathname.slice(1).split("/")[0] ?? "";
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const m = url.pathname.match(
        /\/(?:embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/
      );
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Fetch a YouTube video's title and channel via oEmbed.
 * Falls back to the synthesized "Video ID" string and undefined artist on error.
 */
const fetchVideoMetadata = async (
  videoId: string
): Promise<{ title: string; artist?: string }> => {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      youtubeUrl
    )}&format=json`;
    const res = await abortableFetch(oembedUrl, {
      timeout: 12000,
      throwOnHttpError: false,
      credentials: "omit",
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    });
    if (res.ok) {
      const data = (await res.json()) as { title?: string; author_name?: string };
      const rawTitle = data.title || `Video ID: ${videoId}`;
      const authorName = data.author_name;

      // Best-effort AI title parse for cleaner title/artist split — if it
      // fails, we just keep the oEmbed values (still better than nothing).
      try {
        const parseRes = await abortableFetch(getApiUrl("/api/parse-title"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: rawTitle, author_name: authorName }),
          timeout: 10000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });
        if (parseRes.ok) {
          const parsed = (await parseRes.json()) as {
            title?: string;
            artist?: string;
          };
          return {
            title: parsed.title || rawTitle,
            artist: parsed.artist || authorName,
          };
        }
      } catch {
        // Ignore parse errors and keep oEmbed values.
      }

      return { title: rawTitle, artist: authorName };
    }
  } catch {
    // Network failure — fall through to default title.
  }
  return { title: `Video ID: ${videoId}` };
};

const toVideoToolRecord = (v: Video) => ({
  id: v.id,
  title: v.title,
  artist: v.artist,
  url: v.url,
});

const buildChannelToolRecord = (
  ch: Channel,
  shortId: string,
  isCurrent: boolean,
  isCustom: boolean,
  includeVideos: boolean
) => ({
  id: shortId,
  channelId: ch.id,
  number: ch.number,
  name: ch.name,
  description: ch.description,
  isCustom,
  isCurrent,
  videoCount: ch.videos.length,
  videos: includeVideos ? ch.videos.map(toVideoToolRecord) : undefined,
});

const normalizeVideoEntry = (
  entry: string | VideoEntryDescriptor
): VideoEntryDescriptor | null => {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed)
      ? { url: trimmed }
      : { videoId: trimmed };
  }
  if (!entry || typeof entry !== "object") return null;
  return entry;
};

const resolveVideoFromInput = async (
  entry: VideoEntryDescriptor
): Promise<{ video: Video } | { error: string }> => {
  const idCandidate =
    (entry.videoId && entry.videoId.trim()) ||
    (entry.url && entry.url.trim()) ||
    "";
  const videoId = idCandidate ? extractVideoId(idCandidate) : null;
  if (!videoId) {
    return {
      error: i18n.t("apps.chats.toolCalls.tv.invalidVideo", {
        defaultValue: "Invalid YouTube id or URL: {{id}}",
        id: idCandidate || "(empty)",
      }),
    };
  }

  let title = entry.title?.trim() || "";
  let artist = entry.artist?.trim() || undefined;
  if (!title) {
    const meta = await fetchVideoMetadata(videoId);
    title = meta.title;
    artist = artist ?? meta.artist;
  }

  const url = `https://youtu.be/${videoId}`;
  return {
    video: {
      id: videoId,
      url,
      title,
      artist,
    },
  };
};

const formatChannelLabel = (ch: { number: number; name: string }) =>
  `${String(ch.number).padStart(2, "0")} ${ch.name}`;

const findCustomChannel = (channelId: string): CustomChannel | undefined => {
  return useTvStore.getState().customChannels.find((c) => c.id === channelId);
};

const findChannel = (channelId: string): Channel | undefined => {
  return (
    DEFAULT_CHANNELS.find((c) => c.id === channelId) ??
    findCustomChannel(channelId)
  );
};

/** Resolve user-provided channelId — accepts short id from 'list' or full store id. */
const resolveChannelId = (raw: string): string => {
  return resolveId(raw, tvChannelIdMap);
};

/**
 * Handle the tvControl tool call.
 */
export const handleTvControl = async (
  input: TvControlInput,
  toolCallId: string,
  context: ToolContext
): Promise<void> => {
  const { action } = input;

  try {
    switch (action) {
      case "list": {
        const customChannels = useTvStore.getState().customChannels;
        const currentChannelId = useTvStore.getState().currentChannelId;
        const all: Array<{ ch: Channel; isCustom: boolean }> = [
          ...DEFAULT_CHANNELS.map((ch) => ({ ch, isCustom: false })),
          ...customChannels.map((ch) => ({ ch, isCustom: true })),
        ];

        // Build a fresh short-id mapping so subsequent actions can use the
        // shorter "ch1"/"ch2" ids returned in this list output.
        tvChannelIdMap = createShortIdMap(
          all.map(({ ch }) => ch.id),
          "ch"
        );

        const channels = all.map(({ ch, isCustom }) => {
          const shortId = tvChannelIdMap!.fullToShort.get(ch.id) ?? ch.id;
          return buildChannelToolRecord(
            ch,
            shortId,
            ch.id === currentChannelId,
            isCustom,
            // Inline videos for custom channels (small, useful) but skip for
            // built-ins to keep the payload tight — they pull from the iPod /
            // Videos library at runtime anyway.
            isCustom
          );
        });

        const message = i18n.t("apps.chats.toolCalls.tv.foundChannels", {
          defaultValue: "Found {{count}} channels",
          count: channels.length,
        });

        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: { success: true, message, channels },
        });
        return;
      }

      case "tune": {
        const tvStore = useTvStore.getState();
        const channels: Channel[] = [
          ...DEFAULT_CHANNELS,
          ...tvStore.customChannels,
        ];

        let target: Channel | undefined;
        if (input.channelNumber !== undefined) {
          target = channels.find((c) => c.number === input.channelNumber);
        } else if (input.channelId) {
          const resolvedId = resolveChannelId(input.channelId);
          target = findChannel(resolvedId);
        }

        if (!target) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.channelNotFound", {
              defaultValue: "Channel not found",
            }),
          });
          return;
        }

        ensureTvAppOpen(context);
        tvStore.setCurrentChannelId(target.id);
        tvStore.setIsPlaying(true);

        const isCustom = !DEFAULT_CHANNELS.some((c) => c.id === target!.id);
        const shortId =
          tvChannelIdMap?.fullToShort.get(target.id) ?? target.id;

        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: {
            success: true,
            message: i18n.t("apps.chats.toolCalls.tv.tunedTo", {
              defaultValue: "Tuned to {{label}}",
              label: formatChannelLabel(target),
            }),
            channel: buildChannelToolRecord(
              target,
              shortId,
              true,
              isCustom,
              false
            ),
          },
        });
        return;
      }

      case "createChannel": {
        const name = input.name?.trim();
        if (!name) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.missingName", {
              defaultValue: "Channel name is required",
            }),
          });
          return;
        }

        // Resolve seed videos in parallel (best-effort — bad ids are skipped).
        const seedDescriptors = (input.videos ?? [])
          .map(normalizeVideoEntry)
          .filter((d): d is VideoEntryDescriptor => Boolean(d));

        const resolved = await Promise.all(
          seedDescriptors.map((d) => resolveVideoFromInput(d))
        );

        const seedVideos: Video[] = [];
        const seenIds = new Set<string>();
        const skippedErrors: string[] = [];
        for (const r of resolved) {
          if ("video" in r) {
            if (
              isYouTubeUrl(r.video.url) &&
              !seenIds.has(r.video.id)
            ) {
              seenIds.add(r.video.id);
              seedVideos.push(r.video);
            }
          } else {
            skippedErrors.push(r.error);
          }
        }

        ensureTvAppOpen(context);
        const created = useTvStore.getState().addCustomChannel({
          name: name.slice(0, 24),
          description: input.description?.trim() || undefined,
          videos: seedVideos,
        });

        const shortId = `ch${created.number}`;
        let message = i18n.t("apps.chats.toolCalls.tv.createdChannel", {
          defaultValue: "Created channel {{label}}",
          label: formatChannelLabel(created),
        });
        if (seedVideos.length > 0) {
          message += ` (${seedVideos.length} video${seedVideos.length === 1 ? "" : "s"})`;
        }
        if (skippedErrors.length > 0) {
          message += `. ${i18n.t("apps.chats.toolCalls.tv.skippedSomeVideos", {
            defaultValue: "Skipped {{count}} invalid videos",
            count: skippedErrors.length,
          })}`;
        }

        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: {
            success: true,
            message,
            channel: buildChannelToolRecord(created, shortId, false, true, true),
          },
        });
        return;
      }

      case "deleteChannel": {
        if (!input.channelId) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.missingChannelId", {
              defaultValue: "channelId is required",
            }),
          });
          return;
        }
        const resolvedId = resolveChannelId(input.channelId);
        if (DEFAULT_CHANNELS.some((c) => c.id === resolvedId)) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.cannotDeleteBuiltin", {
              defaultValue: "Cannot delete built-in channels",
            }),
          });
          return;
        }
        const target = findCustomChannel(resolvedId);
        if (!target) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.channelNotFound", {
              defaultValue: "Channel not found",
            }),
          });
          return;
        }
        useTvStore.getState().removeCustomChannel(resolvedId);
        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: {
            success: true,
            message: i18n.t("apps.chats.toolCalls.tv.deletedChannel", {
              defaultValue: "Deleted channel {{label}}",
              label: formatChannelLabel(target),
            }),
          },
        });
        return;
      }

      case "addVideo": {
        if (!input.channelId) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.missingChannelId", {
              defaultValue: "channelId is required",
            }),
          });
          return;
        }
        const resolvedId = resolveChannelId(input.channelId);
        if (DEFAULT_CHANNELS.some((c) => c.id === resolvedId)) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.cannotEditBuiltin", {
              defaultValue:
                "Built-in channels are read-only. Create a custom channel instead.",
            }),
          });
          return;
        }
        const target = findCustomChannel(resolvedId);
        if (!target) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.channelNotFound", {
              defaultValue: "Channel not found",
            }),
          });
          return;
        }

        const resolvedVideo = await resolveVideoFromInput({
          videoId: input.videoId,
          url: input.url,
          title: input.title,
          artist: input.artist,
        });
        if ("error" in resolvedVideo) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: resolvedVideo.error,
          });
          return;
        }

        ensureTvAppOpen(context);
        const result = useTvStore
          .getState()
          .addVideoToCustomChannel(resolvedId, resolvedVideo.video);

        if (!result.added) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            output: {
              success: true,
              message: i18n.t("apps.chats.toolCalls.tv.videoAlreadyInChannel", {
                defaultValue: "{{title}} is already in {{channel}}",
                title: resolvedVideo.video.title,
                channel: target.name,
              }),
              video: toVideoToolRecord(resolvedVideo.video),
            },
          });
          return;
        }

        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: {
            success: true,
            message: i18n.t("apps.chats.toolCalls.tv.addedVideo", {
              defaultValue: "Added {{title}} to {{channel}}",
              title: resolvedVideo.video.title,
              channel: target.name,
            }),
            video: toVideoToolRecord(resolvedVideo.video),
          },
        });
        return;
      }

      case "removeVideo": {
        if (!input.channelId) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.missingChannelId", {
              defaultValue: "channelId is required",
            }),
          });
          return;
        }
        if (!input.removeVideoId) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.missingRemoveVideoId", {
              defaultValue: "removeVideoId is required",
            }),
          });
          return;
        }
        const resolvedId = resolveChannelId(input.channelId);
        if (DEFAULT_CHANNELS.some((c) => c.id === resolvedId)) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.cannotEditBuiltin", {
              defaultValue:
                "Built-in channels are read-only. Create a custom channel instead.",
            }),
          });
          return;
        }
        const target = findCustomChannel(resolvedId);
        if (!target) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.channelNotFound", {
              defaultValue: "Channel not found",
            }),
          });
          return;
        }

        const removeId = input.removeVideoId.trim();
        const existingVideo = target.videos.find((v) => v.id === removeId);
        const result = useTvStore
          .getState()
          .removeVideoFromCustomChannel(resolvedId, removeId);

        if (!result.removed) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.videoNotInChannel", {
              defaultValue: "Video not found in channel",
            }),
          });
          return;
        }

        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: {
            success: true,
            message: i18n.t("apps.chats.toolCalls.tv.removedVideo", {
              defaultValue: "Removed {{title}} from {{channel}}",
              title: existingVideo?.title || removeId,
              channel: target.name,
            }),
            video: existingVideo ? toVideoToolRecord(existingVideo) : null,
          },
        });
        return;
      }

      default:
        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.tv.invalidAction", {
            defaultValue: "Invalid action: {{action}}",
            action,
          }),
        });
    }
  } catch (error) {
    console.error("[tvControl] Error:", error);
    context.addToolResult({
      tool: "tvControl",
      toolCallId,
      state: "output-error",
      errorText:
        error instanceof Error
          ? error.message
          : i18n.t("apps.chats.toolCalls.unknownError"),
    });
  }
};
