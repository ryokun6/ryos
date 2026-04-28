import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { useTvStore, type CustomChannel } from "@/stores/useTvStore";
import type { Video } from "@/stores/useVideoStore";

interface CreateChannelResponse {
  name: string;
  description: string;
  queries: string[];
  videos: Video[];
}

export interface CreateTvChannelResult {
  /** Created and persisted channel, ready to tune in. */
  channel: CustomChannel;
  /** Search queries the planner used (handy for re-runs / debugging). */
  queries: string[];
}

/**
 * Owns the AI channel-create round-trip and store insertion. Shared by the
 * dialog and the inline prompt input so they can't drift in behavior.
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
        const response = await abortableFetch(
          getApiUrl("/api/tv/create-channel"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: trimmed }),
            timeout: 45000,
            throwOnHttpError: false,
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const msg =
            response.status === 429
              ? t("apps.tv.create.errorRateLimit")
              : data?.error || t("apps.tv.create.errorGeneric");
          throw new Error(msg);
        }

        const data = (await response.json()) as CreateChannelResponse;
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

        return { channel, queries: data.queries ?? [] };
      } finally {
        setIsCreating(false);
      }
    },
    [addCustomChannel, t]
  );

  return { create, isCreating };
}
