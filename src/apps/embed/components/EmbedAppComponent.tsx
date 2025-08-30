import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
// Theme is no longer read here; WindowFrame handles theme-specific layout

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
  // Address bar will be rendered inside WindowFrame for all themes

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
      <WindowFrame
        title={title}
        appId={"embed" as any}
        onClose={onClose}
        isForeground={isForeground}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        // Render the address bar inside the WindowFrame for all themes so the
        // embed search bar is integrated into the window chrome consistently.
        menuBar={addressBar}
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
