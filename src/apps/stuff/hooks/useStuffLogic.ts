import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  getFilteredStuffItems,
  useStuffStore,
} from "@/stores/useStuffStore";
import { helpItems } from "../metadata";
import type { StuffInitialData, StuffItemDraft } from "../types";
import {
  fetchImageAsDataUrl,
  lookupBarcode,
} from "../utils/barcodeLookup";
import {
  itemToLabelTarget,
  parseStuffIdBarcode,
  printStuffLabels,
  tagToLabelTarget,
} from "../utils/printLabels";
import type { ScannedBarcode } from "../components/StuffBarcodeScanner";

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
  const selectedItemId = useStuffStore((s) => s.selectedItemId);
  const selectedTagId = useStuffStore((s) => s.selectedTagId);
  const statusFilter = useStuffStore((s) => s.statusFilter);
  const shelfView = useStuffStore((s) => s.shelfView);
  const searchQuery = useStuffStore((s) => s.searchQuery);
  const lastShareId = useStuffStore((s) => s.lastShareId);

  const setSelectedItemId = useStuffStore((s) => s.setSelectedItemId);
  const setSelectedTagId = useStuffStore((s) => s.setSelectedTagId);
  const setStatusFilter = useStuffStore((s) => s.setStatusFilter);
  const setShelfView = useStuffStore((s) => s.setShelfView);
  const setSearchQuery = useStuffStore((s) => s.setSearchQuery);
  const addItem = useStuffStore((s) => s.addItem);
  const updateItem = useStuffStore((s) => s.updateItem);
  const deleteItem = useStuffStore((s) => s.deleteItem);
  const addTag = useStuffStore((s) => s.addTag);
  const deleteTag = useStuffStore((s) => s.deleteTag);
  const setLastShareId = useStuffStore((s) => s.setLastShareId);

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [activeShareId, setActiveShareId] = useState<string | null>(
    initialData?.shareId ?? null
  );
  const [isLookingUp, setIsLookingUp] = useState(false);

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
        selectedTagId,
        statusFilter,
        searchQuery,
      }),
    [items, tags, selectedTagId, statusFilter, searchQuery]
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
    printStuffLabels([itemToLabelTarget(selectedItem)]);
  };

  const handlePrintItemLabels = () => {
    const targets = (filteredItems.length > 0 ? filteredItems : items).map(
      itemToLabelTarget
    );
    printStuffLabels(targets);
  };

  const handlePrintTagLabels = (tagIds?: string[]) => {
    const selected =
      tagIds && tagIds.length > 0
        ? tags.filter((tag) => tagIds.includes(tag.id))
        : selectedTagId
          ? tags.filter((tag) => tag.id === selectedTagId)
          : tags;
    printStuffLabels(selected.map(tagToLabelTarget));
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

    setIsLookingUp(true);
    const toastId = toast.loading(
      t("apps.stuff.scanner.lookingUp", {
        defaultValue: "Looking up product…",
      })
    );
    try {
      const lookup = await lookupBarcode(result.text);
      let imageDataUrl: string | undefined;
      if (lookup.imageUrl) {
        imageDataUrl = await fetchImageAsDataUrl(lookup.imageUrl);
      }
      addItem({
        title:
          lookup.title ||
          t("apps.stuff.scannedItemTitle", {
            defaultValue: "Scanned Item",
          }),
        brand: lookup.brand,
        productUrl: lookup.productUrl,
        barcode: result.text,
        barcodeFormat: result.format,
        imageDataUrl,
        status: "stowed",
      });
      toast.success(
        lookup.found
          ? t("apps.stuff.scanner.found", {
              defaultValue: "Product added",
            })
          : t("apps.stuff.scanner.addedWithoutMeta", {
              defaultValue: "Barcode saved — no product info found",
            }),
        { id: toastId }
      );
    } catch (err) {
      console.error(err);
      addItem({
        title: t("apps.stuff.scannedItemTitle", {
          defaultValue: "Scanned Item",
        }),
        barcode: result.text,
        barcodeFormat: result.format,
        status: "stowed",
      });
      toast.success(
        t("apps.stuff.scanner.addedWithoutMeta", {
          defaultValue: "Barcode saved — no product info found",
        }),
        { id: toastId }
      );
    } finally {
      setIsLookingUp(false);
    }
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
    activeShareId,
    setActiveShareId,
    isLookingUp,
    items,
    tags,
    filteredItems,
    selectedItem,
    selectedItemId,
    selectedTagId,
    statusFilter,
    shelfView,
    searchQuery,
    lastShareId,
    itemCountsByTag,
    setSelectedItemId,
    setSelectedTagId,
    setStatusFilter,
    setShelfView,
    setSearchQuery,
    addTag,
    deleteTag,
    deleteItem,
    setLastShareId,
    handleAddItem,
    handleUpdateSelected,
    handleDeleteSelected,
    handlePrintSelected,
    handlePrintItemLabels,
    handlePrintTagLabels,
    handleScan,
  };
}
