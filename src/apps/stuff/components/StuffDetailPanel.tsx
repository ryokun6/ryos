import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  LinkSimple,
  MagicWand,
  MagnifyingGlass,
  Printer,
  QrCode,
  Trash,
} from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputDialog } from "@/components/dialogs/InputDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  STUFF_STATUSES,
  stuffStatusLabelDefault,
  type StuffItem,
  type StuffTag,
} from "../types";
import { formatMoney, parseOptionalNumber } from "../utils/colors";
import { encodeStuffId } from "../utils/printLabels";
import { StuffItemCover } from "./StuffItemCover";
import {
  getStuffCoverDimensions,
  STUFF_PRODUCT_DETAIL,
} from "../utils/stuffCoverSizes";
import {
  dataUrlToBlob,
  putStuffCoverBlob,
} from "../utils/stuffCoverBlobs";
import { trimStuffCutoutTransparentPadding } from "../utils/stuffCoverCutout";
import {
  clipboardMayContainImage,
  ensureStuffCoverFileType,
  extractClipboardImageUrl,
  getImageFileFromDataTransfer,
  isAcceptableStuffCoverFile,
  isDataImageUrl,
  isHttpImageUrl,
} from "../utils/stuffCoverIngest";
import { useStuffItemCoverSrc } from "../hooks/useStuffItemCoverSrc";
import { resolveStuffItemVisualKind } from "../utils/stuffItemVisualKind";
import { stuffTagDisplayName } from "../utils/stuffTagDisplayName";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

interface StuffDetailPanelProps {
  item: StuffItem;
  tags: StuffTag[];
  onChange: (draft: Partial<StuffItem>) => void;
  onDelete: () => void;
  onPrint: () => void;
  onLookup?: (fields: { title: string; brand: string; barcode: string }) => void;
  isLookingUp?: boolean;
}

function FieldRow({
  label,
  useGeneva,
  children,
}: {
  label: string;
  useGeneva: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full items-start gap-2">
      <span
        className={cn(
          "w-[68px] shrink-0 break-words pt-0.5 text-right text-[11px] font-bold leading-snug text-[#222]",
          useGeneva && "font-geneva-12"
        )}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** White or near-black label for solid tag-color fills. */
function contrastTextForTagColor(hex: string): string {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  if (!/^[0-9a-f]{6}$/i.test(full)) return "#ffffff";
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1f1a00" : "#ffffff";
}

function tagPillStyle(
  color: string,
  active: boolean,
  isDarkMode: boolean
): CSSProperties {
  if (active) {
    return {
      backgroundColor: color,
      color: contrastTextForTagColor(color),
      border: `1px solid ${color}`,
    };
  }
  if (isDarkMode) {
    return {
      backgroundColor: `${color}28`,
      color,
      border: `1px solid ${color}66`,
    };
  }
  return {
    backgroundColor: `${color}18`,
    color,
    border: `1px solid ${color}40`,
  };
}

/**
 * Item editor content for `AppDrawer` — mirrors Calendar's tray: local text
 * drafts that commit on blur so spaces / mid-edit empties don't thrash the store.
 */
export function StuffDetailPanel({
  item,
  tags,
  onChange,
  onDelete,
  onPrint,
  onLookup,
  isLookingUp,
}: StuffDetailPanelProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { isMacOSTheme, isSystem7Theme, isWindowsTheme, isDarkMode } =
    useThemeFlags();
  const useGeneva = isMacOSTheme || isSystem7Theme;

  const [title, setTitle] = useState(item.title);
  const [brand, setBrand] = useState(item.brand ?? "");
  const [notes, setNotes] = useState(item.notes);
  const [barcode, setBarcode] = useState(item.barcode ?? "");
  const [currency, setCurrency] = useState(item.prices.currency);
  const [imageUrl, setImageUrl] = useState("");
  const [isImageUrlDialogOpen, setIsImageUrlDialogOpen] = useState(false);
  const [isImageBusy, setIsImageBusy] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [isCoverDragOver, setIsCoverDragOver] = useState(false);
  const [showBarcodePreview, setShowBarcodePreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverSrc = useStuffItemCoverSrc(item);
  const hasCover = Boolean(coverSrc);
  const coverDims = getStuffCoverDimensions(
    resolveStuffItemVisualKind(item, tags),
    "detail"
  );
  // QR always matches product/square detail size (112×112), not book portrait.
  const barcodeQrSize = STUFF_PRODUCT_DETAIL.width;

  const ryosPayload = item.id ? encodeStuffId("item", item.id) : "";
  const canShowBarcodePreview = Boolean(ryosPayload);
  const showingBarcodePreview = showBarcodePreview && canShowBarcodePreview;
  // When toggling QR on books, keep the tall reserved area and center a square QR.
  const previewSlotDims = showingBarcodePreview
    ? {
        width: Math.max(coverDims.width, STUFF_PRODUCT_DETAIL.width),
        height: Math.max(coverDims.height, STUFF_PRODUCT_DETAIL.height),
      }
    : coverDims;

  useEffect(() => {
    setTitle(item.title);
    setBrand(item.brand ?? "");
    setNotes(item.notes);
    setBarcode(item.barcode ?? "");
    setCurrency(item.prices.currency);
    setImageUrl("");
  }, [
    item.id,
    item.updatedAt,
    item.title,
    item.brand,
    item.notes,
    item.barcode,
    item.prices.currency,
    item.imageDataUrl,
    item.imageUrl,
    item.coverBlobId,
  ]);

  useEffect(() => {
    setShowBarcodePreview(false);
  }, [item.id]);

  useEffect(() => {
    setIsCoverDragOver(false);
  }, [item.id, showBarcodePreview]);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(item.title);
      return;
    }
    if (next !== item.title) onChange({ title: next });
  };

  const commitBrand = () => {
    const next = brand.trim() || undefined;
    if (next !== (item.brand || undefined)) onChange({ brand: next });
  };

  const commitNotes = () => {
    if (notes !== item.notes) onChange({ notes });
  };

  const commitBarcode = () => {
    const next = barcode.trim() || undefined;
    if (next !== (item.barcode || undefined)) {
      onChange({
        barcode: next,
        barcodeFormat: next ? item.barcodeFormat ?? "CODE_128" : undefined,
      });
    }
  };

  const handleLookupClick = () => {
    if (!onLookup) return;
    commitTitle();
    commitBrand();
    commitBarcode();
    onLookup({ title, brand, barcode });
  };

  const lookupLabel = t("apps.stuff.detail.lookup", { defaultValue: "Look Up" });
  const printLabel = t("apps.stuff.detail.print", { defaultValue: "Print" });
  const qrCodeLabel = t("apps.stuff.detail.qrCode", { defaultValue: "QR Code" });
  const deleteLabel = t("apps.stuff.detail.delete", { defaultValue: "Delete" });
  const headerActionButtonClass = cn(
    "size-7 shrink-0 !p-0 min-w-0",
    isWindowsTheme && "text-black"
  );
  const deleteActionButtonClass = cn(
    headerActionButtonClass,
    "hover:text-red-600 active:text-red-700"
  );

  const titleInputClass = cn(
    "w-full border-0 bg-transparent p-0 text-center outline-none focus:ring-0",
    "font-bold tracking-tight text-[#222]",
    isMacOSTheme && "font-geneva-12 text-lg leading-snug min-h-[1.35rem]",
    isSystem7Theme && !isMacOSTheme && "font-geneva-12 text-[16px] leading-snug",
    !isMacOSTheme && !isSystem7Theme && "text-base font-semibold leading-snug"
  );

  const headerMetaInputClass = cn(
    "mt-0.5 w-full border-0 bg-transparent p-0 text-center text-[11px] text-black/45 outline-none placeholder:text-black/35 focus:ring-0",
    useGeneva && "font-geneva-12"
  );

  const commitCurrency = () => {
    const next = currency.trim().toUpperCase() || "USD";
    if (next !== item.prices.currency) {
      onChange({ prices: { ...item.prices, currency: next } });
    }
  };

  const toggleTag = (tagId: string) => {
    const next = item.tagIds.includes(tagId)
      ? item.tagIds.filter((id) => id !== tagId)
      : [...item.tagIds, tagId];
    onChange({ tagIds: next });
  };

  const imageInvalidToast = () => {
    toast.error(
      t("apps.stuff.detail.imageInvalid", {
        defaultValue: "Could not use that image.",
      })
    );
  };

  const applyCoverFile = async (
    file: File,
    options?: { coverPresentation?: StuffItem["coverPresentation"] }
  ) => {
    const normalized = ensureStuffCoverFileType(file);
    setIsImageBusy(true);
    try {
      if (!isAcceptableStuffCoverFile(normalized)) {
        imageInvalidToast();
        return;
      }
      await putStuffCoverBlob(item.id, normalized);
      onChange({
        coverBlobId: item.id,
        imageDataUrl: "",
        imageUrl: "",
        coverPresentation: options?.coverPresentation ?? "default",
      });
    } catch {
      imageInvalidToast();
    } finally {
      setIsImageBusy(false);
    }
  };

  const applyCoverDataUrl = async (dataUrl: string) => {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob || blob.size === 0) {
      imageInvalidToast();
      return;
    }
    const mime = blob.type.startsWith("image/") ? blob.type : "image/png";
    const file = new File([blob], "pasted-cover", { type: mime });
    await applyCoverFile(file);
  };

  const handleApplyImageUrl = (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    if (isDataImageUrl(url)) {
      void applyCoverDataUrl(url);
      setImageUrl("");
      setIsImageUrlDialogOpen(false);
      return;
    }
    // Hotlink for display — same path as lookup picker thumbnails / covers.
    onChange({
      imageUrl: url,
      imageDataUrl: "",
      coverBlobId: "",
      coverPresentation: "default",
    });
    setImageUrl("");
    setIsImageUrlDialogOpen(false);
  };

  const applyCoverFromClipboardUrl = async (url: string) => {
    if (isDataImageUrl(url)) {
      await applyCoverDataUrl(url);
      return;
    }
    if (isHttpImageUrl(url)) {
      handleApplyImageUrl(url);
      return;
    }
    if (url.toLowerCase().startsWith("blob:")) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          imageInvalidToast();
          return;
        }
        const blob = await response.blob();
        const mime = blob.type.startsWith("image/")
          ? blob.type
          : "image/png";
        await applyCoverFile(
          new File([blob], "pasted-cover", { type: mime })
        );
      } catch {
        imageInvalidToast();
      }
      return;
    }
    imageInvalidToast();
  };

  const readCoverFromClipboardApi = async (): Promise<boolean> => {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.read !== "function"
    ) {
      return false;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const clipboardItem of items) {
        const imageType = clipboardItem.types.find((type) =>
          type.startsWith("image/")
        );
        if (!imageType) continue;
        const blob = await clipboardItem.getType(imageType);
        await applyCoverFile(
          new File([blob], "pasted-cover", {
            type: blob.type || imageType,
          })
        );
        return true;
      }
    } catch {
      // Permission denied or unsupported — fall through to toast at caller.
    }
    return false;
  };

  const handleChooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void applyCoverFile(file);
  };

  const imageControlsDisabled = isImageBusy || isLookingUp;
  const canAcceptCoverDrop = !showingBarcodePreview && !imageControlsDisabled;

  const handleRemoveBackground = () => {
    if (!coverSrc || imageControlsDisabled) return;
    if (!auth.isAuthenticated) {
      auth.promptLogin();
      toast.error(
        t("apps.stuff.detail.removeBackgroundSignIn", {
          defaultValue: "Sign in to remove backgrounds.",
        })
      );
      return;
    }

    void (async () => {
      setIsImageBusy(true);
      setIsRemovingBackground(true);
      try {
        const response = await fetch(coverSrc);
        if (!response.ok) {
          throw new Error("cover_fetch_failed");
        }
        const sourceBlob = await response.blob();
        if (!sourceBlob.size) {
          throw new Error("cover_empty");
        }
        const mediaType = sourceBlob.type.startsWith("image/")
          ? sourceBlob.type
          : "image/png";
        const imageBase64 = await blobToBase64(sourceBlob);

        const apiResponse = await abortableFetch(
          getApiUrl("/api/stuff/remove-background"),
          {
            method: "POST",
            timeout: 90_000,
            throwOnHttpError: false,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64, mediaType }),
          }
        );

        if (apiResponse.status === 401) {
          auth.promptLogin();
          toast.error(
            t("apps.stuff.detail.removeBackgroundSignIn", {
              defaultValue: "Sign in to remove backgrounds.",
            })
          );
          return;
        }

        if (!apiResponse.ok) {
          const data = (await apiResponse.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          throw new Error(data.message || data.error || "remove_bg_failed");
        }

        const resultBlob = await apiResponse.blob();
        // Trim excess transparent padding so object-contain fills stage height.
        const trimmedBlob = await trimStuffCutoutTransparentPadding(resultBlob);
        const file = new File([trimmedBlob], "cover-cutout.png", {
          type: "image/png",
        });
        // applyCoverFile manages isImageBusy; keep removing flag until done.
        setIsImageBusy(false);
        await applyCoverFile(file, { coverPresentation: "cutout" });
      } catch {
        toast.error(
          t("apps.stuff.detail.removeBackgroundFailed", {
            defaultValue: "Could not remove the background.",
          })
        );
        setIsImageBusy(false);
      } finally {
        setIsRemovingBackground(false);
      }
    })();
  };

  const handleCoverDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canAcceptCoverDrop) return;
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isCoverDragOver) setIsCoverDragOver(true);
  };

  const handleCoverDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setIsCoverDragOver(false);
  };

  const handleCoverDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsCoverDragOver(false);
    if (!canAcceptCoverDrop) return;
    const file = getImageFileFromDataTransfer(event.dataTransfer);
    if (file) void applyCoverFile(file);
  };

  const handleCoverPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!canAcceptCoverDrop) return;
    const data = event.clipboardData;
    if (!clipboardMayContainImage(data)) return;

    // Claim the paste early so Chrome doesn't also insert HTML/text elsewhere.
    event.preventDefault();
    event.stopPropagation();

    const file = getImageFileFromDataTransfer(data);
    if (file) {
      void applyCoverFile(file);
      return;
    }

    const imageUrlFromClipboard = extractClipboardImageUrl(data);
    void (async () => {
      if (imageUrlFromClipboard) {
        // Prefer a real clipboard image blob when HTML only has a foreign blob: URL.
        if (imageUrlFromClipboard.toLowerCase().startsWith("blob:")) {
          const fromApi = await readCoverFromClipboardApi();
          if (fromApi) return;
        }
        await applyCoverFromClipboardUrl(imageUrlFromClipboard);
        return;
      }

      const fromApi = await readCoverFromClipboardApi();
      if (!fromApi) imageInvalidToast();
    })();
  };

  const handleRemoveImage = () => {
    onChange({
      imageDataUrl: "",
      imageUrl: "",
      coverBlobId: "",
      coverPresentation: "default",
    });
  };

  const chooseImageLabel = t("apps.stuff.detail.chooseImage", {
    defaultValue: "Choose Image…",
  });
  const pasteImageUrlLabel = t("apps.stuff.detail.pasteImageUrl", {
    defaultValue: "Paste URL…",
  });
  const removeImageLabel = t("apps.stuff.detail.removeImage", {
    defaultValue: "Remove",
  });
  const removeBackgroundLabel = t("apps.stuff.detail.removeBackground", {
    defaultValue: "Remove Background",
  });

  const overlayButtonClass = cn(
    "h-auto px-2.5 py-1 text-xs shadow-sm",
    useGeneva && "font-geneva-12",
    isWindowsTheme && "text-black"
  );

  const overlayIconButtonClass = cn(
    "size-7 shrink-0 !p-0 min-w-0",
    isWindowsTheme && "text-black"
  );

  const fieldInputClass = cn(
    "w-full rounded-sm border bg-white px-1 py-0.5 text-[11px] outline-none",
    useGeneva ? "font-geneva-12 border-black/25" : "border-black/20",
    isWindowsTheme && "text-black"
  );

  const panelShell = cn(
    "flex w-full min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden",
    "bg-white pb-2 pl-2.5 pr-2.5 pt-2",
    !isMacOSTheme && "rounded-sm border border-black/10"
  );

  return (
    <div className={panelShell}>
      <div
        className={cn(
          "mb-2 shrink-0 pb-4",
          isMacOSTheme && "border-black/15"
        )}
      >
        <div className="relative mx-auto mb-1 flex w-full items-center justify-center py-4">
          <div
            className={cn(
              "relative flex shrink-0 items-center justify-center outline-none",
              !showingBarcodePreview &&
                "group/thumb rounded-[10px] focus-within:ring-2 focus-within:ring-os-accent/40 focus-within:ring-offset-1",
              isCoverDragOver &&
                !showingBarcodePreview &&
                "ring-2 ring-os-accent/70 ring-offset-1"
            )}
            style={{
              width: previewSlotDims.width,
              height: previewSlotDims.height,
            }}
            tabIndex={showingBarcodePreview ? undefined : 0}
            aria-label={showingBarcodePreview ? undefined : chooseImageLabel}
            onDragEnter={canAcceptCoverDrop ? handleCoverDragOver : undefined}
            onDragOver={canAcceptCoverDrop ? handleCoverDragOver : undefined}
            onDragLeave={canAcceptCoverDrop ? handleCoverDragLeave : undefined}
            onDrop={canAcceptCoverDrop ? handleCoverDrop : undefined}
            onPaste={canAcceptCoverDrop ? handleCoverPaste : undefined}
          >
            {showingBarcodePreview ? (
              <div
                className="flex items-center justify-center rounded-[10px] bg-white"
                style={{
                  width: STUFF_PRODUCT_DETAIL.width,
                  height: STUFF_PRODUCT_DETAIL.height,
                }}
                aria-label={qrCodeLabel}
              >
                <QRCodeSVG
                  value={ryosPayload}
                  size={barcodeQrSize}
                  level="M"
                  includeMargin={false}
                />
              </div>
            ) : (
              <StuffItemCover
                item={item}
                tags={tags}
                size="detail"
                preview
                processing={isRemovingBackground}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp"
              className="hidden"
              onChange={handleChooseImage}
            />
            {!showingBarcodePreview ? (
              <div
                className={cn(
                  "absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-[10px]",
                  "bg-black/50 opacity-0 transition-opacity duration-150",
                  "group-hover/thumb:opacity-100 group-focus-within/thumb:opacity-100",
                  isCoverDragOver && "opacity-100",
                  (imageControlsDisabled || isCoverDragOver) &&
                    "pointer-events-none",
                  imageControlsDisabled && "opacity-40",
                  // Keep the stage visible while the cutout animates.
                  isRemovingBackground && "opacity-0"
                )}
              >
                <Button
                  type="button"
                  variant={isMacOSTheme ? "aqua" : "retro"}
                  size="sm"
                  className={overlayButtonClass}
                  disabled={imageControlsDisabled}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {chooseImageLabel}
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant={isMacOSTheme ? "secondary" : "retro"}
                    size="sm"
                    className={overlayIconButtonClass}
                    disabled={imageControlsDisabled}
                    onClick={() => setIsImageUrlDialogOpen(true)}
                    aria-label={pasteImageUrlLabel}
                    title={pasteImageUrlLabel}
                  >
                    <LinkSimple size={14} weight="bold" />
                  </Button>
                  {hasCover ? (
                    <Button
                      type="button"
                      variant={isMacOSTheme ? "secondary" : "retro"}
                      size="sm"
                      className={overlayIconButtonClass}
                      disabled={imageControlsDisabled}
                      onClick={handleRemoveBackground}
                      aria-label={removeBackgroundLabel}
                      title={removeBackgroundLabel}
                    >
                      <MagicWand size={14} weight="bold" />
                    </Button>
                  ) : null}
                  {hasCover ? (
                    <Button
                      type="button"
                      variant={isMacOSTheme ? "secondary" : "retro"}
                      size="sm"
                      className={overlayIconButtonClass}
                      disabled={imageControlsDisabled}
                      onClick={handleRemoveImage}
                      aria-label={removeImageLabel}
                      title={removeImageLabel}
                    >
                      <Trash size={14} weight="bold" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex w-full min-w-0 flex-col items-center">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setTitle(item.title);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={titleInputClass}
              placeholder={t("apps.stuff.fields.title", { defaultValue: "Title" })}
              aria-label={t("apps.stuff.fields.title", { defaultValue: "Title" })}
            />
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              onBlur={commitBrand}
              onKeyDown={(e) => e.stopPropagation()}
              className={headerMetaInputClass}
              placeholder={t("apps.stuff.fields.brand", { defaultValue: "Brand" })}
              aria-label={t("apps.stuff.fields.brand", { defaultValue: "Brand" })}
            />
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onBlur={commitBarcode}
              onKeyDown={(e) => e.stopPropagation()}
              className={cn(headerMetaInputClass, "font-mono")}
              placeholder={t("apps.stuff.fields.productBarcode", {
                defaultValue: "Product Barcode",
              })}
              aria-label={t("apps.stuff.fields.productBarcode", {
                defaultValue: "Product Barcode",
              })}
            />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            {onLookup ? (
              <Button
                type="button"
                variant={isMacOSTheme ? "aqua" : "retro"}
                size="sm"
                className={headerActionButtonClass}
                disabled={isLookingUp}
                onClick={handleLookupClick}
                aria-label={lookupLabel}
                title={lookupLabel}
              >
                <MagnifyingGlass size={14} weight="bold" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant={isMacOSTheme ? "aqua" : "retro"}
              size="sm"
              className={headerActionButtonClass}
              onClick={onPrint}
              aria-label={printLabel}
              title={printLabel}
            >
              <Printer size={14} weight="bold" />
            </Button>
            <Button
              type="button"
              variant={isMacOSTheme ? "aqua" : "retro"}
              size="sm"
              className={cn(
                headerActionButtonClass,
                showBarcodePreview && "ring-1 ring-os-accent/50"
              )}
              disabled={!canShowBarcodePreview}
              aria-pressed={showBarcodePreview}
              onClick={() => setShowBarcodePreview((prev) => !prev)}
              aria-label={qrCodeLabel}
              title={qrCodeLabel}
            >
              <QrCode size={14} weight="bold" />
            </Button>
            <Button
              type="button"
              variant={isMacOSTheme ? "aqua" : "retro"}
              size="sm"
              className={deleteActionButtonClass}
              onClick={onDelete}
              aria-label={deleteLabel}
              title={deleteLabel}
            >
              <Trash size={14} weight="bold" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-2.5">
        <FieldRow
          label={t("apps.stuff.fields.status", { defaultValue: "Status" })}
          useGeneva={useGeneva}
        >
          <Select
            value={item.status}
            onValueChange={(value) =>
              onChange({ status: value as StuffItem["status"] })
            }
          >
            <SelectTrigger
              className={cn("w-full text-[11px]", useGeneva && "font-geneva-12")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STUFF_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`apps.stuff.status.${status}`, {
                    defaultValue: stuffStatusLabelDefault(status),
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow
          label={t("apps.stuff.fields.quantity", { defaultValue: "Quantity" })}
          useGeneva={useGeneva}
        >
          <input
            type="number"
            min={1}
            className={fieldInputClass}
            value={item.quantity}
            onChange={(e) =>
              onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </FieldRow>

        <FieldRow
          label={t("apps.stuff.fields.tags", { defaultValue: "Tags" })}
          useGeneva={useGeneva}
        >
          <div className="flex flex-wrap gap-1 py-0.5">
            {tags.map((tag) => {
              const active = item.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] transition-colors hover:brightness-95",
                    active && "font-medium",
                    useGeneva && "font-geneva-12"
                  )}
                  style={tagPillStyle(tag.color, active, isDarkMode)}
                  onClick={() => toggleTag(tag.id)}
                >
                  {stuffTagDisplayName(tag, t)}
                </button>
              );
            })}
          </div>
        </FieldRow>

        <FieldRow
          label={t("apps.stuff.fields.originalPrice", {
            defaultValue: "Original",
          })}
          useGeneva={useGeneva}
        >
          <input
            type="number"
            step="0.01"
            className={fieldInputClass}
            value={item.prices.original ?? ""}
            onChange={(e) =>
              onChange({
                prices: {
                  ...item.prices,
                  original: parseOptionalNumber(e.target.value),
                },
              })
            }
          />
        </FieldRow>

        <FieldRow
          label={t("apps.stuff.fields.discountedPrice", {
            defaultValue: "Asking",
          })}
          useGeneva={useGeneva}
        >
          <input
            type="number"
            step="0.01"
            className={fieldInputClass}
            value={item.prices.discounted ?? ""}
            onChange={(e) =>
              onChange({
                prices: {
                  ...item.prices,
                  discounted: parseOptionalNumber(e.target.value),
                },
              })
            }
          />
        </FieldRow>

        <FieldRow
          label={t("apps.stuff.fields.soldPrice", { defaultValue: "Sold" })}
          useGeneva={useGeneva}
        >
          <input
            type="number"
            step="0.01"
            className={fieldInputClass}
            value={item.prices.sold ?? ""}
            onChange={(e) =>
              onChange({
                prices: {
                  ...item.prices,
                  sold: parseOptionalNumber(e.target.value),
                },
              })
            }
          />
        </FieldRow>

        <FieldRow
          label={t("apps.stuff.fields.currency", { defaultValue: "Currency" })}
          useGeneva={useGeneva}
        >
          <input
            type="text"
            className={fieldInputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            onBlur={commitCurrency}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </FieldRow>

        {(item.prices.discounted ?? item.prices.original) !== undefined && (
          <p
            className={cn(
              "pl-[76px] text-[10px] opacity-60",
              useGeneva && "font-geneva-12"
            )}
          >
            {formatMoney(
              item.prices.discounted ?? item.prices.original,
              item.prices.currency
            )}
          </p>
        )}

        <FieldRow
          label={t("apps.stuff.fields.notes", { defaultValue: "Notes" })}
          useGeneva={useGeneva}
        >
          <textarea
            className={cn(fieldInputClass, "min-h-[64px] resize-y")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </FieldRow>

        {/* Scroll end spacer — padding-bottom alone is clipped on Mobile Safari */}
        <div className="h-4 shrink-0" aria-hidden />
      </div>

      <InputDialog
        isOpen={isImageUrlDialogOpen}
        onOpenChange={(open) => {
          setIsImageUrlDialogOpen(open);
          if (!open) setImageUrl("");
        }}
        onSubmit={(value) => {
          handleApplyImageUrl(value);
        }}
        title={t("apps.stuff.detail.imageUrlDialogTitle", {
          defaultValue: "Image URL",
        })}
        description={t("apps.stuff.detail.imageUrlDialogDescription", {
          defaultValue: "Paste an image URL to use as the cover.",
        })}
        value={imageUrl}
        onChange={setImageUrl}
        isLoading={isImageBusy}
        submitLabel={t("apps.stuff.detail.applyImageUrl", {
          defaultValue: "Apply",
        })}
      />
    </div>
  );
}
