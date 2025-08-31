import React, { useRef } from "react";
import type { AppProps } from "@/apps/base/types";
import { Button } from "@/components/ui/button";
import { WindowFrame } from "@/components/layout/WindowFrame";

export const DeloreanAppComponent: React.FC<AppProps<{}>> = ({
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}) => {
  const url = "https://delorean-79538617613.us-west1.run.app";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleReload = () => iframeRef.current?.contentWindow?.location.reload();
  const menuBar = (
    <div className="flex items-center px-2">
      <Button size="sm" variant="ghost" onClick={handleReload} title="Reload">
        ↻
      </Button>
    </div>
  );

  return (
    <WindowFrame
      title="auxOS – DeLorean"
      appId={"delorean" as any}
      onClose={onClose}
      isForeground={isForeground}
      skipInitialSound={skipInitialSound}
      instanceId={instanceId}
      menuBar={menuBar}
    >
      <div className="w-full h-full bg-white">
        <iframe
          src={url}
          title="auxOS - DeLorean"
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"
        />
      </div>
    </WindowFrame>
  );
};
