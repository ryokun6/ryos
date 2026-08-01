import JsBarcode from "jsbarcode";
import type { StuffItem } from "../types";

/** Map ZXing format names to JsBarcode format keys. */
export function toJsBarcodeFormat(format?: string): string {
  switch ((format ?? "").toUpperCase().replace(/-/g, "_")) {
    case "EAN_13":
    case "EAN13":
      return "EAN13";
    case "EAN_8":
    case "EAN8":
      return "EAN8";
    case "UPC_A":
    case "UPC":
      return "UPC";
    case "UPC_E":
      return "UPCE";
    case "CODE_39":
    case "CODE39":
      return "CODE39";
    case "CODE_128":
    case "CODE128":
      return "CODE128";
    case "ITF":
    case "ITF_14":
      return "ITF14";
    case "CODABAR":
      return "codabar";
    case "QR_CODE":
    case "DATA_MATRIX":
    case "PDF_417":
    case "AZTEC":
      // JsBarcode doesn't render 2D codes; fall back to CODE128 of the payload
      return "CODE128";
    default:
      return "CODE128";
  }
}

export function renderBarcodeSvg(
  value: string,
  format?: string
): string | null {
  if (!value.trim()) return null;
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: toJsBarcodeFormat(format),
      displayValue: true,
      fontSize: 14,
      height: 60,
      margin: 8,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return new XMLSerializer().serializeToString(svg);
  } catch {
    try {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height: 60,
        margin: 8,
      });
      return new XMLSerializer().serializeToString(svg);
    } catch {
      return null;
    }
  }
}

export function printStuffLabels(items: StuffItem[]): void {
  const printable = items.filter((item) => item.barcode);
  if (printable.length === 0) {
    window.alert("Select items that have barcodes to print labels.");
    return;
  }

  const labels = printable
    .map((item) => {
      const svg = renderBarcodeSvg(item.barcode!, item.barcodeFormat);
      if (!svg) return "";
      return `<div class="label">
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="barcode">${svg}</div>
      </div>`;
    })
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Stuff Labels</title>
  <style>
    @page { margin: 0.4in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; }
    .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .label {
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
      text-align: center;
    }
    .title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .barcode svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="sheet">${labels}</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=600");
  if (!win) {
    window.alert("Allow pop-ups to print barcode labels.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
