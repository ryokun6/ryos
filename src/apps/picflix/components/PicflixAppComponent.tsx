import React, { useRef, useState, useCallback } from "react";
import type { AppProps } from "@/apps/base/types";
import { Button } from "@/components/ui/button";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PicflixInitialData {
  url?: string;
}

export const PicflixAppComponent: React.FC<AppProps<PicflixInitialData>> = ({
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  initialData,
}) => {
  const defaultUrl = "https://picflix-79538617613.us-west1.run.app";
  const fallbackUrl = "https://github.com/auxe-os/auxOSv1"; // Fallback if main site is down
  const currentUrl = initialData?.url || defaultUrl;
  
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [url, setUrl] = useState(currentUrl);
  const [retryCount, setRetryCount] = useState(0);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const handleReload = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    
    // If we've tried multiple times and failed, try the fallback URL
    if (retryCount >= 2 && url === defaultUrl) {
      setUrl(fallbackUrl);
      setRetryCount(0);
    } else {
      setRetryCount(prev => prev + 1);
    }
    
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, [retryCount, url, defaultUrl, fallbackUrl]);
  
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);
  
  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);
  
  const openInNewTab = useCallback(() => {
    window.open(url, '_blank');
  }, [url]);
  
  const menuBar = (
    <div className="flex items-center px-2 gap-1">
      <Button 
        size="sm" 
        variant="ghost" 
        onClick={handleReload} 
        title="Reload"
        disabled={isLoading}
      >
        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
      </Button>
      <Button 
        size="sm" 
        variant="ghost" 
        onClick={openInNewTab} 
        title="Open in new tab"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
      <div className="flex-1 px-2 text-xs text-muted-foreground truncate">
        {url}
      </div>
    </div>
  );

  return (
    <WindowFrame
      title="PICFLIX"
      appId="picflix"
      onClose={onClose}
      isForeground={isForeground}
      skipInitialSound={skipInitialSound}
      instanceId={instanceId}
      menuBar={menuBar}
    >
      <div className="w-full h-full bg-white relative">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-500" />
              <span className="text-sm text-gray-600">Loading PICFLIX...</span>
            </div>
          </div>
        )}
        
        {/* Error overlay */}
        {hasError && !isLoading && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-4 p-6 text-center max-w-md">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to load PICFLIX
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {url === fallbackUrl 
                    ? "Unable to connect to the service. Please check your internet connection."
                    : "The PICFLIX website might be temporarily unavailable."
                  }
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleReload} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {url === defaultUrl ? "Try Again" : "Use Fallback"}
                  </Button>
                  {url === defaultUrl && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setUrl(fallbackUrl);
                        setRetryCount(0);
                        handleReload();
                      }}
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Use GitHub
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          src={url}
          title="PICFLIX"
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock allow-popups-to-escape-sandbox"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </WindowFrame>
  );
};

export default PicflixAppComponent;
