import { useCallback } from "react";

export function useTvWindowClose({
  instanceId,
  onClose,
  poweringOff,
  screenOff,
  stopStatic,
  playPowerOff,
  setPoweringOff,
}: {
  instanceId: string | undefined;
  onClose?: () => void;
  poweringOff: boolean;
  screenOff: boolean;
  stopStatic: () => void;
  playPowerOff: () => void | Promise<void>;
  setPoweringOff: (value: boolean) => void;
}) {
  const dispatchWindowClose = useCallback(() => {
    if (!instanceId) {
      onClose?.();
      return;
    }
    window.dispatchEvent(
      new CustomEvent(`closeWindow-${instanceId}`, {
        detail: { onComplete: onClose },
      })
    );
  }, [instanceId, onClose]);

  const handleInterceptedClose = useCallback(() => {
    if (poweringOff) return;
    if (screenOff) {
      stopStatic();
      dispatchWindowClose();
      return;
    }
    setPoweringOff(true);
    stopStatic();
    void playPowerOff();
  }, [
    poweringOff,
    screenOff,
    stopStatic,
    dispatchWindowClose,
    setPoweringOff,
    playPowerOff,
  ]);

  const handlePowerOffComplete = useCallback(() => {
    dispatchWindowClose();
  }, [dispatchWindowClose]);

  return {
    dispatchWindowClose,
    handleInterceptedClose,
    handlePowerOffComplete,
  };
}
