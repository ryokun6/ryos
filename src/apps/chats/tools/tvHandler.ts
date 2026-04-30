/**
 * TV Control Tool Handler
 *
 * Manages the TV app's channel lineup: lists channels, tunes in, creates and
 * deletes channels, and adds/removes videos within custom channels.
 *
 * Built-in channels can be hidden from the lineup and restored with TV reset;
 * only custom channels can have their video lists edited.
 */

import type { ToolContext } from "./types";
import i18n from "@/lib/i18n";
import { useAppStore } from "@/stores/useAppStore";
import { useTvStore, type CustomChannel } from "@/stores/useTvStore";
import {
  buildTvChannelLineup,
  DEFAULT_CHANNELS,
  type Channel,
} from "@/apps/tv/data/channels";
import type { Video } from "@/stores/useVideoStore";
import { isYouTubeUrl, parseYouTubeId } from "@/apps/tv/utils";
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
  /**
   * For 'createChannel': one-line theme/description. The server fans out
   * YouTube searches and AI-plans the channel — the AI must NOT pre-search
   * videos with searchSongs.
   */
  prompt?: string;
  /** For 'createChannel': optional name override (otherwise planner picks one). */
  name?: string;
  videoId?: string;
  url?: string;
  title?: string;
  artist?: string;
  removeVideoId?: string;
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

/**
 * Extract a YouTube video id from a raw id or URL. Delegates to the
 * shared `parseYouTubeId` helper which uses an exact-match host
 * allow-list (rejecting spoofed hosts like `evil-youtube.com`).
 */
const extractVideoId = (input: string): string | null => parseYouTubeId(input);

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
  const tvStore = useTvStore.getState();
  return buildTvChannelLineup(
    tvStore.customChannels,
    tvStore.hiddenDefaultChannelIds
  ).find((c) => c.id === channelId);
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
        const tvStoreList = useTvStore.getState();
        const lineup = buildTvChannelLineup(
          tvStoreList.customChannels,
          tvStoreList.hiddenDefaultChannelIds
        );
        const currentChannelId = tvStoreList.currentChannelId;
        const all: Array<{ ch: Channel; isCustom: boolean }> = lineup.map(
          (ch) => ({
            ch,
            isCustom: !DEFAULT_CHANNELS.some((d) => d.id === ch.id),
          })
        );

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
        const channels = buildTvChannelLineup(
          tvStore.customChannels,
          tvStore.hiddenDefaultChannelIds
        );

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
        const prompt = input.prompt?.trim();
        if (!prompt) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.missingPrompt", {
              defaultValue:
                "createChannel requires a 'prompt' (one-line theme/description). The server fans out YouTube searches automatically — do not pre-pick videos.",
            }),
          });
          return;
        }

        // Server fanout: /api/tv/create-channel runs the same AI plan +
        // YouTube fanout the manual TV "Create Channel" dialog uses, so
        // the AI doesn't need to call searchSongs first or ask the user
        // for a video list.
        let planned: {
          name: string;
          description: string;
          queries: string[];
          videos: Video[];
        };
        try {
          const response = await abortableFetch(
            getApiUrl("/api/tv/create-channel"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ description: prompt }),
              timeout: 60000,
              throwOnHttpError: false,
            }
          );

          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as {
              error?: string;
              scope?: string;
            };
            const isAuthRequired =
              response.status === 401 || response.status === 403;
            const isRateLimit = response.status === 429;
            // Surface auth errors with a distinct, actionable message so
            // the chat AI can suggest the user log in (and so the chat
            // UI's tool-error renderer can flag it differently from a
            // generic failure). Falls back to the generic failure text
            // for unknown statuses.
            const errorText = isAuthRequired
              ? i18n.t("apps.tv.create.signInRequired", {
                  defaultValue: "Sign in to create channels",
                })
              : isRateLimit
              ? i18n.t("apps.chats.toolCalls.tv.createRateLimited", {
                  defaultValue:
                    "Channel creation is rate-limited right now. Try again in a bit.",
                })
              : data?.error ||
                i18n.t("apps.chats.toolCalls.tv.createFailed", {
                  defaultValue: "Failed to plan channel",
                });
            context.addToolResult({
              tool: "tvControl",
              toolCallId,
              state: "output-error",
              errorText,
            });
            return;
          }

          const raw = (await response.json()) as {
            name?: string;
            description?: string;
            queries?: string[];
            videos?: Video[];
          };
          if (!raw?.videos?.length || !raw?.name) {
            context.addToolResult({
              tool: "tvControl",
              toolCallId,
              state: "output-error",
              errorText: i18n.t("apps.chats.toolCalls.tv.createNoVideos", {
                defaultValue:
                  "Couldn't find videos for that channel idea. Try a more specific prompt.",
              }),
            });
            return;
          }
          planned = {
            name: raw.name,
            description: raw.description ?? "",
            queries: raw.queries ?? [],
            videos: raw.videos,
          };
        } catch (err) {
          console.error("[tvControl] create-channel API failed:", err);
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText:
              err instanceof Error
                ? err.message
                : i18n.t("apps.chats.toolCalls.tv.createFailed", {
                    defaultValue: "Failed to plan channel",
                  }),
          });
          return;
        }

        // Drop any non-YouTube urls (defense in depth — server should already
        // only return YouTube videos but the user's data ends up in the store).
        const safeVideos = planned.videos.filter((v) => isYouTubeUrl(v.url));
        if (safeVideos.length === 0) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.createNoVideos", {
              defaultValue:
                "Couldn't find videos for that channel idea. Try a more specific prompt.",
            }),
          });
          return;
        }

        ensureTvAppOpen(context);
        const channelName = (input.name?.trim() || planned.name).slice(0, 24);
        const created = useTvStore.getState().addCustomChannel({
          name: channelName,
          description: planned.description || undefined,
          videos: safeVideos,
          prompt,
          queries: planned.queries,
        });

        const createdListed = buildTvChannelLineup(
          useTvStore.getState().customChannels,
          useTvStore.getState().hiddenDefaultChannelIds
        ).find((c) => c.id === created.id);
        if (!createdListed) {
          context.addToolResult({
            tool: "tvControl",
            toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.tv.createFailed", {
              defaultValue: "Failed to plan channel",
            }),
          });
          return;
        }

        const shortId = `ch${createdListed.number}`;
        const message = i18n.t("apps.chats.toolCalls.tv.createdChannelWithVideos", {
          defaultValue: "Created {{label}} ({{count}} videos)",
          label: formatChannelLabel(createdListed),
          count: safeVideos.length,
        });

        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: {
            success: true,
            message,
            channel: buildChannelToolRecord(
              createdListed,
              shortId,
              false,
              true,
              true
            ),
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
        const targetListed = findChannel(resolvedId);
        if (!targetListed) {
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
        useTvStore.getState().removeChannel(resolvedId);
        context.addToolResult({
          tool: "tvControl",
          toolCallId,
          output: {
            success: true,
            message: i18n.t("apps.chats.toolCalls.tv.deletedChannel", {
              defaultValue: "Deleted channel {{label}}",
              label: formatChannelLabel(targetListed),
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
