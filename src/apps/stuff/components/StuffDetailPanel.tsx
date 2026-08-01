import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { STUFF_STATUSES, type StuffItem, type StuffTag } from "../types";
import { formatMoney, parseOptionalNumber } from "../utils/colors";
import { renderStuffIdBarcodeSvg } from "../utils/printLabels";

interface StuffDetailPanelProps {
  item: StuffItem;
  tags: StuffTag[];
  onChange: (draft: Partial<StuffItem>) => void;
  onDelete: () => void;
  onPrint: () => void;
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
    <div className="flex w-full min-h-[22px] items-start gap-2">
      <span
        className={cn(
          "w-[52px] shrink-0 pt-0.5 text-right text-[11px] font-bold leading-tight text-[#222]",
          useGeneva && "font-geneva-12"
        )}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
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
}: StuffDetailPanelProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isSystem7Theme, isWindowsTheme } = useThemeFlags();
  const useGeneva = isMacOSTheme || isSystem7Theme;

  const [title, setTitle] = useState(item.title);
  const [brand, setBrand] = useState(item.brand ?? "");
  const [notes, setNotes] = useState(item.notes);
  const [barcode, setBarcode] = useState(item.barcode ?? "");
  const [currency, setCurrency] = useState(item.prices.currency);
  const [ryosBarcodeSvg, setRyosBarcodeSvg] = useState<string | null>(null);

  useEffect(() => {
    setTitle(item.title);
    setBrand(item.brand ?? "");
    setNotes(item.notes);
    setBarcode(item.barcode ?? "");
    setCurrency(item.prices.currency);
  }, [
    item.id,
    item.updatedAt,
    item.title,
    item.brand,
    item.notes,
    item.barcode,
    item.prices.currency,
  ]);

  useEffect(() => {
    let cancelled = false;
    setRyosBarcodeSvg(null);
    void renderStuffIdBarcodeSvg("item", item.id).then((svg) => {
      if (!cancelled) setRyosBarcodeSvg(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

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

  const titleInputClass = cn(
    "w-full border-0 bg-transparent p-0 outline-none focus:ring-0",
    "font-bold tracking-tight text-[#222]",
    isMacOSTheme && "font-geneva-12 text-lg leading-snug min-h-[1.35rem]",
    isSystem7Theme && !isMacOSTheme && "font-geneva-12 text-[16px] leading-snug",
    !isMacOSTheme && !isSystem7Theme && "text-base font-semibold leading-snug"
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
          "mb-2 shrink-0 border-b border-black/20 pb-2",
          isMacOSTheme && "border-black/15"
        )}
      >
        {item.imageDataUrl ? (
          <img
            src={item.imageDataUrl}
            alt=""
            className="mb-2 mx-auto max-h-28 rounded object-contain"
          />
        ) : null}
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
          className={cn(
            "mt-0.5 w-full border-0 bg-transparent p-0 text-[11px] text-black/45 outline-none placeholder:text-black/35 focus:ring-0",
            useGeneva && "font-geneva-12"
          )}
          placeholder={t("apps.stuff.fields.brand", { defaultValue: "Brand" })}
          aria-label={t("apps.stuff.fields.brand", { defaultValue: "Brand" })}
        />
      </div>

      <div className="flex min-h-0 flex-col gap-2">
        <FieldRow
          label={t("apps.stuff.fields.status", { defaultValue: "Status" })}
          useGeneva={useGeneva}
        >
          <select
            className={fieldInputClass}
            value={item.status}
            onChange={(e) =>
              onChange({ status: e.target.value as StuffItem["status"] })
            }
          >
            {STUFF_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`apps.stuff.status.${status}`, {
                  defaultValue: status.replace(/_/g, " "),
                })}
              </option>
            ))}
          </select>
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
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => {
              const active = item.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[10px]",
                    useGeneva && "font-geneva-12"
                  )}
                  style={{
                    backgroundColor: active ? tag.color : "transparent",
                    color: active ? "#fff" : undefined,
                    border: `1px solid ${tag.color}`,
                  }}
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
              "pl-[60px] text-[10px] opacity-60",
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
          label={t("apps.stuff.fields.productBarcode", {
            defaultValue: "Barcode",
          })}
          useGeneva={useGeneva}
        >
          <input
            type="text"
            className={cn(fieldInputClass, "font-mono")}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onBlur={commitBarcode}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </FieldRow>

        <FieldRow
          label={t("apps.stuff.fields.ryosLabel", { defaultValue: "ryOS" })}
          useGeneva={useGeneva}
        >
          {ryosBarcodeSvg ? (
            <div
              className="max-w-full overflow-hidden rounded-sm bg-white [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: ryosBarcodeSvg }}
            />
          ) : (
            <div className="h-10 animate-pulse rounded-sm bg-black/5" />
          )}
          <p className="mt-0.5 break-all font-mono text-[9px] leading-tight opacity-40">
            {item.id}
          </p>
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

        <div className="mt-1 flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-7 flex-1 text-[11px]",
              useGeneva && "font-geneva-12"
            )}
            onClick={onPrint}
          >
            {t("apps.stuff.detail.print", { defaultValue: "Print" })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 flex-1 text-[11px] text-red-600 hover:text-red-700",
              useGeneva && "font-geneva-12"
            )}
            onClick={onDelete}
          >
            {t("apps.stuff.detail.delete", { defaultValue: "Delete" })}
          </Button>
        </div>

        {/* Scroll end spacer — padding-bottom alone is clipped on Mobile Safari */}
        <div className="h-3 shrink-0" aria-hidden />
      </div>
    </div>
  );
}
