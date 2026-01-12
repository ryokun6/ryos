import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CameraSlash } from "@phosphor-icons/react";
import { runFilter, mapCssFilterStringToUniforms } from "@/lib/webglFilterRunner";
import fragSrc from "@/lib/shaders/basicFilter.frag?raw";
import { useCustomEventListener } from "@/hooks/useEventListener";
import { useLatestRef } from "@/hooks/useLatestRef";

interface WebcamProps {
  onPhoto?: (photoDataUrl: string) => void;
  className?: string;
  isPreview?: boolean;
  filter?: string;
  sharedStream?: MediaStream | null;
  selectedCameraId?: string | null;
  stream?: MediaStream | null;
  autoStart?: boolean;
  isBackCamera?: boolean;
}

export function Webcam({
  onPhoto,
  className = "",
  isPreview = false,
  filter = "none",
  sharedStream,
  selectedCameraId,
  stream: controlledStream,
  autoStart = true,
  isBackCamera = false,
}: WebcamProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [internalStream, setInternalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const startedInternallyRef = useRef(false);
  const activeDeviceIdRef = useRef<string | null>(null);

  // Detect if the current filter string requires WebGL preview (distortion keywords)
  const needsWebGLPreview = useMemo(() => {
    return /bulge|pinch|twist|fisheye|stretch|squeeze|tunnel|kaleidoscope|ripple|glitch/i.test(filter);
  }, [filter]);

  const activeStream = !isPreview
    ? controlledStream ?? internalStream
    : sharedStream ?? controlledStream ?? internalStream;

  const activeStreamRef = useLatestRef(activeStream);
  const isPreviewRef = useLatestRef(isPreview);
  const filterRef = useLatestRef(filter);
  const isBackCameraRef = useLatestRef(isBackCamera);
  const onPhotoRef = useLatestRef(onPhoto);

  // Start camera when component mounts or shared stream changes
  useEffect(() => {
    const videoEl = videoRef.current;

    if (isPreview) {
      if (videoEl) {
        if (sharedStream) {
          videoEl.srcObject = sharedStream;
          videoEl.play().catch(console.error);
        } else {
          videoEl.srcObject = null;
        }
      }

      return () => {
        if (videoEl && videoEl.srcObject === sharedStream) {
          videoEl.srcObject = null;
        }
      };
    }

    if (controlledStream) {
      startedInternallyRef.current = false;
      setError(null);
      setInternalStream(null);

      if (videoEl) {
        videoEl.srcObject = controlledStream;
        videoEl.play().catch(console.error);
      }

      return () => {
        if (videoEl && videoEl.srcObject === controlledStream) {
          videoEl.srcObject = null;
        }
      };
    }

    if (!autoStart) {
      startedInternallyRef.current = false;
      stopCamera();
      return;
    }

    const shouldRestartForSelection =
      Boolean(selectedCameraId) &&
      activeDeviceIdRef.current !== selectedCameraId;

    if (!internalStream || shouldRestartForSelection) {
      startedInternallyRef.current = true;
      startCamera();
    }

    return () => {
      if (startedInternallyRef.current) {
        stopCamera();
      }
    };
  }, [
    isPreview,
    sharedStream,
    controlledStream,
    selectedCameraId,
    internalStream,
    autoStart,
  ]);

  // Real-time WebGL preview loop for distortion filters
  useEffect(() => {
    if (!needsWebGLPreview) {
      // Clean up any running loop
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const canvas = previewCanvasRef.current;
    if (!canvas || !videoRef.current) return;

    // Prepare reusable capture canvas
    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement("canvas");
    }
    const captureCanvas = captureCanvasRef.current;

    const render = async (time: number) => {
      if (!canvas || !videoRef.current) return;

      // Throttle to 30fps (~33ms)
      if (time - lastRenderTimeRef.current < 33) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastRenderTimeRef.current = time;

      try {
        const video = videoRef.current;

        const scale = 0.5; // render preview at 50% size for performance
        const targetW = Math.max(1, Math.floor(video.videoWidth * scale));
        const targetH = Math.max(1, Math.floor(video.videoHeight * scale));
        if (captureCanvas.width !== targetW || captureCanvas.height !== targetH) {
          captureCanvas.width = targetW;
          captureCanvas.height = targetH;
        }

        const ctxCap = captureCanvas.getContext("2d");
        if (!ctxCap) return;
        // Draw video frame into capture canvas (no flip; preview canvas CSS flips)
        ctxCap.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

        const uniforms = mapCssFilterStringToUniforms(filter);
        const glCanvas = await runFilter(captureCanvas, uniforms, fragSrc);

        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          ctx2d.clearRect(0, 0, canvas.width, canvas.height);
          ctx2d.drawImage(glCanvas, 0, 0);
        }
      } catch (e) {
        console.error("Preview WebGL render failed:", e);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [needsWebGLPreview, filter]);

  const handleCapture = useCallback(async () => {
    if (isPreviewRef.current) return;
    if (!videoRef.current || !activeStreamRef.current) return;

    const video = videoRef.current;

    // Use the video element directly as the source for WebGL
    // Set canvas dimensions to match video
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    if (!ctx) return;

    // Apply the horizontal flip using Canvas 2D first (only for front cameras)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!isBackCameraRef.current) {
      ctx.scale(-1, 1);
      ctx.drawImage(
        video,
        -captureCanvas.width,
        0,
        captureCanvas.width,
        captureCanvas.height
      );
    } else {
      ctx.drawImage(
        video,
        0,
        0,
        captureCanvas.width,
        captureCanvas.height
      );
    }

    let finalCanvas: HTMLCanvasElement = captureCanvas;

    // Apply filter using WebGL if a filter is selected
    if (filterRef.current !== "none") {
      try {
        const uniforms = mapCssFilterStringToUniforms(filterRef.current);
        // Use the canvas with the flip applied as the source for the GL filter
        finalCanvas = await runFilter(captureCanvas, uniforms, fragSrc);
      } catch (error) {
        console.error("WebGL filtering failed, falling back to no filter:", error);
        // If WebGL fails, use the canvas with just the flip
        finalCanvas = captureCanvas;
      }
    }

    // Convert the final canvas (with flip and potentially WebGL filter) to JPEG data URL
    const photoDataUrl = finalCanvas.toDataURL("image/jpeg", 0.85);

    // Call the onPhoto callback
    onPhotoRef.current?.(photoDataUrl);

    // Dispatch a custom event with the photo data URL for other components to use
    const photoTakenEvent = new CustomEvent("photo-taken", {
      detail: photoDataUrl,
    });
    window.dispatchEvent(photoTakenEvent);

    // Clean up temporary canvas
    // No explicit cleanup needed for canvas elements, they are garbage collected
  }, [activeStreamRef, filterRef, isBackCameraRef, isPreviewRef, onPhotoRef]);

  // Listen for webcam-capture events
  useCustomEventListener("webcam-capture", handleCapture);

  const startCamera = async () => {
    try {
      startedInternallyRef.current = true;

      if (internalStream) {
        internalStream.getTracks().forEach((track) => track.stop());
      }

      const constraints = {
        audio: false,
        video: {
          deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = mediaStream.getVideoTracks()[0];

      activeDeviceIdRef.current =
        track?.getSettings().deviceId ?? selectedCameraId ?? null;

      setInternalStream(mediaStream);
      setError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(console.error);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError(err instanceof Error ? err.message : t("common.errors.failedToAccessCamera"));
      activeDeviceIdRef.current = null;
      startedInternallyRef.current = false;
    }
  };

  const stopCamera = () => {
    if (internalStream && !isPreview) {
      internalStream.getTracks().forEach((track) => track.stop());
      setInternalStream(null);
    }

    if (!controlledStream && videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (!controlledStream) {
      activeDeviceIdRef.current = null;
      startedInternallyRef.current = false;
    }
  };

  return (
    <div className={`relative ${className}`}>
      {error ? (
        <div
          className="w-full h-full flex items-center justify-center"
          onClick={startCamera}
        >
          <CameraSlash size={48} className="text-white/30 cursor-pointer" weight="bold" />
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ filter: needsWebGLPreview ? "none" : filter, transform: isBackCamera ? "none" : "scaleX(-1)" }}
          />
          {needsWebGLPreview && (
            <canvas
              ref={previewCanvasRef}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: isBackCamera ? "none" : "scaleX(-1)" }}
            />
          )}
        </>
      )}
    </div>
  );
}
