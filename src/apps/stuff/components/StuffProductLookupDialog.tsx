import React, { useCallback, useEffect, useReducer, type CSSProperties } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { ProductLookupResult } from "../utils/barcodeLookup";

const listStyle: CSSProperties = {
  border: "1px solid var(--os-color-input-border)",
  borderRadius: "6px",
  backgroundColor: "var(--os-color-input-bg)",
  overflowX: "hidden",
};

function rowStyle(
  index: number,
  selected: boolean,
  fontStyle?: CSSProperties
): CSSProperties {
  return {
    ...fontStyle,
    padding: "6px 8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    boxSizing: "border-box",
    background: selected
      ? undefined
      : index % 2 === 1
        ? "var(--os-color-list-row-alt-bg)"
        : "var(--os-color-input-bg)",
  };
}

function sourceLabel(source?: string): string {
  switch (source) {
    case "upcitemdb":
      return "UPCitemdb";
    case "openlibrary":
      return "Open Library";
    case "google_books":
      return "Google Books";
    case "openfoodfacts":
      return "Open Food Facts";
    case "openproductsfacts":
      return "Open Products Facts";
    case "duckduckgo_images":
      return "DuckDuckGo";
    case "wikipedia":
      return "Wikipedia";
    case "amazon":
      return "Amazon";
    case "apple":
      return "Apple";
    case "itunes":
    case "itunes_music":
      return "iTunes";
    default:
      return source?.trim() || "";
  }
}

function formatPrice(result: ProductLookupResult): string | null {
  if (
    typeof result.originalPrice !== "number" ||
    !Number.isFinite(result.originalPrice) ||
    result.originalPrice <= 0
  ) {
    return null;
  }
  const currency = result.currency?.trim() || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(result.originalPrice);
  } catch {
    return `${currency} ${result.originalPrice}`;
  }
}

function resultThumbnail(result: ProductLookupResult): string | undefined {
  return result.imageDataUrl || result.imageUrl;
}

function resultKey(result: ProductLookupResult, index: number): string {
  return [
    result.source ?? "unknown",
    result.isbn ?? "",
    result.productUrl ?? "",
    result.title ?? "",
    String(index),
  ].join("|");
}

export interface StuffProductLookupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  results: ProductLookupResult[];
  isApplying?: boolean;
  error?: string | null;
  onSelect: (result: ProductLookupResult) => void;
}

type PickerState = {
  selectedIndex: number;
};

type PickerAction =
  | { type: "reset" }
  | { type: "setSelectedIndex"; index: number };

export function StuffProductLookupDialog({
  isOpen,
  onOpenChange,
  query,
  results,
  isApplying = false,
  error = null,
  onSelect,
}: StuffProductLookupDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme: isMacTheme } = useThemeFlags();

  const [state, dispatch] = useReducer(
    (current: PickerState, action: PickerAction): PickerState => {
      switch (action.type) {
        case "reset":
          return { selectedIndex: results.length > 0 ? 0 : -1 };
        case "setSelectedIndex":
          return { selectedIndex: action.index };
        default:
          return current;
      }
    },
    { selectedIndex: -1 }
  );
  const { selectedIndex } = state;

  useEffect(() => {
    if (isOpen) {
      dispatch({ type: "reset" });
    }
  }, [isOpen, results]);

  const bodyTextClass = cn(
    isWindowsTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
      : "font-geneva-12 text-[12px]"
  );
  const bodyTextStyle: CSSProperties | undefined = isWindowsTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const handleUseSelected = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      onSelect(results[selectedIndex]);
    }
  }, [selectedIndex, results, onSelect]);

  const handleSelectAndUse = useCallback(
    (index: number) => {
      if (index >= 0 && index < results.length) {
        dispatch({ type: "setSelectedIndex", index });
        onSelect(results[index]);
      }
    },
    [results, onSelect]
  );

  const handleDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  const title = t("apps.stuff.dialogs.productLookup.title", {
    defaultValue: "Choose Product",
  });
  const description = t("apps.stuff.dialogs.productLookup.description", {
    defaultValue: 'Select a match for "{{query}}"',
    query,
  });

  const dialogContent = (
    <div className={isWindowsTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn("text-neutral-500 mb-2", bodyTextClass)}
        style={bodyTextStyle}
        id="stuff-product-lookup-description"
      >
        {description}
      </p>

      {error ? (
        <p
          className={cn("text-red-600 mb-2", bodyTextClass)}
          style={bodyTextStyle}
        >
          {error}
        </p>
      ) : null}

      {results.length === 0 && !error ? (
        <p
          className={cn("text-neutral-500 mb-2", bodyTextClass)}
          style={bodyTextStyle}
        >
          {t("apps.stuff.dialogs.productLookup.noResults", {
            defaultValue: "No products found",
          })}
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="mb-3">
          <p
            className={cn("text-neutral-500 mb-2", bodyTextClass)}
            style={bodyTextStyle}
          >
            {t("apps.stuff.dialogs.productLookup.selectResult", {
              defaultValue: "Select a result:",
            })}
          </p>
          <div
            style={{
              ...listStyle,
              height: "220px",
              overflowY: "auto",
            }}
          >
            {results.map((result, index) => {
              const thumb = resultThumbnail(result);
              const rowSelected = selectedIndex === index;
              const price = formatPrice(result);
              const source = sourceLabel(result.source);
              const subtitleParts = [
                result.brand,
                price,
                source,
                result.isbn,
              ].filter(Boolean);

              return (
                <div
                  key={resultKey(result, index)}
                  onClick={() =>
                    dispatch({ type: "setSelectedIndex", index })
                  }
                  onDoubleClick={() => handleSelectAndUse(index)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectAndUse(index);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={cn("w-full", bodyTextClass)}
                  data-selected={rowSelected ? "true" : undefined}
                  style={rowStyle(index, rowSelected, bodyTextStyle)}
                >
                  <div
                    className={cn(
                      "flex-shrink-0 w-9 h-9 overflow-hidden",
                      isWindowsTheme
                        ? "border border-neutral-400"
                        : "rounded-sm"
                    )}
                    style={{
                      backgroundColor: "var(--os-color-list-row-alt-bg)",
                    }}
                    aria-hidden="true"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (
                            e.currentTarget as HTMLImageElement
                          ).style.visibility = "hidden";
                        }}
                        draggable={false}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{result.title}</div>
                    {subtitleParts.length > 0 ? (
                      <div
                        className="truncate"
                        style={{
                          opacity: rowSelected ? 0.8 : 1,
                          color: rowSelected
                            ? undefined
                            : "var(--os-color-text-secondary)",
                        }}
                      >
                        {subtitleParts.join(" • ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <DialogFooter className="mt-4 gap-1.5 sm:justify-end">
        <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
          <Button
            variant={isMacTheme ? "secondary" : "retro"}
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
            className={cn(
              "w-full sm:w-auto",
              !isMacTheme && "h-7",
              bodyTextClass
            )}
            style={bodyTextStyle}
          >
            {t("common.dialog.cancel")}
          </Button>
          {results.length > 0 ? (
            <Button
              variant={isMacTheme ? "default" : "retro"}
              onClick={handleUseSelected}
              disabled={isApplying || selectedIndex < 0}
              className={cn(
                "w-full sm:w-auto",
                !isMacTheme && "h-7",
                bodyTextClass
              )}
              style={bodyTextStyle}
            >
              {isApplying
                ? t("apps.stuff.dialogs.productLookup.applying", {
                    defaultValue: "Applying…",
                  })
                : t("apps.stuff.dialogs.productLookup.useSelected", {
                    defaultValue: "Use Selected",
                  })}
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[600px]", isWindowsTheme && "p-0 overflow-hidden")}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={handleDialogKeyDown}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">
              {description}
            </DialogDescription>
            <DialogHeader>{title}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">
              {description}
            </DialogDescription>
            <DialogHeader>{title}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {description}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
