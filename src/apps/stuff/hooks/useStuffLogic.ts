import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  getFilteredStuffItems,
  useStuffStore,
} from "@/stores/useStuffStore";
import { openNativeFile, saveBlobToDevice } from "@/utils/nativeFileDialogs";
import { helpItems } from "../metadata";
import type { StuffInitialData, StuffItemDraft } from "../types";
import type { ProductLookupResult } from "../utils/barcodeLookup";
import {
  enrichStuffFromLookupResult,
  enrichStuffFromQuery,
  productFieldsFromDraft,
  type EnrichedStuffDraft,
} from "../utils/enrichItemFromLookup";
import { buildStuffLookupQuery } from "../utils/buildStuffLookupQuery";
import {
  isBookLookupScan,
  tagIdsWithDefaultBooks,
} from "../utils/bookBarcode";
import {
  isItunesMusicLookupResult,
  tagIdsWithDefaultCd,
} from "../utils/cdLookupTag";
import {
  itemToLabelTarget,
  parseStuffIdBarcode,
  printStuffLabels,
  tagToLabelTarget,
} from "../utils/printLabels";
import type { ScannedBarcode } from "../components/StuffBarcodeScanner";

type ProductLookupApplyOptions = {
  itemId?: string;
  barcode?: string;
  barcodeFormat?: string;
  fallbackTitle?: string;
};

export type StuffProductLookupPickerState = {
  query: string;
  results: ProductLookupResult[];
  options: ProductLookupApplyOptions;
};

export function useStuffLogic({
  initialData,
}: {
  isWindowOpen?: boolean;
  isForeground?: boolean;
  instanceId?: string;
  initialData?: StuffInitialData;
}) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("stuff", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";

  const items = useStuffStore((s) => s.items);
  const tags = useStuffStore((s) => s.tags);
  const locations = useStuffStore((s) => s.locations);
  const selectedItemId = useStuffStore((s) => s.selectedItemId);
  const selectedTagId = useStuffStore((s) => s.selectedTagId);
  const selectedLocationId = useStuffStore((s) => s.selectedLocationId);
  const statusFilter = useStuffStore((s) => s.statusFilter);
  const shelfView = useStuffStore((s) => s.shelfView);
  const isSidebarVisible = useStuffStore((s) => s.isSidebarVisible);
  const searchQuery = useStuffStore((s) => s.searchQuery);
  const lastShareId = useStuffStore((s) => s.lastShareId);

  const setSelectedItemId = useStuffStore((s) => s.setSelectedItemId);
  const setSelectedTagId = useStuffStore((s) => s.setSelectedTagId);
  const setSelectedLocationId = useStuffStore((s) => s.setSelectedLocationId);
  const setStatusFilter = useStuffStore((s) => s.setStatusFilter);
  const setShelfView = useStuffStore((s) => s.setShelfView);
  const toggleSidebarVisibility = useStuffStore(
    (s) => s.toggleSidebarVisibility
  );
  const setSearchQuery = useStuffStore((s) => s.setSearchQuery);
  const addItem = useStuffStore((s) => s.addItem);
  const updateItem = useStuffStore((s) => s.updateItem);
  const deleteItem = useStuffStore((s) => s.deleteItem);
  const addTag = useStuffStore((s) => s.addTag);
  const deleteTag = useStuffStore((s) => s.deleteTag);
  const addLocation = useStuffStore((s) => s.addLocation);
  const deleteLocation = useStuffStore((s) => s.deleteLocation);
  const setLastShareId = useStuffStore((s) => s.setLastShareId);
  const exportShelf = useStuffStore((s) => s.exportShelf);
  const importShelf = useStuffStore((s) => s.importShelf);
  const clearShelf = useStuffStore((s) => s.clearShelf);

  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [activeShareId, setActiveShareId] = useState<string | null>(
    initialData?.shareId ?? null
  );
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [productLookupPicker, setProductLookupPicker] =
    useState<StuffProductLookupPickerState | null>(null);
  const [isApplyingLookupPick, setIsApplyingLookupPick] = useState(false);

  useEffect(() => {
    if (initialData?.shareId) {
      setActiveShareId(initialData.shareId);
    }
    if (initialData?.itemId) {
      setSelectedItemId(initialData.itemId);
    }
  }, [initialData?.shareId, initialData?.itemId, setSelectedItemId]);

  const filteredItems = useMemo(
    () =>
      getFilteredStuffItems({
        items,
        tags,
        locations,
        selectedTagId,
        selectedLocationId,
        statusFilter,
        searchQuery,
      }),
    [
      items,
      tags,
      locations,
      selectedTagId,
      selectedLocationId,
      statusFilter,
      searchQuery,
    ]
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? null;

  const itemCountsByTag = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      for (const tagId of item.tagIds) {
        counts[tagId] = (counts[tagId] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const itemCountsByLocation = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (!item.locationId) continue;
      counts[item.locationId] = (counts[item.locationId] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const handleAddItem = () => {
    addItem({ title: t("apps.stuff.newItemTitle", { defaultValue: "New Item" }) });
  };

  const handleUpdateSelected = (draft: StuffItemDraft) => {
    if (!selectedItemId) return;
    updateItem(selectedItemId, draft);
  };

  const handleDeleteSelected = () => {
    if (!selectedItemId) return;
    deleteItem(selectedItemId);
  };

  const handlePrintSelected = () => {
    if (!selectedItem) return;
    void printStuffLabels([itemToLabelTarget(selectedItem)]);
  };

  const handlePrintItemLabels = () => {
    const targets = (filteredItems.length > 0 ? filteredItems : items).map(
      itemToLabelTarget
    );
    void printStuffLabels(targets);
  };

  const handlePrintTagLabels = (tagIds?: string[]) => {
    const selected =
      tagIds && tagIds.length > 0
        ? tags.filter((tag) => tagIds.includes(tag.id))
        : selectedTagId
          ? tags.filter((tag) => tag.id === selectedTagId)
          : tags;
    void printStuffLabels(selected.map(tagToLabelTarget));
  };

  const handleClearShelf = () => {
    setIsConfirmClearOpen(true);
  };

  const confirmClearShelf = () => {
    clearShelf();
    setIsConfirmClearOpen(false);
    toast.success(
      t("apps.stuff.toasts.shelfCleared", {
        defaultValue: "Shelf Cleared",
      })
    );
  };

  const applyImportedShelfJson = (json: string) => {
    const result = importShelf(json);
    if (
      result.addedItems === 0 &&
      result.addedTags === 0 &&
      result.addedLocations === 0
    ) {
      toast.message(
        t("apps.stuff.toasts.importEmpty", {
          defaultValue: "No new items or tags found in that file",
        })
      );
      return;
    }
    toast.success(
      t("apps.stuff.toasts.importSuccess", {
        defaultValue:
          "Imported {{items}} items and {{tags}} tags ({{skipped}} skipped)",
        items: result.addedItems,
        tags: result.addedTags,
        skipped:
          result.skippedItems + result.skippedTags + result.skippedLocations,
      })
    );
  };

  const handleExportShelf = async () => {
    try {
      const json = await exportShelf();
      const blob = new Blob([json], { type: "application/json" });
      await saveBlobToDevice(
        blob,
        `stuff-shelf-${new Date().toISOString().slice(0, 10)}.json`,
        { filters: [{ name: "JSON", extensions: ["json"] }] }
      );
      toast.success(
        t("apps.stuff.toasts.exportSuccess", {
          defaultValue: "Shelf exported",
        })
      );
    } catch (error) {
      console.error("Failed to export Stuff shelf:", error);
      toast.error(
        t("apps.stuff.toasts.exportFailed", {
          defaultValue: "Couldn't export shelf",
        })
      );
    }
  };

  const handleImportShelf = async () => {
    const failImport = (error: unknown) => {
      console.error("Failed to import Stuff shelf:", error);
      toast.error(
        t("apps.stuff.toasts.importFailed", {
          defaultValue: "Couldn't import shelf — file may be invalid",
        })
      );
    };

    try {
      const file = await openNativeFile({
        title: t("apps.stuff.menu.importShelf", {
          defaultValue: "Import Shelf…",
        }),
        filters: [{ name: "JSON", extensions: ["json"] }],
        mimeType: "application/json",
      });
      if (file) {
        try {
          applyImportedShelfJson(await file.text());
        } catch (error) {
          failImport(error);
        }
        return;
      }
    } catch (error) {
      console.error("Native Stuff shelf import failed:", error);
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result;
          if (typeof json !== "string") throw new Error("empty file");
          applyImportedShelfJson(json);
        } catch (error) {
          failImport(error);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const toastForEnriched = (
    enriched: EnrichedStuffDraft,
    options: ProductLookupApplyOptions,
    toastId?: string | number
  ) => {
    const { found, imageApplied } = enriched;
    const toastMessage = (() => {
      if (!found) {
        return options.itemId
          ? t("apps.stuff.scanner.notFoundExisting", {
              defaultValue: "No Product Info Found",
            })
          : t("apps.stuff.scanner.addedWithoutMeta", {
              defaultValue: "Barcode Saved — No Product Info Found",
            });
      }
      if (imageApplied) {
        return options.itemId
          ? t("apps.stuff.scanner.updatedWithCover", {
              defaultValue: "Product Details and Cover Updated",
            })
          : t("apps.stuff.scanner.foundWithCover", {
              defaultValue: "Product Added With Cover",
            });
      }
      return options.itemId
        ? t("apps.stuff.scanner.updatedNoCover", {
            defaultValue: "Product Details Updated — No Cover Found",
          })
        : t("apps.stuff.scanner.foundNoCover", {
            defaultValue: "Product Added — No Cover Found",
          });
    })();
    toast.success(toastMessage, toastId !== undefined ? { id: toastId } : undefined);
  };

  const applyEnrichedDraft = (
    enriched: EnrichedStuffDraft,
    options: ProductLookupApplyOptions
  ) => {
    const {
      found: _found,
      source: _source,
      queryKind: _queryKind,
      imageApplied: _imageApplied,
      hadImageUrl: _hadImageUrl,
      ...draftFields
    } = enriched;

    const resolvedTitle =
      draftFields.title ||
      options.fallbackTitle ||
      (options.itemId
        ? undefined
        : t("apps.stuff.scannedItemTitle", {
            defaultValue: "Scanned Item",
          }));

    // Only product metadata — never status, tags, notes, quantity, etc.
    const productDraft = productFieldsFromDraft({
      ...draftFields,
      title: resolvedTitle,
    });

    if (options.itemId) {
      // Existing Look Up: never overwrite tags.
      updateItem(options.itemId, productDraft);
      return;
    }

    // New scan/add: Books for ISBN / bookland; CD for iTunes album hits.
    const isBook = isBookLookupScan({
      barcode: options.barcode ?? draftFields.barcode,
      barcodeFormat: options.barcodeFormat ?? draftFields.barcodeFormat,
      queryKind: enriched.queryKind,
    });
    const isCd = isItunesMusicLookupResult({ source: enriched.source });
    let tagIds: string[] | undefined;
    if (isBook) {
      tagIds = tagIdsWithDefaultBooks(undefined, addTag("Books"), true);
    }
    if (isCd) {
      tagIds = tagIdsWithDefaultCd(tagIds, addTag("CD"), true);
    }
    addItem({
      ...productDraft,
      status: "stowed",
      ...(tagIds ? { tagIds } : {}),
    });
  };

  const handleProductLookup = async (
    query: string,
    options: ProductLookupApplyOptions = {},
    mode: "title-lookup" | "barcode-scan" = "title-lookup"
  ) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLookingUp(true);
    const toastId = toast.loading(
      t("apps.stuff.scanner.lookingUp", {
        defaultValue: "Looking Up Product…",
      })
    );

    try {
      // Do not seed status/tags/notes here — lookup must not reset user fields
      // on existing items. New items default status via the store ("stowed").
      const outcome = await enrichStuffFromQuery(
        trimmed,
        {
          barcode: options.barcode,
          barcodeFormat: options.barcodeFormat,
        },
        mode
      );

      if (!outcome.autoApply) {
        toast.dismiss(toastId);
        setProductLookupPicker({
          query: trimmed,
          results: outcome.response.results,
          options,
        });
        return;
      }

      applyEnrichedDraft(outcome.autoApply, options);
      toastForEnriched(outcome.autoApply, options, toastId);
    } catch (err) {
      console.error(err);
      if (options.itemId) {
        toast.error(
          t("apps.stuff.scanner.lookupFailed", {
            defaultValue: "Product Lookup Failed",
          }),
          { id: toastId }
        );
      } else {
        const barcode = options.barcode ?? trimmed;
        const barcodeFormat = options.barcodeFormat ?? "CODE_128";
        const isBook = isBookLookupScan({ barcode, barcodeFormat });
        const tagIds = isBook
          ? tagIdsWithDefaultBooks(undefined, addTag("Books"), true)
          : undefined;
        addItem({
          title:
            options.fallbackTitle ||
            t("apps.stuff.scannedItemTitle", {
              defaultValue: "Scanned Item",
            }),
          barcode,
          barcodeFormat,
          status: "stowed",
          ...(tagIds ? { tagIds } : {}),
        });
        toast.success(
          t("apps.stuff.scanner.addedWithoutMeta", {
            defaultValue: "Barcode Saved — No Product Info Found",
          }),
          { id: toastId }
        );
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleProductLookupPick = async (result: ProductLookupResult) => {
    if (!productLookupPicker) return;
    const { options } = productLookupPicker;
    setIsApplyingLookupPick(true);
    try {
      const enriched = await enrichStuffFromLookupResult(result, {
        barcode: options.barcode,
        barcodeFormat: options.barcodeFormat,
      });
      applyEnrichedDraft(enriched, options);
      toastForEnriched(enriched, options);
      setProductLookupPicker(null);
    } catch (err) {
      console.error(err);
      toast.error(
        t("apps.stuff.scanner.lookupFailed", {
          defaultValue: "Product Lookup Failed",
        })
      );
    } finally {
      setIsApplyingLookupPick(false);
    }
  };

  const handleLookupFromFields = async (fields: {
    title: string;
    brand: string;
    barcode: string;
  }) => {
    if (!selectedItemId || !selectedItem) return;

    const query = buildStuffLookupQuery(fields);
    if (!query) {
      toast.error(
        t("apps.stuff.scanner.noLookupQuery", {
          defaultValue: "Enter a title, brand, or barcode to look up.",
        })
      );
      return;
    }

    const barcodeTrim = fields.barcode.trim() || undefined;

    await handleProductLookup(
      query,
      {
        itemId: selectedItemId,
        barcode: barcodeTrim ?? selectedItem.barcode,
        barcodeFormat: barcodeTrim
          ? selectedItem.barcodeFormat ?? "CODE_128"
          : selectedItem.barcodeFormat,
        fallbackTitle: fields.title.trim() || selectedItem.title,
      },
      "title-lookup"
    );
  };

  const handleLookupSelected = async () => {
    if (!selectedItem) return;
    await handleLookupFromFields({
      title: selectedItem.title,
      brand: selectedItem.brand ?? "",
      barcode: selectedItem.barcode ?? "",
    });
  };

  const handleScan = async (result: ScannedBarcode) => {
    const ryosId = parseStuffIdBarcode(result.text);
    if (ryosId?.kind === "item") {
      const match =
        items.find((item) => item.id === ryosId.id) ??
        items.find((item) => item.id === result.text);
      if (match) {
        setSelectedItemId(match.id);
        toast.success(
          t("apps.stuff.scanner.openedItem", {
            defaultValue: "Opened {{title}}",
            title: match.title,
          })
        );
        return;
      }
      toast.error(
        t("apps.stuff.scanner.unknownItem", {
          defaultValue: "No item found for that ryOS label.",
        })
      );
      return;
    }
    if (ryosId?.kind === "tag") {
      const match = tags.find((tag) => tag.id === ryosId.id);
      if (match) {
        setSelectedTagId(match.id);
        setSelectedItemId(null);
        toast.success(
          t("apps.stuff.scanner.openedTag", {
            defaultValue: "Filtered to {{name}}",
            name: match.name,
          })
        );
        return;
      }
      toast.error(
        t("apps.stuff.scanner.unknownTag", {
          defaultValue: "No tag found for that ryOS label.",
        })
      );
      return;
    }

    // Bare id fallback (printed CODE128 without prefix still matches).
    const bareItem = items.find((item) => item.id === result.text);
    if (bareItem) {
      setSelectedItemId(bareItem.id);
      toast.success(
        t("apps.stuff.scanner.openedItem", {
          defaultValue: "Opened {{title}}",
          title: bareItem.title,
        })
      );
      return;
    }
    const bareTag = tags.find((tag) => tag.id === result.text);
    if (bareTag) {
      setSelectedTagId(bareTag.id);
      setSelectedItemId(null);
      toast.success(
        t("apps.stuff.scanner.openedTag", {
          defaultValue: "Filtered to {{name}}",
          name: bareTag.name,
        })
      );
      return;
    }

    await handleProductLookup(
      result.text,
      {
        barcode: result.text,
        barcodeFormat: result.format,
      },
      "barcode-scan"
    );
  };

  return {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isScannerOpen,
    setIsScannerOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
    isConfirmClearOpen,
    setIsConfirmClearOpen,
    activeShareId,
    setActiveShareId,
    isLookingUp,
    productLookupPicker,
    setProductLookupPicker,
    isApplyingLookupPick,
    handleProductLookupPick,
    items,
    tags,
    locations,
    filteredItems,
    selectedItem,
    selectedItemId,
    selectedTagId,
    selectedLocationId,
    statusFilter,
    shelfView,
    isSidebarVisible,
    searchQuery,
    lastShareId,
    itemCountsByTag,
    itemCountsByLocation,
    setSelectedItemId,
    setSelectedTagId,
    setSelectedLocationId,
    setStatusFilter,
    setShelfView,
    toggleSidebarVisibility,
    setSearchQuery,
    addTag,
    deleteTag,
    addLocation,
    deleteLocation,
    deleteItem,
    setLastShareId,
    handleAddItem,
    handleUpdateSelected,
    handleDeleteSelected,
    handlePrintSelected,
    handlePrintItemLabels,
    handlePrintTagLabels,
    handleClearShelf,
    confirmClearShelf,
    handleExportShelf,
    handleImportShelf,
    handleScan,
    handleLookupSelected,
    handleLookupFromFields,
    handleProductLookup,
  };
}
