import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { useThemeStore } from "@/stores/useThemeStore";

type EmbedInitialData = {
  url?: string;
  title?: string;
};

export const EmbedAppComponent: React.FC<AppProps<EmbedInitialData>> = ({
  initialData,
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}) => {
  const [url, setUrl] = useState<string>(initialData?.url || "");
  const [current, setCurrent] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentTheme = useThemeStore((s) => s.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  useEffect(() => {
    if (isWindowOpen && inputRef.current && !initialData?.url) {
      inputRef.current.focus();
    }
  }, [isWindowOpen, initialData?.url]);

  useEffect(() => {
    if (initialData?.url) {
      navigate(initialData.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.url]);

  const normalize = (value: string) => {
    const v = value.trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/")) return v;
    return `https://${v}`;
  };

  const navigate = useCallback((value: string) => {
    const next = normalize(value);
    setCurrent(next);
    if (iframeRef.current) iframeRef.current.src = next || "about:blank";
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(url);
  };

  const title = useMemo(() => {
    try {
      if (current) return new URL(current.startsWith("http") ? current : `https://${current}`).hostname;
      if (url) return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    } catch {}
    return "Embed";
  }, [current, url]);

  const addressBar = (
    <form onSubmit={onSubmit} className="flex gap-2 p-2 border-b bg-gray-50">
      <input
        ref={inputRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter URL (e.g. example.com or https://example.com)"
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <button
        type="submit"
        className="px-3 py-1 text-sm rounded border bg-white hover:bg-gray-100"
      >
        Go
      </button>
    </form>
  );

  return (
    <>
      {/* Non-XP/98 themes render menu bar above the window */}
      {!isXpTheme && addressBar}
      <WindowFrame
        title={title}
        appId={"embed" as any}
        onClose={onClose}
        isForeground={isForeground}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        // XP/98 themes expect menuBar via prop on the WindowFrame
        menuBar={isXpTheme ? addressBar : undefined}
      >
        <div className="w-full h-full flex flex-col bg-white">
          {/* For mac-like themes, toolbar is outside; for XP/98 it’s in menuBar */}
          {false && addressBar}
          <div className="flex-1 min-h-0">
            <iframe
              ref={iframeRef}
              title={current || "Embed"}
              src={current || "about:blank"}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"
            />
          </div>
        </div>
      </WindowFrame>
    </>
  );
};
