import React, { useEffect, useRef, useMemo, useState } from "react";
import type { AppProps, InternetExplorerInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ArrowLeft, ArrowRight, RefreshCw, ExternalLink } from "lucide-react";
import { DEFAULT_URL } from "@/stores/useInternetExplorerStore";

export const InternetExplorerBrowser: React.FC<
  AppProps<InternetExplorerInitialData>
> = ({ initialData, isWindowOpen, onClose, isForeground, skipInitialSound, instanceId }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Use shared default URL from the Internet Explorer store
  const initialUrl = initialData?.url || DEFAULT_URL;
  const [address, setAddress] = useState<string>(initialUrl);
  const [currentUrl, setCurrentUrl] = useState<string>(initialUrl);
  const [historyStack, setHistoryStack] = useState<string[]>(initialData?.url ? [initialData.url] : [initialUrl]);
  const [historyIndex, setHistoryIndex] = useState<number>(initialData?.url ? 0 : 0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If initialData provides a URL, navigate to it (this updates history properly).
    if (initialData?.url) navigate(initialData.url);
    if (isWindowOpen && inputRef.current) inputRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.url, isWindowOpen]);

  const normalize = (value: string) => {
    const v = value.trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/")) return v;
    return `https://${v}`;
  };

  const navigate = (raw: string) => {
    const url = normalize(raw);
    if (!url) return;
    setCurrentUrl(url);
    setAddress(url);
    setIsLoading(true);
    if (iframeRef.current) iframeRef.current.src = url;
    setHistoryStack((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(url);
      return next;
    });
    setHistoryIndex((i) => i + 1);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const url = historyStack[newIndex];
      setCurrentUrl(url);
      setAddress(url);
      if (iframeRef.current) iframeRef.current.src = url;
    }
  };

  const goForward = () => {
    if (historyIndex + 1 < historyStack.length) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const url = historyStack[newIndex];
      setCurrentUrl(url);
      setAddress(url);
      if (iframeRef.current) iframeRef.current.src = url;
    }
  };

  const refresh = () => {
    if (iframeRef.current && currentUrl) {
      setIsLoading(true);
      iframeRef.current.src = currentUrl;
    }
  };

  const onLoad = () => setIsLoading(false);

  const title = useMemo(() => {
    try {
      if (currentUrl) return new URL(currentUrl.startsWith("http") ? currentUrl : `https://${currentUrl}`).hostname;
      if (address) return new URL(address.startsWith("http") ? address : `https://${address}`).hostname;
    } catch {}
    return "Internet Explorer";
  }, [currentUrl, address]);

  const addressBar = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate(address);
      }}
      className="flex gap-2 p-2 border-b bg-gray-50 items-center"
    >
      <div className="flex items-center gap-1">
        <button type="button" onClick={goBack} className="px-2 py-1 rounded border bg-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button type="button" onClick={goForward} className="px-2 py-1 rounded border bg-white">
          <ArrowRight className="w-4 h-4" />
        </button>
        <button type="button" onClick={refresh} className="px-2 py-1 rounded border bg-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter URL (e.g. example.com or https://example.com)"
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2">
        <button type="submit" className="px-3 py-1 text-sm rounded border bg-white hover:bg-gray-100">
          Go
        </button>
        <a
          href={currentUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 rounded border bg-white"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </form>
  );

  return (
    <WindowFrame title={title} appId={"internet-explorer" as any} onClose={onClose} isForeground={isForeground} skipInitialSound={skipInitialSound} instanceId={instanceId} menuBar={addressBar}>
      <div className="w-full h-full flex flex-col bg-white">
        <div className="flex-1 min-h-0" aria-busy={isLoading}>
          <iframe
            ref={iframeRef}
            title={currentUrl || "Internet Explorer"}
            src={currentUrl || "about:blank"}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"
            onLoad={onLoad}
          />
        </div>
      </div>
    </WindowFrame>
  );
};

export default InternetExplorerBrowser;
