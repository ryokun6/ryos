import { useEffect, useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const start = async () => {
      setError(null);
      setScanning(true);
      try {
        // Lazy-load ZXing so it stays out of the Stuff app's offline precache.
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
              onScan({
                text: result.getText(),
                format:
                  BarcodeFormat[result.getBarcodeFormat()] ?? "CODE_128",
              });
              onClose();
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
            t("apps.stuff.scanner.cameraError", {
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
  }, [isOpen, onClose, onScan, t]);

  const submitManual = () => {
    const text = manualCode.trim();
    if (!text) return;
    onScan({ text, format: "CODE_128" });
    setManualCode("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-os-window-bg">
        <DialogHeader>
          <DialogTitle>
            {t("apps.stuff.scanner.title", { defaultValue: "Scan Barcode" })}
          </DialogTitle>
          <DialogDescription>
            {t("apps.stuff.scanner.description", {
              defaultValue:
                "Point your camera at a barcode (UPC, EAN, Code 128, QR, and more).",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-black">
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
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex gap-2">
          <Input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder={t("apps.stuff.scanner.manualPlaceholder", {
              defaultValue: "Or type a barcode…",
            })}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitManual();
            }}
          />
          <Button type="button" onClick={submitManual} disabled={!manualCode.trim()}>
            {t("apps.stuff.scanner.add", { defaultValue: "Add" })}
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.dialog.cancel", { defaultValue: "Cancel" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
