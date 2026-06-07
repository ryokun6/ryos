import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createTvChannelPlan,
  MediaApiRequestError,
} from "@/api/media";
import { useTvStore, type CustomChannel } from "@/stores/useTvStore";
import { getTextAnalytics, MEDIA_ANALYTICS, track } from "@/utils/analytics";

export interface CreateTvChannelResult {
  /** Created and persisted channel, ready to tune in. */
  channel: CustomChannel;
  /** Search queries the planner used (handy for re-runs / debugging). */
  queries: string[];
}

/**
 * Sentinel error thrown when the API returns 401 (or 403) on
 * the channel creation API. Callers should catch this and surface a
 * "log in to continue" prompt instead of treating it as a generic
 * failure. Subclassing Error keeps `instanceof` checks reliable
 * across the bundle without depending on string-matching message
 * text.
 */
export class TvChannelAuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TvChannelAuthRequiredError";
  }
}

/**
 * Owns the AI channel-create round-trip and store insertion. Shared by the
 * dialog, the inline prompt input, and the chat tvControl tool so they
 * can't drift in behavior.
 *
 * Auth handling: the API requires authentication. If the network call
 * comes back 401 / 403, we throw a TvChannelAuthRequiredError so callers
 * can show a "log in" toast instead of a generic create failure.
 */
export function useCreateTvChannel() {
  const { t } = useTranslation();
  const addCustomChannel = useTvStore((s) => s.addCustomChannel);
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(
    async (description: string): Promise<CreateTvChannelResult> => {
      const trimmed = description.trim();
      if (!trimmed) {
        throw new Error(t("apps.tv.create.errorEmpty"));
      }

      setIsCreating(true);
      try {
        const data = await createTvChannelPlan({ description: trimmed });
        if (!data?.videos?.length) {
          throw new Error(t("apps.tv.create.errorNoVideos"));
        }
        const channel = addCustomChannel({
          name: data.name,
          description: data.description,
          videos: data.videos,
          prompt: trimmed,
          queries: data.queries,
        });
        track(MEDIA_ANALYTICS.TV_CHANNEL_CREATE, {
          ...getTextAnalytics(trimmed),
          videoCount: data.videos.length,
          queryCount: data.queries?.length ?? 0,
          success: true,
        });

        return { channel, queries: data.queries ?? [] };
      } catch (error) {
        const normalizedError =
          error instanceof MediaApiRequestError
            ? error.status === 401 || error.status === 403
              ? new TvChannelAuthRequiredError(t("apps.tv.create.signInRequired"))
              : new Error(
                  error.status === 429
                    ? t("apps.tv.create.errorRateLimit")
                    : error.message || t("apps.tv.create.errorGeneric")
                )
            : error;
        track(MEDIA_ANALYTICS.TV_CHANNEL_CREATE, {
          ...getTextAnalytics(trimmed),
          success: false,
          errorType:
            normalizedError instanceof TvChannelAuthRequiredError
              ? "auth"
              : normalizedError instanceof Error
                ? normalizedError.name
                : "unknown",
        });
        throw normalizedError;
      } finally {
        setIsCreating(false);
      }
    },
    [addCustomChannel, t]
  );

  return { create, isCreating };
}
