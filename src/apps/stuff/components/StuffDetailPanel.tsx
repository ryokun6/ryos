import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LinkSimple, MagnifyingGlass, Trash } from "@phosphor-icons/react";
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
import { useThemeFlags } from "@/hooks/useThemeFlags";
import {
  STUFF_STATUSES,
  stuffItemCoverSrc,
  stuffStatusLabelDefault,
  type StuffItem,
  type StuffTag,
} from "../types";
import { formatMoney, parseOptionalNumber } from "../utils/colors";
import { encodeStuffId } from "../utils/printLabels";
import { StuffItemCover } from "./StuffItemCover";
import { readImageFileAsDataUrl } from "../utils/barcodeLookup";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ryosPayload = encodeStuffId("item", item.id);

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
  ]);

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
  const lookupButtonClass = cn(
    "size-7 shrink-0 self-center !p-0 min-w-0",
    isWindowsTheme && "text-black"
  );

  const titleInputClass = cn(
    "w-full border-0 bg-transparent p-0 outline-none focus:ring-0",
    "font-bold tracking-tight text-[#222]",
    isMacOSTheme && "font-geneva-12 text-lg leading-snug min-h-[1.35rem]",
    isSystem7Theme && !isMacOSTheme && "font-geneva-12 text-[16px] leading-snug",
    !isMacOSTheme && !isSystem7Theme && "text-base font-semibold leading-snug"
  );

  const headerMetaInputClass = cn(
    "mt-0.5 w-full border-0 bg-transparent p-0 text-[11px] text-black/45 outline-none placeholder:text-black/35 focus:ring-0",
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

  const handleChooseImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImageBusy(true);
    try {
      const imageDataUrl = await readImageFileAsDataUrl(file);
      if (!imageDataUrl) {
        toast.error(
          t("apps.stuff.detail.imageInvalid", {
            defaultValue: "Could not use that image (must be under 1.5 MB).",
          })
        );
        return;
      }
      onChange({ imageDataUrl, imageUrl: "" });
    } finally {
      setIsImageBusy(false);
    }
  };

  const handleApplyImageUrl = (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    // Hotlink for display — same path as lookup picker thumbnails / covers.
    onChange({ imageUrl: url, imageDataUrl: "" });
    setImageUrl("");
    setIsImageUrlDialogOpen(false);
  };

  const handleRemoveImage = () => {
    onChange({ imageDataUrl: "", imageUrl: "" });
  };

  const hasCover = Boolean(stuffItemCoverSrc(item));

  const chooseImageLabel = t("apps.stuff.detail.chooseImage", {
    defaultValue: "Choose Image…",
  });
  const pasteImageUrlLabel = t("apps.stuff.detail.pasteImageUrl", {
    defaultValue: "Paste URL…",
  });
  const removeImageLabel = t("apps.stuff.detail.removeImage", {
    defaultValue: "Remove",
  });

  const overlayButtonClass = cn(
    "h-auto px-2.5 py-1 text-[10px] shadow-sm",
    useGeneva && "font-geneva-12",
    isWindowsTheme && "text-black"
  );

  const overlayIconButtonClass = cn(
    "size-7 shrink-0 !p-0 min-w-0",
    isWindowsTheme && "text-black"
  );

  const imageControlsDisabled = isImageBusy || isLookingUp;

  const fieldInputClass = cn(
    "w-full rounded-sm border bg-white px-1 py-0.5 text-[11px] outline-none",
    useGeneva ? "font-geneva-12 border-black/25" : "border-black/20",
    isWindowsTheme && "text-black"
  );

  const actionButtonClass = cn(
    "w-full min-w-0 justify-center px-3 py-2 h-auto text-[12px] leading-normal",
    useGeneva && "font-geneva-12",
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
          "mb-2 shrink-0 border-b border-black/20 pb-2",
          isMacOSTheme && "border-black/15"
        )}
      >
        <div
          className="group/thumb relative mx-auto mb-2 w-fit rounded-[10px] outline-none focus-within:ring-2 focus-within:ring-os-accent/40 focus-within:ring-offset-1"
          tabIndex={0}
        >
          <StuffItemCover item={item} tags={tags} size="detail" preview />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChooseImage}
          />
          <div
            className={cn(
              "absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-[10px]",
              "bg-black/50 opacity-0 transition-opacity duration-150",
              "group-hover/thumb:opacity-100 group-focus-within/thumb:opacity-100",
              imageControlsDisabled && "pointer-events-none opacity-40"
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
                  onClick={handleRemoveImage}
                  aria-label={removeImageLabel}
                  title={removeImageLabel}
                >
                  <Trash size={14} weight="bold" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
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
          {onLookup ? (
            <Button
              type="button"
              variant={isMacOSTheme ? "aqua" : "retro"}
              size="sm"
              className={lookupButtonClass}
              disabled={isLookingUp}
              onClick={handleLookupClick}
              aria-label={lookupLabel}
              title={lookupLabel}
            >
              <MagnifyingGlass size={14} weight="bold" />
            </Button>
          ) : null}
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
                  {tag.name}
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
          label={t("apps.stuff.fields.ryosLabel", { defaultValue: "ryOS Label" })}
          useGeneva={useGeneva}
        >
          <div className="flex flex-col items-start gap-1.5 pb-0.5">
            <div className="rounded-sm bg-white p-1.5">
              <QRCodeSVG
                value={ryosPayload}
                size={96}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="break-all font-mono text-[9px] leading-snug opacity-50">
              {ryosPayload}
            </p>
          </div>
        </FieldRow>

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

        <div className="mt-1 flex shrink-0 flex-col gap-2">
          <Button
            type="button"
            variant={isMacOSTheme ? "aqua" : "retro"}
            size="sm"
            className={actionButtonClass}
            onClick={onPrint}
          >
            {t("apps.stuff.detail.print", { defaultValue: "Print" })}
          </Button>
          <Button
            type="button"
            variant={isMacOSTheme ? "destructive" : "retro"}
            size="sm"
            className={cn(
              actionButtonClass,
              !isMacOSTheme && "text-red-600 hover:text-red-700"
            )}
            onClick={onDelete}
          >
            {t("apps.stuff.detail.delete", { defaultValue: "Delete" })}
          </Button>
        </div>

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
