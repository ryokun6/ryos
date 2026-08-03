import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSound, Sounds } from "@/hooks/useSound";
import { cn } from "@/lib/utils";
import {
  BARCODE_CAMERA_CONSTRAINTS,
  canUseNativeBarcodeDetector,
  createNativeBarcodeDetector,
  mapNativeBarcodeFormat,
} from "../utils/barcodeDetectorSupport";
import { createBarcodeScanLock } from "../utils/barcodeScanLock";
import { installZxingMultiFormatReaderWarnFilter } from "../utils/zxingWarnFilter";

export interface ScannedBarcode {
  text: string;
  format: string;
}

interface StuffBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: ScannedBarcode) => void;
}

type ScannerControls = { stop: () => void };

const NATIVE_DETECT_INTERVAL_MS = 150;

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function StuffBarcodeScanner({
  isOpen,
  onClose,
  onScan,
}: StuffBarcodeScannerProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme: isMacTheme } = useThemeFlags();
  const { play: playBeep } = useSound(Sounds.BEEP, 0.45);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);

  const dialogTitle = t("apps.stuff.scanner.title", {
    defaultValue: "Scan Barcode",
  });
  const dialogDescription = t("apps.stuff.scanner.description", {
    defaultValue:
      "Point your camera at a barcode (UPC, EAN, Code 128, QR, and more).",
  });

  const bodyTextClass = cn(
    isWindowsTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
      : "font-geneva-12 text-[12px]"
  );

  // Keep callback identity out of the camera effect deps so parent re-renders
  // with fresh inline handlers do not tear down / restart the video stream.
  const onScanEvent = useEffectEvent((result: ScannedBarcode) => {
    onScan(result);
  });
  const onCloseEvent = useEffectEvent(() => {
    onClose();
  });
  const playBeepEvent = useEffectEvent(() => {
    void playBeep();
  });
  const tEvent = useEffectEvent(t);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let detectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposeZxingWarnFilter: (() => void) | null = null;
    const scanLock = createBarcodeScanLock();

    const cleanupCamera = () => {
      if (detectTimer !== null) {
        clearTimeout(detectTimer);
        detectTimer = null;
      }
      disposeZxingWarnFilter?.();
      disposeZxingWarnFilter = null;
      controlsRef.current?.stop();
      controlsRef.current = null;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };

    const acceptScan = (result: ScannedBarcode) => {
      if (cancelled || !scanLock.tryAccept(result.text)) return;
      cancelled = true;
      playBeepEvent();
      cleanupCamera();
      onScanEvent(result);
      onCloseEvent();
    };

    const startNativeLoop = (video: HTMLVideoElement) => {
      const detector = createNativeBarcodeDetector();
      if (!detector) return false;

      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const codes = await detector.detect(video);
            const first = codes.find((c) => c.rawValue?.trim());
            if (first && !cancelled) {
              acceptScan({
                text: first.rawValue.trim(),
                format: mapNativeBarcodeFormat(first.format),
              });
              return;
            }
          }
        } catch {
          // Transient detect errors are common while focusing; keep looping.
        }
        if (!cancelled) {
          detectTimer = setTimeout(() => {
            void tick();
          }, NATIVE_DETECT_INTERVAL_MS);
        }
      };

      void tick();
      return true;
    };

    const start = async () => {
      setError(null);
      setScanning(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          BARCODE_CAMERA_CONSTRAINTS
        );
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) {
          stopMediaStream(stream);
          streamRef.current = null;
          if (!cancelled) setScanning(false);
          return;
        }

        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        if (cancelled) {
          cleanupCamera();
          return;
        }

        const useNative = await canUseNativeBarcodeDetector();
        if (cancelled) {
          cleanupCamera();
          return;
        }

        if (useNative && startNativeLoop(video)) {
          // Keep scanning=true while the native detect loop is live.
          return;
        }

        // Safari / Firefox / unsupported Chromium: ZXing with constrained formats.
        // Load library first so browser and hints share one module instance.
        const zxingLibrary = await import("@zxing/library");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) {
          cleanupCamera();
          return;
        }

        const { DecodeHintType, BarcodeFormat } = zxingLibrary;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        // @zxing/library 0.23.0 spam-warns on normal NotFound/Checksum/Format
        // misses; keep the filter installed for the continuous decode loop.
        disposeZxingWarnFilter = installZxingMultiFormatReaderWarnFilter();

        const reader = new BrowserMultiFormatReader(hints);
        // Reuse the already-opened rear-camera stream so we don't renegotiate.
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            acceptScan({
              text: result.getText(),
              format: BarcodeFormat[result.getBarcodeFormat()] ?? "CODE_128",
            });
          }
        );
        if (cancelled) {
          controls.stop();
          cleanupCamera();
          return;
        }
        controlsRef.current = controls;
        // Keep scanning=true while ZXing continuous decode is live.
      } catch (err) {
        console.error("Barcode scanner failed:", err);
        cleanupCamera();
        if (!cancelled) {
          setScanning(false);
          setError(
            tEvent("apps.stuff.scanner.cameraError", {
              defaultValue:
                "Could not access the camera. Enter a barcode manually below.",
            })
          );
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      cleanupCamera();
      setScanning(false);
    };
  }, [isOpen]);

  const submitManual = () => {
    const text = manualCode.trim();
    if (!text) return;
    void playBeep();
    onScan({ text, format: "CODE_128" });
    setManualCode("");
    onClose();
  };

  const dialogContent = (
    <div className={isWindowsTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn("mb-3 text-neutral-500", bodyTextClass)}
        id="stuff-scanner-dialog-description"
      >
        {dialogDescription}
      </p>

      <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded border border-black/20 bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {scanning && !error && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        )}
      </div>

      {error && (
        <p className={cn("mb-3 text-red-600", bodyTextClass)}>{error}</p>
      )}

      <div className="mb-4 flex gap-2">
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder={t("apps.stuff.scanner.manualPlaceholder", {
            defaultValue: "ISBN, UPC, or Title…",
          })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") submitManual();
          }}
          className={cn("min-w-0 flex-1 shadow-none", bodyTextClass)}
        />
        <Button
          type="button"
          variant={isMacTheme ? "default" : "retro"}
          onClick={submitManual}
          disabled={!manualCode.trim()}
          className={cn("shrink-0", !isMacTheme && "h-7", bodyTextClass)}
        >
          {t("apps.stuff.scanner.add", { defaultValue: "Add" })}
        </Button>
      </div>

      <DialogFooter className="gap-1.5 sm:justify-end">
        <Button
          type="button"
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={onClose}
          className={cn("w-full sm:w-auto", !isMacTheme && "h-7", bodyTextClass)}
        >
          {t("common.dialog.cancel", { defaultValue: "Cancel" })}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn("max-w-[500px]", isWindowsTheme && "p-0 overflow-hidden")}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              {dialogDescription}
            </DialogDescription>
            <DialogHeader>{dialogTitle}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              {dialogDescription}
            </DialogDescription>
            <DialogHeader>{dialogTitle}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {dialogDescription}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
