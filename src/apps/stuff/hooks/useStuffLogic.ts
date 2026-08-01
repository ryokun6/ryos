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
import { printStuffLabels } from "../utils/printLabels";
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
    printStuffLabels([selectedItem]);
  };

  const handlePrintAllWithBarcodes = () => {
    const printable = filteredItems.filter((item) => item.barcode);
    printStuffLabels(printable.length > 0 ? printable : items.filter((i) => i.barcode));
  };

  const handleScan = async (result: ScannedBarcode) => {
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
    handlePrintAllWithBarcodes,
    handleScan,
  };
}
