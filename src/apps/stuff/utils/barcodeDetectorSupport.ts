/** Formats we care about for Stuff (UPC/EAN/ISBN-as-EAN-13, Code 128/39, QR). */
export const NATIVE_BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
] as const;

export type NativeBarcodeFormat = (typeof NATIVE_BARCODE_FORMATS)[number];

export interface DetectedBarcodeLike {
  rawValue: string;
  format: string;
}

export interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcodeLike[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor & {
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

/** Map BarcodeDetector format ids to the ZXing-style names Stuff stores. */
export function mapNativeBarcodeFormat(format: string): string {
  const normalized = format.trim().toLowerCase().replace(/-/g, "_");
  switch (normalized) {
    case "ean_13":
    case "isbn_13":
      return "EAN_13";
    case "ean_8":
      return "EAN_8";
    case "upc_a":
      return "UPC_A";
    case "upc_e":
      return "UPC_E";
    case "code_128":
      return "CODE_128";
    case "code_39":
      return "CODE_39";
    case "qr_code":
      return "QR_CODE";
    case "isbn_10":
      return "ISBN_10";
    default:
      return normalized.toUpperCase() || "CODE_128";
  }
}

/**
 * True when the native BarcodeDetector API can handle at least one product
 * barcode format we care about (Chrome/Android; not Safari/WebKit yet).
 */
export async function canUseNativeBarcodeDetector(): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.BarcodeDetector !== "function") {
    return false;
  }
  try {
    const supported = window.BarcodeDetector.getSupportedFormats
      ? await window.BarcodeDetector.getSupportedFormats()
      : [...NATIVE_BARCODE_FORMATS];
    const supportedSet = new Set(supported.map((f) => f.toLowerCase()));
    return NATIVE_BARCODE_FORMATS.some((f) => supportedSet.has(f));
  } catch {
    return false;
  }
}

export function createNativeBarcodeDetector(): BarcodeDetectorLike | null {
  if (typeof window === "undefined" || typeof window.BarcodeDetector !== "function") {
    return null;
  }
  try {
    return new window.BarcodeDetector({
      formats: [...NATIVE_BARCODE_FORMATS],
    });
  } catch {
    return null;
  }
}

/** Ideal rear-camera constraints for close-up product barcodes. */
export const BARCODE_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};
