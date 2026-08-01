import type { StuffItem, StuffTag } from "../types";

export type StuffLabelKind = "item" | "tag";

export interface StuffLabelTarget {
  kind: StuffLabelKind;
  id: string;
  title: string;
  subtitle?: string;
}

const ITEM_PREFIX = "ryos:stuff:item:";
const TAG_PREFIX = "ryos:stuff:tag:";

/** Encode a ryOS Stuff entity id into a scannable CODE128 payload. */
export function encodeStuffId(kind: StuffLabelKind, id: string): string {
  return `${kind === "item" ? ITEM_PREFIX : TAG_PREFIX}${id}`;
}

export function parseStuffIdBarcode(
  value: string
): { kind: StuffLabelKind; id: string } | null {
  const text = value.trim();
  if (text.startsWith(ITEM_PREFIX)) {
    const id = text.slice(ITEM_PREFIX.length).trim();
    return id ? { kind: "item", id } : null;
  }
  if (text.startsWith(TAG_PREFIX)) {
    const id = text.slice(TAG_PREFIX.length).trim();
    return id ? { kind: "tag", id } : null;
  }
  return null;
}

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
      return "CODE128";
    default:
      return "CODE128";
  }
}

type JsBarcodeFn = (
  element: SVGElement,
  value: string,
  options?: Record<string, unknown>
) => void;

let jsBarcodeLoader: Promise<JsBarcodeFn> | null = null;

async function loadJsBarcode(): Promise<JsBarcodeFn> {
  if (!jsBarcodeLoader) {
    jsBarcodeLoader = import("jsbarcode").then((mod) => {
      const fn = (mod as { default?: JsBarcodeFn }).default ?? (mod as unknown as JsBarcodeFn);
      return fn;
    });
  }
  return jsBarcodeLoader;
}

/** Always render ryOS ids as CODE128 (alphanumeric + punctuation). */
export async function renderBarcodeSvg(
  value: string,
  format: string = "CODE128"
): Promise<string | null> {
  if (!value.trim() || typeof document === "undefined") return null;
  const JsBarcode = await loadJsBarcode();
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: toJsBarcodeFormat(format),
      displayValue: true,
      fontSize: 11,
      height: 56,
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
        fontSize: 11,
        height: 56,
        margin: 8,
      });
      return new XMLSerializer().serializeToString(svg);
    } catch {
      return null;
    }
  }
}

export async function renderStuffIdBarcodeSvg(
  kind: StuffLabelKind,
  id: string
): Promise<string | null> {
  return renderBarcodeSvg(encodeStuffId(kind, id), "CODE128");
}

export function itemToLabelTarget(item: StuffItem): StuffLabelTarget {
  return {
    kind: "item",
    id: item.id,
    title: item.title,
    subtitle: item.brand,
  };
}

export function tagToLabelTarget(tag: StuffTag): StuffLabelTarget {
  return {
    kind: "tag",
    id: tag.id,
    title: tag.name,
    subtitle: "Tag",
  };
}

export async function printStuffLabels(targets: StuffLabelTarget[]): Promise<void> {
  if (targets.length === 0) {
    window.alert("Nothing to print.");
    return;
  }

  const rendered = await Promise.all(
    targets.map(async (target) => {
      const payload = encodeStuffId(target.kind, target.id);
      const svg = await renderBarcodeSvg(payload, "CODE128");
      if (!svg) return "";
      const kindLabel = target.kind === "tag" ? "Tag" : "Item";
      return `<div class="label">
        <div class="kind">${escapeHtml(kindLabel)}</div>
        <div class="title">${escapeHtml(target.title)}</div>
        ${
          target.subtitle
            ? `<div class="subtitle">${escapeHtml(target.subtitle)}</div>`
            : ""
        }
        <div class="barcode">${svg}</div>
      </div>`;
    })
  );

  const labels = rendered.filter(Boolean).join("\n");
  if (!labels) {
    window.alert("Could not generate barcode labels.");
    return;
  }

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
    .kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.55; margin-bottom: 2px; }
    .title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
    .subtitle { font-size: 11px; opacity: 0.7; margin-bottom: 6px; }
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
