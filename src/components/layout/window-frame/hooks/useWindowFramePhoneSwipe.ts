import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import type { AppId } from "@/config/appIds";

type PhoneSwipeParams = {
  appId: AppId;
  isPhone: boolean;
  isForeground: boolean;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
};

export function useWindowFramePhoneSwipe({
  appId,
  isPhone,
  isForeground,
  onNavigateNext,
  onNavigatePrevious,
}: PhoneSwipeParams) {
  const { play: playWindowMoveStop } = useSound(Sounds.WINDOW_MOVE_STOP);
  const vibrateSwap = useVibration(30, 50);

  return useSwipeNavigation({
    currentAppId: appId,
    isActive: isPhone && isForeground,
    onSwipeLeft: () => {
      playWindowMoveStop();
      vibrateSwap();
      onNavigateNext?.();
    },
    onSwipeRight: () => {
      playWindowMoveStop();
      vibrateSwap();
      onNavigatePrevious?.();
    },
    threshold: 100,
  });
}
