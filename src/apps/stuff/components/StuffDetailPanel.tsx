import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STUFF_STATUSES, type StuffItem, type StuffTag } from "../types";
import { formatMoney, parseOptionalNumber } from "../utils/colors";
import { renderStuffIdBarcodeSvg } from "../utils/printLabels";

interface StuffDetailPanelProps {
  item: StuffItem;
  tags: StuffTag[];
  onClose: () => void;
  onChange: (draft: Partial<StuffItem>) => void;
  onDelete: () => void;
  onPrint: () => void;
}

export function StuffDetailPanel({
  item,
  tags,
  onClose,
  onChange,
  onDelete,
  onPrint,
}: StuffDetailPanelProps) {
  const { t } = useTranslation();
  const [ryosBarcodeSvg, setRyosBarcodeSvg] = useState<string | null>(null);

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

  const toggleTag = (tagId: string) => {
    const next = item.tagIds.includes(tagId)
      ? item.tagIds.filter((id) => id !== tagId)
      : [...item.tagIds, tagId];
    onChange({ tagIds: next });
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-black/15 bg-os-window-bg dark:border-white/10">
      <div className="flex items-center justify-between border-b border-black/10 px-3 py-2 dark:border-white/10">
        <h2 className="truncate font-apple-garamond text-lg">
          {t("apps.stuff.detail.title", { defaultValue: "Details" })}
        </h2>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {item.imageDataUrl ? (
          <img
            src={item.imageDataUrl}
            alt=""
            className="mx-auto max-h-40 rounded object-contain"
          />
        ) : null}

        <label className="block text-xs font-medium opacity-70">
          {t("apps.stuff.fields.title", { defaultValue: "Title" })}
          <Input
            className="mt-1"
            value={item.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>

        <label className="block text-xs font-medium opacity-70">
          {t("apps.stuff.fields.brand", { defaultValue: "Brand" })}
          <Input
            className="mt-1"
            value={item.brand ?? ""}
            onChange={(e) => onChange({ brand: e.target.value || undefined })}
          />
        </label>

        <label className="block text-xs font-medium opacity-70">
          {t("apps.stuff.fields.status", { defaultValue: "Status" })}
          <select
            className="mt-1 w-full rounded border border-input bg-transparent px-2 py-1.5 text-sm"
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
        </label>

        <label className="block text-xs font-medium opacity-70">
          {t("apps.stuff.fields.quantity", { defaultValue: "Quantity" })}
          <Input
            className="mt-1"
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) =>
              onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-medium opacity-70">
            {t("apps.stuff.fields.tags", { defaultValue: "Tags" })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const active = item.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className="rounded-full px-2 py-0.5 text-xs"
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
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium opacity-70">
            {t("apps.stuff.fields.originalPrice", {
              defaultValue: "Original",
            })}
            <Input
              className="mt-1"
              type="number"
              step="0.01"
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
          </label>
          <label className="block text-xs font-medium opacity-70">
            {t("apps.stuff.fields.discountedPrice", {
              defaultValue: "Asking",
            })}
            <Input
              className="mt-1"
              type="number"
              step="0.01"
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
          </label>
          <label className="block text-xs font-medium opacity-70">
            {t("apps.stuff.fields.soldPrice", { defaultValue: "Sold" })}
            <Input
              className="mt-1"
              type="number"
              step="0.01"
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
          </label>
          <label className="block text-xs font-medium opacity-70">
            {t("apps.stuff.fields.currency", { defaultValue: "Currency" })}
            <Input
              className="mt-1"
              value={item.prices.currency}
              onChange={(e) =>
                onChange({
                  prices: {
                    ...item.prices,
                    currency: e.target.value.toUpperCase() || "USD",
                  },
                })
              }
            />
          </label>
        </div>

        {(item.prices.discounted ?? item.prices.original) !== undefined && (
          <p className="text-xs opacity-70">
            {formatMoney(
              item.prices.discounted ?? item.prices.original,
              item.prices.currency
            )}
          </p>
        )}

        <label className="block text-xs font-medium opacity-70">
          {t("apps.stuff.fields.productBarcode", {
            defaultValue: "Product barcode",
          })}
          <Input
            className="mt-1 font-mono text-xs"
            value={item.barcode ?? ""}
            onChange={(e) =>
              onChange({
                barcode: e.target.value || undefined,
                barcodeFormat: e.target.value
                  ? item.barcodeFormat ?? "CODE_128"
                  : undefined,
              })
            }
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-medium opacity-70">
            {t("apps.stuff.fields.ryosLabel", {
              defaultValue: "ryOS label",
            })}
          </p>
          {ryosBarcodeSvg && (
            <div
              className="rounded bg-white p-2"
              dangerouslySetInnerHTML={{ __html: ryosBarcodeSvg }}
            />
          )}
          <p className="mt-1 break-all font-mono text-[10px] opacity-50">
            {item.id}
          </p>
        </div>

        <label className="block text-xs font-medium opacity-70">
          {t("apps.stuff.fields.notes", { defaultValue: "Notes" })}
          <Textarea
            className="mt-1 min-h-[80px]"
            value={item.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </label>
      </div>

      <div className="flex gap-2 border-t border-black/10 p-3 dark:border-white/10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onPrint}
        >
          {t("apps.stuff.detail.print", { defaultValue: "Print" })}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={onDelete}
        >
          {t("apps.stuff.detail.delete", { defaultValue: "Delete" })}
        </Button>
      </div>
    </aside>
  );
}
