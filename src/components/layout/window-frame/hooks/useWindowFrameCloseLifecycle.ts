import { useCallback, useEffect, useRef, useState } from "react";
import type { AppId } from "@/config/appIds";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";

type CloseLifecycleParams = {
  appId: AppId;
  instanceId?: string;
  title: string;
  interceptClose: boolean;
  skipInitialSound: boolean;
  onClose?: () => void;
  updateInstanceTitle: (instanceId: string, title: string) => void;
  minimizeInstance: (instanceId: string) => void;
  closeAppInstance: (instanceId: string) => void;
  isMinimized: boolean;
};

export function useWindowFrameCloseLifecycle({
  appId,
  instanceId,
  title,
  interceptClose,
  skipInitialSound,
  onClose,
  updateInstanceTitle,
  minimizeInstance,
  closeAppInstance,
  isMinimized,
}: CloseLifecycleParams) {
  const [isOpen, setIsOpen] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const exitAnimationRef = useRef<"close" | "minimize">("minimize");
  const closeViaEventRef = useRef(false);
  const isClosingRef = useRef(false);

  const { play: playWindowOpen } = useSound(Sounds.WINDOW_OPEN);
  const { play: playWindowClose } = useSound(Sounds.WINDOW_CLOSE);
  const { play: playZoomMinimize } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const { play: playZoomMaximize } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const vibrateClose = useVibration(50, 50);

  useEffect(() => {
    if (!skipInitialSound) {
      playWindowOpen();
    }
    const timer = setTimeout(() => setIsInitialMount(false), 200);
    return () => clearTimeout(timer);
  }, [playWindowOpen, skipInitialSound]);

  useEffect(() => {
    if (instanceId && title) {
      updateInstanceTitle(instanceId, title);
    }
  }, [instanceId, title, updateInstanceTitle]);

  const wasMinimizedRef = useRef(isMinimized);
  const shouldAnimateRestore = wasMinimizedRef.current && !isMinimized;

  useEffect(() => {
    if (wasMinimizedRef.current && !isMinimized) {
      playZoomMaximize();
    }
    wasMinimizedRef.current = isMinimized;
  }, [isMinimized, playZoomMaximize]);

  const handleClose = useCallback(() => {
    if (interceptClose) {
      onClose?.();
    } else {
      exitAnimationRef.current = "close";
      isClosingRef.current = true;
      vibrateClose();
      playWindowClose();
      setIsClosing(true);
    }
  }, [interceptClose, onClose, vibrateClose, playWindowClose]);

  const handleCloseAnimationComplete = useCallback(() => {
    if (isClosing) {
      setIsOpen(false);
      isClosingRef.current = false;
      exitAnimationRef.current = "minimize";
      closeViaEventRef.current = false;

      if (instanceId) {
        closeAppInstance(instanceId);
      } else {
        onClose?.();
      }
    }
  }, [isClosing, onClose, instanceId, closeAppInstance]);

  const handleMinimize = useCallback(() => {
    if (instanceId) {
      playZoomMinimize();
      minimizeInstance(instanceId);
    }
  }, [instanceId, playZoomMinimize, minimizeInstance]);

  const performClose = useCallback(() => {
    isClosingRef.current = true;
    vibrateClose();
    playWindowClose();
    setIsClosing(true);
  }, [vibrateClose, playWindowClose]);

  useEffect(() => {
    if (!interceptClose) return;

    const handlePerformClose = () => {
      performClose();
    };

    window.addEventListener(
      `closeWindow-${instanceId || appId}`,
      handlePerformClose as EventListener
    );

    return () => {
      window.removeEventListener(
        `closeWindow-${instanceId || appId}`,
        handlePerformClose as EventListener
      );
    };
  }, [instanceId, appId, performClose, interceptClose]);

  useEffect(() => {
    if (!instanceId) return;

    const handleCloseRequest = () => {
      closeViaEventRef.current = true;
      handleClose();
    };

    window.addEventListener(
      `requestCloseWindow-${instanceId}`,
      handleCloseRequest
    );

    return () => {
      window.removeEventListener(
        `requestCloseWindow-${instanceId}`,
        handleCloseRequest
      );
    };
  }, [instanceId, handleClose]);

  return {
    isOpen,
    isClosing,
    isInitialMount,
    isClosingRef,
    exitAnimationRef,
    shouldAnimateRestore,
    handleClose,
    handleCloseAnimationComplete,
    handleMinimize,
  };
}
