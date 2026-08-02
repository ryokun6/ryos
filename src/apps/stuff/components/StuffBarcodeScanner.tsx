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
import { cn } from "@/lib/utils";

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

export function StuffBarcodeScanner({
  isOpen,
  onClose,
  onScan,
}: StuffBarcodeScannerProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme: isMacTheme } = useThemeFlags();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
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
  const tEvent = useEffectEvent(t);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const start = async () => {
      setError(null);
      setScanning(true);
      try {
        const [{ BrowserMultiFormatReader }, zxingLibrary] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled || !videoRef.current) return;

        const { DecodeHintType, BarcodeFormat } = zxingLibrary;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.PDF_417,
          BarcodeFormat.AZTEC,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, _err, activeControls) => {
            if (result && !cancelled) {
              activeControls.stop();
              controlsRef.current = null;
              onScanEvent({
                text: result.getText(),
                format:
                  BarcodeFormat[result.getBarcodeFormat()] ?? "CODE_128",
              });
              onCloseEvent();
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        console.error("Barcode scanner failed:", err);
        if (!cancelled) {
          setError(
            tEvent("apps.stuff.scanner.cameraError", {
              defaultValue:
                "Could not access the camera. Enter a barcode manually below.",
            })
          );
        }
      } finally {
        if (!cancelled) setScanning(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isOpen]);

  const submitManual = () => {
    const text = manualCode.trim();
    if (!text) return;
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
