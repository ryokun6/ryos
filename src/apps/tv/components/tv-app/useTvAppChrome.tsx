import { useMemo } from "react";
import type { TFunction } from "i18next";
import { getTranslatedAppName } from "@/utils/i18n";
import {
  getChannelLogo,
  getChannelLogoCorner,
  type Channel,
} from "../../data/channels";
import { TvChannelBug } from "../TvChannelBug";

export function useTvAppChrome({
  t,
  currentChannel,
  currentChannelId,
  screenOff,
  poweringOff,
}: {
  t: TFunction;
  currentChannel: Channel;
  currentChannelId: string;
  screenOff: boolean;
  poweringOff: boolean;
}) {
  const windowTitle = useMemo(() => {
    if (!currentChannel) return getTranslatedAppName("tv");
    return t("apps.tv.channelBadge", {
      number: String(currentChannel.number).padStart(2, "0"),
      name: currentChannel.name,
    });
  }, [currentChannel, t]);

  const channelBugOverlay = useMemo(() => {
    const src = getChannelLogo(currentChannelId);
    if (screenOff || poweringOff || !src) return null;
    return (
      <TvChannelBug
        key={currentChannelId}
        src={src}
        corner={getChannelLogoCorner(currentChannelId)}
      />
    );
  }, [currentChannelId, screenOff, poweringOff]);

  return { windowTitle, channelBugOverlay };
}
