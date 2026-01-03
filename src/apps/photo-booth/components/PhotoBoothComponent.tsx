import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { PhotoBoothMenuBar } from "./PhotoBoothMenuBar";
import { AppProps } from "../../base/types";
import { Images, Timer, Circle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSound, Sounds } from "@/hooks/useSound";
import { Webcam } from "@/components/Webcam";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { usePhotoBoothStore } from "@/stores/usePhotoBoothStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { getTranslatedAppName } from "@/utils/i18n";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Aqua-style shine overlay for macOS X theme (dark glass style)
function AquaShineOverlay() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{
        top: "2px",
        height: "35%",
        width: "calc(100% - 16px)",
        borderRadius: "100px",
        background:
          "linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
        filter: "blur(0.5px)",
        zIndex: 2,
      }}
    />
  );
}

interface Effect {
  name: string;
  filter: string;
  translationKey: string;
}

interface PhotoReference {
  filename: string;
  path: string;
  timestamp: number;
}

// Add function to detect swipe gestures
function useSwipeDetection(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Minimum distance required for a swipe
  const MIN_SWIPE_DISTANCE = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;

    const distance = touchStartX.current - touchEndX.current;
    const isSwipe = Math.abs(distance) > MIN_SWIPE_DISTANCE;

    if (isSwipe) {
      if (distance > 0) {
        // Swipe left
        onSwipeLeft();
      } else {
        // Swipe right
        onSwipeRight();
      }
    }

    // Reset
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

export function PhotoBoothComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("photo-booth", helpItems);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [showPhotoStrip, setShowPhotoStrip] = useState(false);
  const [currentEffectsPage, setCurrentEffectsPage] = useState(0); // 0 = CSS filters, 1 = distortions
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);

  // Split effects into two categories with translations
  const cssFilters = useMemo<Effect[]>(
    () => [
      {
        name: "Rainbow",
        filter: "hue-rotate(180deg) saturate(200%)",
        translationKey: "rainbow",
      },
      {
        name: "Vibrant",
        filter: "saturate(200%) contrast(150%)",
        translationKey: "vibrant",
      },
      {
        name: "Cold Blue",
        filter: "hue-rotate(240deg) saturate(150%)",
        translationKey: "coldBlue",
      },
      {
        name: "High Contrast",
        filter: "contrast(200%) brightness(110%)",
        translationKey: "highContrast",
      },
      {
        name: "Normal",
        filter: "none",
        translationKey: "normal",
      },
      {
        name: "Vintage",
        filter: "sepia(80%) brightness(90%) contrast(120%)",
        translationKey: "vintage",
      },
      {
        name: "X-Ray",
        filter: "invert(100%) hue-rotate(180deg) hue-rotate(180deg)",
        translationKey: "xRay",
      },
      {
        name: "Neon",
        filter: "brightness(120%) contrast(120%) saturate(200%) hue-rotate(310deg)",
        translationKey: "neon",
      },
      {
        name: "Black & White",
        filter: "brightness(90%) hue-rotate(20deg) saturate(0%)",
        translationKey: "blackAndWhite",
      },
    ],
    []
  );

  const distortionFilters = useMemo<Effect[]>(
    () => [
      { name: "Bulge", filter: "bulge(-0.5)", translationKey: "bulge" },
      { name: "Stretch", filter: "stretch(1.0)", translationKey: "stretch" },
      { name: "Pinch", filter: "pinch(2.0)", translationKey: "pinch" },
      { name: "Twirl", filter: "twist(-8.0)", translationKey: "twirl" },
      { name: "Fish Eye", filter: "fisheye(1.5)", translationKey: "fishEye" },
      { name: "Squeeze", filter: "squeeze(1.0)", translationKey: "squeeze" },
      {
        name: "Kaleidoscope",
        filter: "kaleidoscope(0.5)",
        translationKey: "kaleidoscope",
      },
      { name: "Ripple", filter: "ripple(1.5)", translationKey: "ripple" },
      { name: "Glitch", filter: "glitch(2.0)", translationKey: "glitch" },
    ],
    []
  );

  // Combined array for compatibility with existing code
  const effects = useMemo<Effect[]>(
    () => [...cssFilters, ...distortionFilters],
    [cssFilters, distortionFilters]
  );

  const [selectedEffect, setSelectedEffect] = useState<Effect>(
    effects.find((effect) => effect.translationKey === "normal") || effects[0]
  );
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    []
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const { photos, addPhoto, addPhotos, clearPhotos } = usePhotoBoothStore();
  const [isMultiPhotoMode, setIsMultiPhotoMode] = useState(false);
  const [multiPhotoCount, setMultiPhotoCount] = useState(0);
  const multiPhotoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [currentPhotoBatch, setCurrentPhotoBatch] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const { play: playShutter } = useSound(Sounds.PHOTO_SHUTTER, 0.4);
  const [newPhotoIndex, setNewPhotoIndex] = useState<number | null>(null);
  const { saveFile, files } = useFileSystem("/Images");

  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestTokenRef = useRef<symbol | null>(null);
  const isMountedRef = useRef(true);
  const isWindowOpenRef = useRef(isWindowOpen);
  const isForegroundRef = useRef(isForeground);
  const activeCameraIdRef = useRef<string | null>(null);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const handleClearPhotos = () => {
    clearPhotos();
    setCurrentPhotoBatch([]);
  };

  const handleExportPhotos = async () => {
    if (photos.length === 0) {
      console.log("No photos to export");
      return;
    }

    // If there's only one photo, download it directly
    if (photos.length === 1) {
      const link = document.createElement("a");
      link.href = photos[0].path;
      link.download = photos[0].filename || `photo-booth-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // For multiple photos, download each one
    for (let i = 0; i < photos.length; i++) {
      const link = document.createElement("a");
      link.href = photos[i].path;
      link.download = photos[i].filename || `photo-booth-${Date.now()}-${i + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Small delay between downloads to prevent browser issues
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  // Add a small delay before showing photo strip to prevent flickering
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  useEffect(() => {
    if (showPhotoStrip && isInitialLoad) {
      // Let the component fully mount before showing photostrip
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showPhotoStrip, isInitialLoad]);

    useEffect(() => {
      isWindowOpenRef.current = isWindowOpen;
    }, [isWindowOpen]);

    useEffect(() => {
      isForegroundRef.current = isForeground;
    }, [isForeground]);

    const stopCamera = useCallback(
      (options?: { skipState?: boolean }) => {
        const skipState = options?.skipState ?? false;

        cameraRequestTokenRef.current = null;

        const currentStream = streamRef.current;
        if (currentStream) {
          currentStream.getTracks().forEach((track) => track.stop());
        }
        streamRef.current = null;
        activeCameraIdRef.current = null;

        if (multiPhotoTimerRef.current) {
          clearInterval(multiPhotoTimerRef.current);
          multiPhotoTimerRef.current = null;
        }

        if (!skipState && isMountedRef.current) {
          setStream(null);
          setIsLoadingCamera(false);
        }
      },
      []
    );

    const startCamera = useCallback(async () => {
      if (!isMountedRef.current) return;

      const shouldActivate =
        isWindowOpenRef.current && isForegroundRef.current;
      if (!shouldActivate) return;

      const currentStream = streamRef.current;
      const hasActiveTracks =
        currentStream &&
        currentStream.active &&
        currentStream
          .getTracks()
          .some((track) => track.readyState === "live");

      const isSameDevice =
        !selectedCameraId ||
        activeCameraIdRef.current === selectedCameraId;

      if (hasActiveTracks && isSameDevice) {
        return;
      }

      if (currentStream) {
        stopCamera();
      }

      const requestToken = Symbol("camera-request");
      cameraRequestTokenRef.current = requestToken;

      if (isMountedRef.current) {
        setCameraError(null);
        setIsLoadingCamera(true);
      }

      try {
        console.log("Environment:", {
          protocol: window.location.protocol,
          isSecure: window.isSecureContext,
          hostname: window.location.hostname,
          userAgent: navigator.userAgent,
        });

        if (!window.isSecureContext) {
          throw new DOMException(
            "Camera requires a secure context (HTTPS)",
            "SecurityError"
          );
        }

        if (!navigator.mediaDevices) {
          console.error("mediaDevices API not available");
          throw new Error(t("apps.photo-booth.errors.cameraApiNotAvailable"));
        }

        const constraints = {
          video: {
            deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        } as const;

        console.log("Requesting camera access with constraints:", constraints);
        const mediaStream = await navigator.mediaDevices.getUserMedia(
          constraints
        );
        console.log(
          "Camera access granted:",
          mediaStream.active,
          "Video tracks:",
          mediaStream.getVideoTracks().length
        );

        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          console.log("Video track:", videoTrack.label);

          try {
            const settings = videoTrack.getSettings();
            console.log("Track settings:", settings);
            activeCameraIdRef.current =
              settings.deviceId ?? selectedCameraId ?? null;
          } catch (e) {
            console.warn("Couldn't read track settings:", e);
            activeCameraIdRef.current = selectedCameraId;
          }
        } else {
          activeCameraIdRef.current = selectedCameraId;
        }

        const shouldKeepStream =
          cameraRequestTokenRef.current === requestToken &&
          isWindowOpenRef.current &&
          isForegroundRef.current &&
          isMountedRef.current;

        if (!shouldKeepStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;

        if (isMountedRef.current) {
          setStream(mediaStream);
        }
      } catch (error) {
        if (cameraRequestTokenRef.current !== requestToken) {
          return;
        }

        console.error("Camera error:", error);
        let errorMessage = t("apps.photo-booth.errors.couldNotAccessCamera");

        if (error instanceof DOMException) {
          console.log("DOMException type:", error.name);
          if (error.name === "NotAllowedError") {
            errorMessage = t("apps.photo-booth.errors.cameraPermissionDenied");
          } else if (error.name === "NotFoundError") {
            errorMessage = t("apps.photo-booth.errors.noCameraFound");
          } else if (error.name === "SecurityError") {
            errorMessage = t("apps.photo-booth.errors.cameraRequiresHttps");
          } else {
            errorMessage = t("apps.photo-booth.errors.cameraError", {
              error: error.name,
            });
          }
        } else if (error instanceof Error && error.message) {
          errorMessage = error.message;
        }

        if (isMountedRef.current) {
          setCameraError(errorMessage);
        }
      } finally {
        if (cameraRequestTokenRef.current === requestToken) {
          cameraRequestTokenRef.current = null;
          if (isMountedRef.current) {
            setIsLoadingCamera(false);
          }
        }
      }
    }, [selectedCameraId, stopCamera]);

    useEffect(() => {
      if (isWindowOpen && isForeground) {
        startCamera();
      } else {
        stopCamera();
      }
    }, [isWindowOpen, isForeground, startCamera, stopCamera]);

    useEffect(() => {
      // Explicitly set to true on mount to handle lazy loading scenarios
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        stopCamera({ skipState: true });
      };
    }, [stopCamera]);

    const handleCameraSelect = useCallback(
      async (deviceId: string) => {
        console.log("Switching to camera:", deviceId);
        setSelectedCameraId(deviceId);
        await startCamera();
      },
      [startCamera]
    );

    // Component render with menu bar
    const menuBar = (
      <PhotoBoothMenuBar
        onClose={onClose}
        onShowHelp={() => setShowHelp(true)}
        onShowAbout={() => setShowAbout(true)}
        onClearPhotos={handleClearPhotos}
        onExportPhotos={handleExportPhotos}
        effects={effects}
        selectedEffect={selectedEffect}
        onEffectSelect={setSelectedEffect}
        availableCameras={availableCameras}
        selectedCameraId={selectedCameraId}
        onCameraSelect={handleCameraSelect}
      />
    );

  // Detect iOS devices which need special handling
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // Detect Chrome
  const isChrome =
    /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent);

  useEffect(() => {
    // Print device info on mount
    console.log("Device info:", {
      userAgent: navigator.userAgent,
      isIOS,
      isChrome,
      isSecureContext: window.isSecureContext,
    });
  }, []);

  // Force visibility refresh for Chrome
  useEffect(() => {
    if (!isChrome || !videoRef.current || !stream) return;

    console.log("Applying Chrome-specific visibility fixes");

    // Force visibility in Chrome by cycling CSS properties
    const forceVisibility = () => {
      if (!videoRef.current) return;

      // Force visibility by manipulating CSS properties
      videoRef.current.style.visibility = "hidden";
      videoRef.current.style.display = "none";

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.style.visibility = "visible";
          videoRef.current.style.display = "block";

          // Some Chrome versions need this nudge
          videoRef.current.style.opacity = "0.99";
          setTimeout(() => {
            if (videoRef.current) videoRef.current.style.opacity = "1";
          }, 50);
        }
      }, 50);
    };

    // Apply fix after a delay to let rendering settle
    setTimeout(forceVisibility, 300);
    setTimeout(forceVisibility, 1000);
  }, [stream, isChrome]);

  // Add event listener for the video element to handle Safari initialization
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !stream) return;

    // Track if video is actually playing
    let isPlaying = false;

    const handleCanPlay = () => {
      console.log("Video can play now");

      // iOS Safari needs display none/block toggle to render properly sometimes
      if (isIOS) {
        videoElement.style.display = "none";
        // Force reflow
        void videoElement.offsetHeight;
        videoElement.style.display = "block";
      }

      // Force play (required for mobile browsers)
      videoElement
        .play()
        .then(() => {
          isPlaying = true;
          console.log("Video playing successfully");
        })
        .catch((e) => {
          console.error("Play error:", e);
          isPlaying = false;
        });
    };

    // Recovery check - if video isn't playing after a moment, try again
    const recoveryTimer = setTimeout(() => {
      if (!isPlaying && videoElement && stream.active) {
        console.log("Attempting recovery of video playback");
        videoElement
          .play()
          .catch((e) => console.error("Recovery attempt failed:", e));
      }
    }, 2000);

    videoElement.addEventListener("canplay", handleCanPlay);

    return () => {
      videoElement.removeEventListener("canplay", handleCanPlay);
      clearTimeout(recoveryTimer);
    };
  }, [stream]);

  // Fix playback issues on Chrome in production
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    console.log("Stream connected, verifying video display");

    // Force video element to reinitialize
    const videoEl = videoRef.current;

    // Enhanced play function with logging
    const forceVideoPlay = () => {
      if (!videoEl) return;

      // Display detailed info about video element
      console.log("Video element status:", {
        videoWidth: videoEl.videoWidth,
        videoHeight: videoEl.videoHeight,
        paused: videoEl.paused,
        readyState: videoEl.readyState,
        networkState: videoEl.networkState,
      });

      // In Chrome, detaching and reattaching can help
      const currentStream = videoEl.srcObject;
      videoEl.srcObject = null;

      // Force layout reflow
      void videoEl.offsetHeight;

      // Reattach stream and force play
      setTimeout(() => {
        if (videoEl && currentStream) {
          videoEl.srcObject = currentStream;
          videoEl
            .play()
            .then(() => console.log("Video forced to play successfully"))
            .catch((err) => console.error("Force play failed:", err));
        }
      }, 50);
    };

    // Call immediately and again after a delay
    forceVideoPlay();
    setTimeout(forceVideoPlay, 1000);

    // Add explicit metadata event listener
    const handleLoadedMetadata = () => {
      console.log("Video metadata loaded, dimensions:", {
        videoWidth: videoEl.videoWidth,
        videoHeight: videoEl.videoHeight,
      });

      if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
        console.log(
          "Metadata loaded but dimensions still zero, applying fix..."
        );
        // Force dimensions if needed
        if (videoEl.style.width === "" && videoEl.style.height === "") {
          // Try to set reasonable defaults based on container
          videoEl.style.width = "100%";
          videoEl.style.height = "100%";
        }

        // Force reflow and play
        void videoEl.offsetHeight;
        videoEl
          .play()
          .catch((e) => console.error("Play after metadata error:", e));
      }
    };

    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [stream]);

  // Add effect to get available cameras
  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(
          (device) => device.kind === "videoinput"
        );
        setAvailableCameras(cameras);

        // If no camera is selected and cameras are available, select the first one
        if (!selectedCameraId && cameras.length > 0) {
          setSelectedCameraId(cameras[0].deviceId);
        }
      } catch (error) {
        console.error("Error getting cameras:", error);
      }
    };

    getCameras();
  }, []);

  const handlePhoto = (photoDataUrl: string) => {
    // Trigger flash effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 800);

    // Play shutter sound
    playShutter();

    // Convert base64 data URL to Blob for file system storage
    const base64Data = photoDataUrl.split(",")[1];
    const mimeType = photoDataUrl.split(",")[0].split(":")[1].split(";")[0];
    const byteCharacters = atob(base64Data);
    const byteArrays = [];

    for (let i = 0; i < byteCharacters.length; i += 512) {
      const slice = byteCharacters.slice(i, i + 512);
      const byteNumbers = new Array(slice.length);
      for (let j = 0; j < slice.length; j++) {
        byteNumbers[j] = slice.charCodeAt(j);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    // Generate unique filename with timestamp and correct extension
    const timestamp = Date.now();
    const timestampStr = new Date(timestamp)
      .toISOString()
      .replace(/[-:.]/g, "")
      .substring(0, 15);
    const fileExtension = mimeType === "image/jpeg" ? ".jpg" : ".png";
    const filename = `photo_${timestampStr}${fileExtension}`;

    // Create file item with Blob content
    const fileItem = {
      name: filename,
      content: blob,
      contentUrl: blobUrl,
      type: mimeType,
      path: `/Images/${filename}`,
      isDirectory: false,
      size: blob.size,
      modifiedAt: new Date(),
    };

    // Save to the file system using hook
    saveFile(fileItem);

    // Create a reference to the saved photo
    const photoRef: PhotoReference = {
      filename,
      path: `/Images/${filename}`,
      timestamp,
    };

    // Add the new photo reference to the photos array
    addPhoto(photoRef);

    setLastPhoto(photoDataUrl); // Use data URL for lastPhoto preview
    setNewPhotoIndex(photos.length);
    setShowThumbnail(true);

    setTimeout(() => {
      setShowThumbnail(false);
      setTimeout(() => setNewPhotoIndex(null), 500);
    }, 2000);
  };

  const startMultiPhotoSequence = () => {
    setIsMultiPhotoMode(true);
    setMultiPhotoCount(0);
    setCurrentPhotoBatch([]);

    // Take 4 photos with a 1-second interval
    const timer = setInterval(() => {
      setMultiPhotoCount((count) => {
        const newCount = count + 1;

        if (newCount <= 4) {
          // Trigger photo capture
          const event = new CustomEvent("webcam-capture");
          window.dispatchEvent(event);
        }

        if (newCount === 4) {
          clearInterval(timer);
          multiPhotoTimerRef.current = null;
          setIsMultiPhotoMode(false);

          // After the sequence completes, process batch photos and convert to references
          // This happens after all photos are taken
          const batchWithReferences = currentPhotoBatch.map((dataUrl) => {
            // Convert to blob and save file similar to handlePhoto
            const base64Data = dataUrl.split(",")[1];
            const mimeType = dataUrl.split(",")[0].split(":")[1].split(";")[0];
            const byteCharacters = atob(base64Data);
            const byteArrays = [];

            for (let i = 0; i < byteCharacters.length; i += 512) {
              const slice = byteCharacters.slice(i, i + 512);
              const byteNumbers = new Array(slice.length);
              for (let j = 0; j < slice.length; j++) {
                byteNumbers[j] = slice.charCodeAt(j);
              }
              const byteArray = new Uint8Array(byteNumbers);
              byteArrays.push(byteArray);
            }

            const blob = new Blob(byteArrays, { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);

            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const timestampStr = new Date(timestamp)
              .toISOString()
              .replace(/[-:.]/g, "")
              .substring(0, 15);
            const fileExtension = mimeType === "image/jpeg" ? ".jpg" : ".png";
            const filename = `photo_${timestampStr}${fileExtension}`;

            // Create file item with Blob content
            const fileItem = {
              name: filename,
              content: blob,
              contentUrl: blobUrl,
              type: mimeType,
              path: `/Images/${filename}`,
              isDirectory: false,
              size: blob.size,
              modifiedAt: new Date(),
            };

            // Save to the file system
            saveFile(fileItem);

            // Return reference to the saved photo
            return {
              filename,
              path: `/Images/${filename}`,
              timestamp,
            };
          });

          // Update photos state with the new references
          addPhotos(batchWithReferences);

          // Show thumbnail animation for the last photo in the sequence
          if (currentPhotoBatch.length > 0) {
            setLastPhoto(currentPhotoBatch[currentPhotoBatch.length - 1]);
            setShowThumbnail(true);
            setTimeout(() => setShowThumbnail(false), 3000);
          }
        }

        return newCount;
      });
    }, 1000);

    multiPhotoTimerRef.current = timer;

    // Take the first photo immediately
    const event = new CustomEvent("webcam-capture");
    window.dispatchEvent(event);
  };

  const toggleEffects = () => {
    setShowEffects(!showEffects);
  };

  const togglePhotoStrip = () => {
    setShowPhotoStrip(!showPhotoStrip);
  };

  const toggleEffectsPage = (pageIndex: number) => {
    setCurrentEffectsPage(pageIndex);
  };

  // Handlers for page navigation
  const goToNextPage = () => {
    setCurrentEffectsPage(1);
  };

  const goToPrevPage = () => {
    setCurrentEffectsPage(0);
  };

  // Setup swipe handlers
  const swipeHandlers = useSwipeDetection(goToNextPage, goToPrevPage);

  // Add useEffect for cleanup
  useEffect(() => {
    // Cleanup when component unmounts
    return () => {
      // We don't need to revoke any URLs since we're using data URLs in the photos array
      // Only revoke lastPhoto URL if it's a blob URL
      if (lastPhoto && lastPhoto.startsWith("blob:")) {
        URL.revokeObjectURL(lastPhoto);
      }
    };
  }, [lastPhoto]);

  // Update the photo-taken event handler
  useEffect(() => {
    const handlePhotoTaken = (e: CustomEvent) => {
      // Skip if we're not in multi-photo mode
      if (!isMultiPhotoMode) return;

      // Get the photo data URL from the event
      const photoDataUrl = e.detail;
      if (!photoDataUrl || typeof photoDataUrl !== "string") {
        console.error("Invalid photo data in photo-taken event");
        return;
      }

      // Add to batch
      setCurrentPhotoBatch((prev) => [...prev, photoDataUrl]);
    };

    // Add event listener
    window.addEventListener("photo-taken", handlePhotoTaken as EventListener);

    return () => {
      window.removeEventListener(
        "photo-taken",
        handlePhotoTaken as EventListener
      );
    };
  }, [isMultiPhotoMode]);

  // Filter photos that actually exist in the file system
  const validPhotos = photos.filter((photo) =>
    files.some((file) => file.name === photo.filename)
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("photo-booth")}
        onClose={onClose}
        isForeground={isForeground}
        appId="photo-booth"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex flex-col w-full h-full bg-neutral-500 max-h-full overflow-hidden">
          {/* Camera view area - takes available space but doesn't overflow */}
          <div
            className={`flex-1 min-h-0 relative ${
              !stream || isLoadingCamera || cameraError
                ? "pointer-events-none opacity-50"
                : ""
            }`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <Webcam
                  onPhoto={(photoDataUrl) => {
                    // Only process if not in preview
                    if (photoDataUrl) {
                      handlePhoto(photoDataUrl);
                    }
                  }}
                  className="w-full h-full"
                  filter={selectedEffect.filter}
                  selectedCameraId={selectedCameraId}
                  stream={stream}
                  autoStart={false}
                />

              {/* Camera flash effect */}
              <AnimatePresence>
                {isFlashing && (
                  <motion.div
                    className="absolute inset-0 bg-white"
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                  />
                )}
              </AnimatePresence>

              {/* Multi-photo countdown overlay */}
              <AnimatePresence>
                {isMultiPhotoMode && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="text-8xl font-bold text-white drop-shadow-lg">
                      {multiPhotoCount < 4 ? 4 - multiPhotoCount : ""}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Effects overlay */}
              <AnimatePresence>
                {showEffects && (
                  <motion.div
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    {...swipeHandlers}
                  >
                    <motion.div
                      className="grid grid-cols-3 gap-4 p-4 w-full max-w-4xl max-h-[calc(100%-40px)] overflow-auto"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.85, opacity: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: "easeOut",
                      }}
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      {(currentEffectsPage === 0
                        ? cssFilters
                        : distortionFilters
                      ).map((effect) => (
                        <motion.div
                          key={effect.name}
                          className={`relative aspect-video overflow-hidden rounded-lg cursor-pointer border-2 ${
                            selectedEffect.name === effect.name
                              ? "border-white"
                              : "border-transparent"
                          }`}
                          whileHover={{
                            scale: 1.05,
                            transition: { duration: 0.15 },
                          }}
                          whileTap={{
                            scale: 0.95,
                            transition: { duration: 0.1 },
                          }}
                          onClick={() => {
                            setSelectedEffect(effect);
                            setShowEffects(false);
                          }}
                        >
                          <Webcam
                            isPreview
                            filter={effect.filter}
                            className="w-full h-full"
                            sharedStream={stream}
                            autoStart={false}
                          />
                          <div
                            className="absolute bottom-0 left-0 right-0 text-center py-1.5 text-white font-geneva-12 text-[12px]"
                            style={{
                              textShadow:
                                "0px 0px 2px black, 0px 0px 2px black, 0px 0px 2px black",
                            }}
                          >
                            {t(`apps.photo-booth.effects.${effect.translationKey}`)}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>

                    {/* Pagination dots - smaller with less space */}
                    <div className="flex items-center justify-center mt-2 space-x-2">
                      <button
                        className="text-white rounded-full p-0.5 hover:bg-white/10"
                        onClick={() => toggleEffectsPage(0)}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            currentEffectsPage === 0
                              ? "bg-white"
                              : "bg-white/40"
                          }`}
                        />
                      </button>
                      <button
                        className="text-white rounded-full p-0.5 hover:bg-white/10"
                        onClick={() => toggleEffectsPage(1)}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            currentEffectsPage === 1
                              ? "bg-white"
                              : "bg-white/40"
                          }`}
                        />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Photo strip preview - positioned in camera view area, but above bottom controls */}
              <AnimatePresence mode="wait">
                {showPhotoStrip && validPhotos.length > 0 && !isInitialLoad && (
                  <motion.div
                    className="absolute bottom-0 inset-x-0 w-full bg-white/40 backdrop-blur-sm p-1 overflow-x-auto"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 50, opacity: 0 }}
                    transition={{
                      type: "tween",
                      ease: "easeOut",
                      duration: 0.2,
                    }}
                  >
                    <div className="flex flex-row space-x-1 h-20 w-max">
                      {[...validPhotos].reverse().map((photo, index) => {
                        // Calculate the original index (before reversing)
                        const originalIndex = validPhotos.length - 1 - index;
                        // Check if this is the new photo that was just added
                        const isNewPhoto = originalIndex === newPhotoIndex;

                        // Find the matching file in the file system
                        const matchingFile = files.find(
                          (file) => file.name === photo.filename
                        );

                        // Skip if file not found in the file system
                        if (!matchingFile || !matchingFile.contentUrl)
                          return null;

                        return (
                          <motion.div
                            key={`photo-${photo.filename}`}
                            className="h-full flex-shrink-0"
                            initial={
                              isNewPhoto
                                ? { scale: 0.5, opacity: 0 }
                                : { opacity: 1, scale: 1 }
                            }
                            animate={{ scale: 1, opacity: 1 }}
                            layout
                            transition={{
                              type: "spring",
                              damping: 25,
                              stiffness: 400,
                              duration: isNewPhoto ? 0.4 : 0,
                            }}
                          >
                            <img
                              src={matchingFile.contentUrl}
                              alt={t("apps.photo-booth.ariaLabels.photo", {
                                index: originalIndex,
                              })}
                              className="h-full w-auto object-contain cursor-pointer transition-opacity hover:opacity-80"
                              onClick={() => {
                                // Create an anchor element to download the image
                                const link = document.createElement("a");
                                link.href = matchingFile.contentUrl || "";
                                link.download = matchingFile.name;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Fixed bottom control bar that always takes full width without overflowing */}
          <div className="flex-shrink-0 w-full bg-black/70 backdrop-blur-md px-6 py-4 flex justify-between items-center z-[60]">
            {/* Left buttons wrapper - contains thumbnail animation and button segment */}
            <div className="relative">
              {/* Thumbnail animation - outside the overflow-hidden segment */}
              <AnimatePresence>
                {showThumbnail && lastPhoto && !showPhotoStrip && (
                  <motion.div
                    className="absolute -top-24 left-0 pointer-events-none z-[100]"
                    initial={{ opacity: 0, y: 10, scale: 0.3 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      y: 60,
                      scale: 0.2,
                      x: -16,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 15,
                    }}
                    style={{
                      originX: "0",
                      originY: "1",
                    }}
                  >
                    <motion.img
                      src={lastPhoto}
                      alt="Last photo thumbnail"
                      className="h-20 w-auto object-cover rounded-md shadow-md border-2 border-white"
                      initial={{ rotateZ: 0 }}
                      animate={{ rotateZ: 0 }}
                      exit={{ rotateZ: 5 }}
                      transition={{
                        type: "spring",
                        stiffness: 200,
                        damping: 10,
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Button segment */}
              <div
                className={cn(
                  "flex relative",
                  isMacTheme
                    ? "overflow-hidden rounded-full shadow-lg px-1 py-1 gap-1"
                    : "space-x-3"
                )}
                style={
                  isMacTheme
                    ? {
                        background:
                          "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                        boxShadow:
                          "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                      }
                    : undefined
                }
              >
                {isMacTheme && <AquaShineOverlay />}
                <button
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center text-white relative overflow-hidden transition-colors focus:outline-none",
                  isMacTheme ? "z-10" : "bg-white/10 hover:bg-white/20",
                  validPhotos.length === 0 && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  background: isXpTheme
                    ? "rgba(255, 255, 255, 0.1)"
                    : undefined,
                  border: isXpTheme ? "none" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.2)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.1)";
                  }
                }}
                onClick={togglePhotoStrip}
                disabled={validPhotos.length === 0}
              >
                <Images
                  size={18}
                  className={
                    isMacTheme
                      ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                      : ""
                  }
                />
              </button>
              <button
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center text-white transition-colors focus:outline-none",
                  isMacTheme ? "z-10" : "bg-white/10 hover:bg-white/20"
                )}
                style={{
                  background: isXpTheme
                    ? "rgba(255, 255, 255, 0.1)"
                    : undefined,
                  border: isXpTheme ? "none" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.2)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.1)";
                  }
                }}
                onClick={startMultiPhotoSequence}
                disabled={isMultiPhotoMode}
              >
                <Timer
                  size={18}
                  className={
                    isMacTheme
                      ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                      : ""
                  }
                />
              </button>
              </div>
            </div>

            {/* Camera capture button */}
            <Button
              onClick={
                isMultiPhotoMode
                  ? () => {}
                  : () => {
                      const event = new CustomEvent("webcam-capture");
                      window.dispatchEvent(event);
                    }
              }
              className={cn(
                "rounded-full h-14 w-14 [&_svg]:size-6 transition-colors focus:outline-none relative overflow-hidden",
                isMacTheme
                  ? "transition-transform hover:scale-105"
                  : isMultiPhotoMode
                  ? "bg-gray-500 cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-600"
              )}
              style={
                isMacTheme
                  ? {
                      background: isMultiPhotoMode
                        ? "linear-gradient(rgba(156, 163, 175, 0.9), rgba(107, 114, 128, 0.9))"
                        : "linear-gradient(rgba(254, 150, 150, 0.95), rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))",
                      boxShadow: isMultiPhotoMode
                        ? "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(156, 163, 175, 0.5)"
                        : "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(254, 150, 150, 0.5)",
                      cursor: isMultiPhotoMode ? "not-allowed" : "pointer",
                    }
                  : isXpTheme
                  ? {
                      background: isMultiPhotoMode ? "#6b7280" : "#dc2626",
                      border: "none",
                      cursor: isMultiPhotoMode ? "not-allowed" : "pointer",
                    }
                  : {
                      cursor: isMultiPhotoMode ? "not-allowed" : "pointer",
                    }
              }
              onMouseEnter={(e) => {
                if (isXpTheme && !isMultiPhotoMode) {
                  e.currentTarget.style.background = "#b91c1c";
                }
              }}
              onMouseLeave={(e) => {
                if (isXpTheme && !isMultiPhotoMode) {
                  e.currentTarget.style.background = "#dc2626";
                }
              }}
              disabled={isMultiPhotoMode}
            >
              {isMacTheme && (
                <>
                  {/* Top shine */}
                  <div
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                    style={{
                      top: "3px",
                      height: "30%",
                      width: "calc(100% - 20px)",
                      borderRadius: "12px 12px 4px 4px",
                      background:
                        "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.25))",
                      filter: "blur(0.2px)",
                      zIndex: 2,
                    }}
                  />
                  {/* Bottom glow */}
                  <div
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                    style={{
                      bottom: "2px",
                      height: "38%",
                      width: "calc(100% - 6px)",
                      borderRadius: "4px 4px 100% 100%",
                      background:
                        "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                      filter: "blur(0.3px)",
                      zIndex: 1,
                    }}
                  />
                </>
              )}
              <Circle
                fill="white"
                stroke="white"
                strokeWidth={0}
                className={isMacTheme ? "relative z-10" : ""}
              />
            </Button>

            {/* Effects button segment */}
            <div
              className={cn(
                "relative",
                isMacTheme && "overflow-hidden rounded-full shadow-lg px-1 py-1"
              )}
              style={
                isMacTheme
                  ? {
                      background:
                        "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                      boxShadow:
                        "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                    }
                  : undefined
              }
            >
              {isMacTheme && <AquaShineOverlay />}
              <Button
                onClick={toggleEffects}
                className={cn(
                  "h-10 px-5 py-1.5 rounded-full text-white text-[16px] transition-colors focus:outline-none",
                  isMacTheme
                    ? "z-10 relative bg-transparent hover:bg-transparent"
                    : "bg-white/10 hover:bg-white/20"
                )}
                style={{
                  background: isXpTheme
                    ? "rgba(255, 255, 255, 0.1)"
                    : undefined,
                  border: isXpTheme ? "none" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.2)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.1)";
                  }
                }}
              >
                <span
                  className={
                    isMacTheme
                      ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                      : ""
                  }
                >
                  {t("apps.photo-booth.buttons.effects")}
                </span>
              </Button>
            </div>
          </div>

          <HelpDialog
            isOpen={showHelp}
            onOpenChange={setShowHelp}
            helpItems={translatedHelpItems}
            appId="photo-booth"
          />
          <AboutDialog
            isOpen={showAbout}
            onOpenChange={setShowAbout}
            metadata={appMetadata}
            appId="photo-booth"
          />
        </div>
      </WindowFrame>
    </>
  );
}
