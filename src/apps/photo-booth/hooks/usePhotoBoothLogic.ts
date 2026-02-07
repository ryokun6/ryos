import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useSound, Sounds } from "@/hooks/useSound";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { usePhotoBoothStore } from "@/stores/usePhotoBoothStore";
import type { PhotoReference } from "@/stores/usePhotoBoothStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { getTranslatedAppName } from "@/utils/i18n";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useTimeout } from "@/hooks/useTimeout";
import { helpItems } from "..";

interface Effect {
  name: string;
  filter: string;
  translationKey: string;
}

function useSwipeDetection(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Minimum distance required for a swipe
  const MIN_SWIPE_DISTANCE = 50;

  const onTouchStart = useCallback((e: TouchEvent<HTMLElement>) => {
    touchStartX.current = e.targetTouches[0].clientX;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent<HTMLElement>) => {
    touchEndX.current = e.targetTouches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(() => {
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
  }, [onSwipeLeft, onSwipeRight]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

export interface UsePhotoBoothLogicProps {
  isWindowOpen: boolean;
  isForeground?: boolean;
}

export function usePhotoBoothLogic({
  isWindowOpen,
  isForeground = true,
}: UsePhotoBoothLogicProps) {
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
        filter:
          "brightness(120%) contrast(120%) saturate(200%) hue-rotate(310deg)",
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
  const [isBackCamera, setIsBackCamera] = useState(false);
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
  const activeCameraIdRef = useRef<string | null>(null);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const windowTitle = getTranslatedAppName("photo-booth");

  // Helper function to detect if a camera is a back/rear camera
  const detectIsBackCamera = useCallback(
    (label: string, facingMode?: string): boolean => {
      // Check facingMode first (most reliable)
      if (facingMode === "environment") return true;
      if (facingMode === "user") return false;

      // Fall back to label detection
      const lowerLabel = label.toLowerCase();
      return (
        lowerLabel.includes("back") ||
        lowerLabel.includes("rear") ||
        lowerLabel.includes("environment")
      );
    },
    []
  );

  const handleClearPhotos = useCallback(() => {
    clearPhotos();
    setCurrentPhotoBatch([]);
  }, [clearPhotos]);

  const handleExportPhotos = useCallback(async () => {
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
      link.download =
        photos[i].filename || `photo-booth-${Date.now()}-${i + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Small delay between downloads to prevent browser issues
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, [photos]);

  // Add a small delay before showing photo strip to prevent flickering
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  useTimeout(
    () => {
      setIsInitialLoad(false);
    },
    showPhotoStrip && isInitialLoad ? 300 : null
  );

  const isWindowOpenRef = useLatestRef(isWindowOpen);
  const isForegroundRef = useLatestRef(isForeground);

  const stopCamera = useCallback((options?: { skipState?: boolean }) => {
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
  }, []);

  const startCamera = useCallback(async () => {
    if (!isMountedRef.current) return;

    const shouldActivate = isWindowOpenRef.current && isForegroundRef.current;
    if (!shouldActivate) return;

    const currentStream = streamRef.current;
    const hasActiveTracks =
      currentStream &&
      currentStream.active &&
      currentStream.getTracks().some((track) => track.readyState === "live");

    const isSameDevice =
      !selectedCameraId || activeCameraIdRef.current === selectedCameraId;

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

          // Detect if this is a back camera
          const isBack = detectIsBackCamera(
            videoTrack.label,
            settings.facingMode as string | undefined
          );
          setIsBackCamera(isBack);
          console.log(
            "Camera facing:",
            isBack ? "back/environment" : "front/user"
          );
        } catch (e) {
          console.warn("Couldn't read track settings:", e);
          activeCameraIdRef.current = selectedCameraId;
          // Try to detect from label only
          setIsBackCamera(detectIsBackCamera(videoTrack.label));
        }
      } else {
        activeCameraIdRef.current = selectedCameraId;
        setIsBackCamera(false);
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
  }, [selectedCameraId, stopCamera, detectIsBackCamera]);

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

  const triggerCapture = useCallback(() => {
    const event = new CustomEvent("webcam-capture");
    window.dispatchEvent(event);
  }, []);

  return {
    t,
    translatedHelpItems,
    showHelp,
    setShowHelp,
    showAbout,
    setShowAbout,
    showEffects,
    setShowEffects,
    showPhotoStrip,
    setShowPhotoStrip,
    currentEffectsPage,
    setCurrentEffectsPage,
    cssFilters,
    distortionFilters,
    effects,
    selectedEffect,
    setSelectedEffect,
    availableCameras,
    selectedCameraId,
    isBackCamera,
    stream,
    cameraError,
    isLoadingCamera,
    isMultiPhotoMode,
    multiPhotoCount,
    isFlashing,
    lastPhoto,
    showThumbnail,
    newPhotoIndex,
    files,
    validPhotos,
    isInitialLoad,
    isXpTheme,
    isMacTheme,
    windowTitle,
    handleClearPhotos,
    handleExportPhotos,
    handleCameraSelect,
    handlePhoto,
    startMultiPhotoSequence,
    toggleEffects,
    togglePhotoStrip,
    toggleEffectsPage,
    swipeHandlers,
    triggerCapture,
  };
}
