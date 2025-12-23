import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Music, ExternalLink, Mic } from "lucide-react";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";

interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

interface LinkPreviewProps {
  url: string;
  className?: string;
}

export function LinkPreview({ url, className = "" }: LinkPreviewProps) {
  // Helper function to check if URL is YouTube, iPod, or Karaoke link
  const isYouTubeUrl = (url: string): boolean => {
    return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|\/ipod\/|\/karaoke\/)/.test(
      url
    );
  };

  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullWidthThumbnail, setIsFullWidthThumbnail] = useState(() => {
    // YouTube links should always start as full width
    return isYouTubeUrl(url);
  });
  const launchApp = useLaunchApp();
  const theme = useThemeStore((s) => s.current);

  // Force full width thumbnail in macOS theme
  const displayFullWidthThumbnail = theme === "macosx" || isFullWidthThumbnail;

  // Helper function to extract YouTube video ID
  const extractYouTubeVideoId = (url: string): string | null => {
    try {
      const validateId = (id: string | null) =>
        id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;

      // Handle /ipod/ links (any origin)
      if (url.includes("/ipod/")) {
        const match = url.match(/\/ipod\/([^&\n?#/]+)/);
        return validateId(match ? match[1] : null);
      }

      // Handle /karaoke/ links (any origin)
      if (url.includes("/karaoke/")) {
        const match = url.match(/\/karaoke\/([^&\n?#/]+)/);
        return validateId(match ? match[1] : null);
      }

      // Handle youtu.be links
      if (url.includes("youtu.be/")) {
        const match = url.match(/youtu\.be\/([^&\n?#]+)/);
        return validateId(match ? match[1] : null);
      }

      // Handle youtube.com links
      if (url.includes("youtube.com/")) {
        const urlObj = new URL(url);

        // Handle /watch?v= format
        if (urlObj.pathname === "/watch") {
          const videoId = urlObj.searchParams.get("v");
          return validateId(videoId);
        }

        // Handle /embed/ format
        if (urlObj.pathname.startsWith("/embed/")) {
          const match = urlObj.pathname.match(/\/embed\/([^&\n?#]+)/);
          return validateId(match ? match[1] : null);
        }
      }

      return null;
    } catch (error) {
      console.error("Error extracting YouTube video ID:", error);
      return null;
    }
  };

  // Helper function to get favicon URL
  const getFaviconUrl = (url: string): string => {
    try {
      // For /ipod/ links, use iPod app icon
      if (url.includes("/ipod/")) {
        return `/icons/macosx/ipod.png`;
      }
      // For /karaoke/ links, use Karaoke app icon
      if (url.includes("/karaoke/")) {
        return `/icons/macosx/karaoke.png`;
      }

      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return `https://www.google.com/s2/favicons?domain=example.com&sz=16`;
    }
  };

  // Handle adding to iPod
  const handleAddToIpod = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    try {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        launchApp("ipod", { initialData: { videoId } });
      } else {
        toast.error("Could not extract video ID from this YouTube URL");
        console.warn("Could not extract video ID from YouTube URL:", url);
      }
    } catch (error) {
      toast.error("Failed to open video in iPod app");
      console.error("Error launching iPod app:", error);
    }
  };

  // Handle opening in Karaoke app
  const handleOpenInKaraoke = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    try {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        launchApp("karaoke", { initialData: { videoId } });
      } else {
        toast.error("Could not extract video ID from this URL");
        console.warn("Could not extract video ID from URL:", url);
      }
    } catch (error) {
      toast.error("Failed to open video in Karaoke app");
      console.error("Error launching Karaoke app:", error);
    }
  };

  // Handle opening YouTube externally
  const handleOpenYouTube = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    // For iPod/Karaoke links, construct YouTube URL from video ID
    if (url.includes("/ipod/") || url.includes("/karaoke/")) {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        window.open(youtubeUrl, "_blank", "noopener,noreferrer");
        return;
      }
    }
    // For regular YouTube links, use original URL
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Handle opening link externally
  const handleOpenExternally = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setLoading(true);
        setError(null);

        // Handle /ipod/ or /karaoke/ links specially - use YouTube metadata
        if (url.includes("/ipod/") || url.includes("/karaoke/")) {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            // Fetch actual YouTube metadata for the video
            try {
              const youtubeResponse = await fetch(
                `/api/link-preview?url=${encodeURIComponent(
                  `https://www.youtube.com/watch?v=${videoId}`
                )}`
              );

              if (youtubeResponse.ok) {
                const youtubeData = await youtubeResponse.json();
                if (!youtubeData.error) {
                  setMetadata({
                    title: youtubeData.title,
                    description: youtubeData.description,
                    image:
                      youtubeData.image ||
                      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    siteName: "YouTube",
                    url: url,
                  });
                  setLoading(false);
                  return;
                }
              }
            } catch (youtubeError) {
              console.warn(
                "Failed to fetch YouTube metadata, using fallback:",
                youtubeError
              );
            }

            // Fallback to basic YouTube-style metadata
            setMetadata({
              title: `YouTube Video ${videoId}`,
              description: "Watch on YouTube",
              image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
              siteName: "YouTube",
              url: url,
            });
            setLoading(false);
            return;
          }
        }

        // Create a simple metadata extraction API endpoint
        const response = await fetch(
          `/api/link-preview?url=${encodeURIComponent(url)}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        setMetadata({
          title: data.title,
          description: data.description,
          image: data.image,
          siteName: data.siteName,
          url: url,
        });
      } catch (err) {
        console.error("Error fetching link metadata:", err);
        setError("Failed to load preview");
        // Set basic metadata with just the URL
        setMetadata({
          title: url,
          url: url,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [url]);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "h-[106px] w-full min-w-[280px] max-w-[420px]",
          "relative overflow-hidden",
          "border border-gray-200 rounded",
          "before:absolute before:inset-0",
          "before:bg-gradient-to-r before:from-gray-200 before:via-gray-100 before:to-gray-200",
          "before:animate-[shimmer_2s_linear_infinite]",
          "before:bg-[length:200%_100%]",
          className
        )}
      />
    );
  }

  if (error && !metadata) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-sm font-geneva-12 max-w-[420px] ${className}`}
        style={{ borderRadius: "3px" }}
      >
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-red-600">{error}</span>
      </motion.div>
    );
  }

  if (!metadata) {
    return null;
  }

  const handleClick = (e?: React.MouseEvent | React.TouchEvent) => {
    // Helper to detect if we're on a touch device
    const isTouchDevice = () => {
      return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    };

    // On mobile touch, navigate directly to external link
    if (e && "touches" in e && isTouchDevice()) {
      e.stopPropagation();
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (isYouTubeUrl(url)) {
      // For iPod links, main action is add to iPod
      if (url.includes("/ipod/")) {
        try {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            console.log(
              `[LinkPreview] Adding iPod link to iPod with videoId: ${videoId}`
            );
            launchApp("ipod", { initialData: { videoId } });
          } else {
            toast.error("Could not extract video ID from this iPod URL");
            console.warn("Could not extract video ID from iPod URL:", url);
          }
        } catch (error) {
          toast.error("Failed to open video in iPod app");
          console.error("Error launching iPod app:", error);
        }
      } else if (url.includes("/karaoke/")) {
        // For Karaoke links, main action is open in Karaoke
        try {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            console.log(
              `[LinkPreview] Adding Karaoke link to Karaoke with videoId: ${videoId}`
            );
            launchApp("karaoke", { initialData: { videoId } });
          } else {
            toast.error("Could not extract video ID from this Karaoke URL");
            console.warn("Could not extract video ID from Karaoke URL:", url);
          }
        } catch (error) {
          toast.error("Failed to open video in Karaoke app");
          console.error("Error launching Karaoke app:", error);
        }
      } else {
        // For regular YouTube links, launch Videos app
        try {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            console.log(
              `[LinkPreview] Launching Videos app with videoId: ${videoId}`
            );
            launchApp("videos", { initialData: { videoId } });
          } else {
            console.warn(
              "Could not extract video ID from YouTube URL, opening in browser:",
              url
            );
            window.open(url, "_blank", "noopener,noreferrer");
          }
        } catch (error) {
          console.error(
            "Error launching Videos app, opening in browser:",
            error
          );
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    } else {
      // For other links, launch Internet Explorer
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, "");
      const path = urlObj.pathname + urlObj.search;
      const cleanUrl = domain + path;

      launchApp("internet-explorer", {
        initialData: { url: cleanUrl, year: "current" },
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "link-preview-container relative overflow-hidden cursor-pointer font-geneva-12 group max-w-[420px]",
        theme === "macosx"
          ? "chat-bubble macosx-link-preview bg-gray-100 border-none shadow-none"
          : "bg-white border border-gray-200 rounded",
        className
      )}
      onClick={handleClick}
      onTouchStart={(e) => {
        // Prevent the parent message from handling this touch
        e.stopPropagation();
      }}
      data-link-preview
    >
      <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-5 transition-opacity z-10 pointer-events-none" />
      {displayFullWidthThumbnail && metadata.image ? (
        // Full width thumbnail layout with overlay
        <>
          <div
            className={cn(
              "relative aspect-video bg-gray-100 overflow-hidden",
              theme === "macosx" && "-mx-3 -mt-[6px] rounded-t-[14px]"
            )}
          >
            <img
              src={metadata.image}
              alt={metadata.title || "Link preview"}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide image if it fails to load
                e.currentTarget.style.display = "none";
              }}
            />

            {/* Overlay with favicon and title */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <div className="flex items-center gap-2">
                <img
                  src={getFaviconUrl(url)}
                  alt="Site favicon"
                  className="h-4 w-4 flex-shrink-0"
                  onError={(e) => {
                    // Fallback to a simple circle if favicon fails to load
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextElementSibling?.classList.remove(
                      "hidden"
                    );
                  }}
                />
                <div className="h-4 w-4 bg-gray-300 rounded-full flex-shrink-0 hidden"></div>
                {metadata.title && (
                  <h3 className="font-semibold text-white text-[10px] truncate">
                    {metadata.title}
                  </h3>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-2 pb-2">
            {isYouTubeUrl(url) ? (
              url.includes("/ipod/") ? (
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={handleAddToIpod}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      theme === "macosx"
                        ? "aqua-button secondary flex-1"
                        : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                    )}
                    title="Open in iPod"
                    data-link-preview
                  >
                    {theme !== "macosx" && <Music className="h-3 w-3" />}
                    <span>Open in iPod</span>
                  </button>
                  <button
                    onClick={handleOpenYouTube}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      theme === "macosx"
                        ? "aqua-button secondary flex-1"
                        : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                    )}
                    title="Open YouTube"
                    data-link-preview
                  >
                    {theme !== "macosx" && <ExternalLink className="h-3 w-3" />}
                    <span>Open YouTube</span>
                  </button>
                </div>
              ) : url.includes("/karaoke/") ? (
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={handleOpenInKaraoke}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      theme === "macosx"
                        ? "aqua-button secondary flex-1"
                        : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                    )}
                    title="Open in Karaoke"
                    data-link-preview
                  >
                    {theme !== "macosx" && <Mic className="h-3 w-3" />}
                    <span>Open in Karaoke</span>
                  </button>
                  <button
                    onClick={handleOpenYouTube}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      theme === "macosx"
                        ? "aqua-button secondary flex-1"
                        : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                    )}
                    title="Open YouTube"
                    data-link-preview
                  >
                    {theme !== "macosx" && <ExternalLink className="h-3 w-3" />}
                    <span>Open YouTube</span>
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={handleAddToIpod}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      theme === "macosx"
                        ? "aqua-button secondary flex-1"
                        : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                    )}
                    title="Add to iPod"
                    data-link-preview
                  >
                    {theme !== "macosx" && <Music className="h-3 w-3" />}
                    <span>Add to iPod</span>
                  </button>
                  <button
                    onClick={handleOpenYouTube}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      theme === "macosx"
                        ? "aqua-button secondary flex-1"
                        : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                    )}
                    title="Open YouTube"
                    data-link-preview
                  >
                    {theme !== "macosx" && <ExternalLink className="h-3 w-3" />}
                    <span>Open YouTube</span>
                  </button>
                </div>
              )
            ) : (
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={handleOpenExternally}
                  onTouchStart={(e) => e.stopPropagation()}
                  className={cn(
                    theme === "macosx"
                      ? "aqua-button secondary w-full"
                      : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors w-full"
                  )}
                  title="Open Externally"
                  data-link-preview
                >
                  {theme !== "macosx" && <ExternalLink className="h-3 w-3" />}
                  <span>Open Externally</span>
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        // Side-by-side layout for normal/square thumbnails
        <>
          <div className="flex">
            {metadata.image && (
              <div
                className={cn(
                  "w-18 h-18 bg-gray-100 relative overflow-hidden flex-shrink-0",
                  theme === "macosx" && "hidden"
                )}
              >
                <img
                  src={metadata.image}
                  alt={metadata.title || "Link preview"}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Hide image if it fails to load
                    e.currentTarget.style.display = "none";
                  }}
                  onLoad={(e) => {
                    // Determine if this should be full width
                    const img = e.currentTarget;
                    const aspectRatio = img.naturalWidth / img.naturalHeight;
                    const shouldBeFullWidth =
                      isYouTubeUrl(url) || aspectRatio > 1.5;

                    if (shouldBeFullWidth) {
                      setIsFullWidthThumbnail(true);
                    }
                  }}
                />
              </div>
            )}

            <div
              className={`flex-1 min-w-0 p-3 ${
                metadata.image ? "flex flex-col justify-center" : ""
              }`}
            >
              {metadata.title && (
                <h3
                  className="font-semibold text-gray-900 text-[10px]"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {metadata.title}
                </h3>
              )}

              {metadata.description && (
                <p
                  className={`text-[10px] text-gray-600 ${
                    metadata.image ? "" : "mb-2"
                  }`}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {metadata.description}
                </p>
              )}

              {!metadata.image && (
                <div className="flex items-center gap-2">
                  <img
                    src={getFaviconUrl(url)}
                    alt="Site favicon"
                    className="h-4 w-4 flex-shrink-0"
                    onError={(e) => {
                      // Fallback to a simple circle if favicon fails to load
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove(
                        "hidden"
                      );
                    }}
                  />
                  <div className="h-4 w-4 bg-gray-300 rounded-full flex-shrink-0 hidden"></div>
                  <p className="text-[10px] text-gray-500 truncate">
                    {metadata.siteName || new URL(url).hostname}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className={cn(
            "pb-2 border-t",
            theme === "macosx" 
              ? "border-gray-300" 
              : "border-gray-200"
          )}>
            <div className="px-2 pt-2">
              {isYouTubeUrl(url) ? (
                url.includes("/ipod/") ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddToIpod}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        theme === "macosx"
                          ? "aqua-button secondary flex-1"
                          : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                      )}
                      title="Open in iPod"
                      data-link-preview
                    >
                      {theme !== "macosx" && <Music className="h-3 w-3" />}
                      <span>Open in iPod</span>
                    </button>
                    <button
                      onClick={handleOpenYouTube}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        theme === "macosx"
                          ? "aqua-button secondary flex-1"
                          : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                      )}
                      title="Open YouTube"
                      data-link-preview
                    >
                      {theme !== "macosx" && (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      <span>Open YouTube</span>
                    </button>
                  </div>
                ) : url.includes("/karaoke/") ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleOpenInKaraoke}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        theme === "macosx"
                          ? "aqua-button secondary flex-1"
                          : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                      )}
                      title="Open in Karaoke"
                      data-link-preview
                    >
                      {theme !== "macosx" && <Mic className="h-3 w-3" />}
                      <span>Open in Karaoke</span>
                    </button>
                    <button
                      onClick={handleOpenYouTube}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        theme === "macosx"
                          ? "aqua-button secondary flex-1"
                          : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                      )}
                      title="Open YouTube"
                      data-link-preview
                    >
                      {theme !== "macosx" && (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      <span>Open YouTube</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddToIpod}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        theme === "macosx"
                          ? "aqua-button secondary flex-1"
                          : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                      )}
                      title="Add to iPod"
                      data-link-preview
                    >
                      {theme !== "macosx" && <Music className="h-3 w-3" />}
                      <span>Add to iPod</span>
                    </button>
                    <button
                      onClick={handleOpenYouTube}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        theme === "macosx"
                          ? "aqua-button secondary flex-1"
                          : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex-1"
                      )}
                      title="Open YouTube"
                      data-link-preview
                    >
                      {theme !== "macosx" && (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      <span>Open YouTube</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleOpenExternally}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      theme === "macosx"
                        ? "aqua-button secondary w-full"
                        : "flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors w-full"
                    )}
                    title="Open Externally"
                    data-link-preview
                  >
                    {theme !== "macosx" && <ExternalLink className="h-3 w-3" />}
                    <span>Open Externally</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

export default LinkPreview;
