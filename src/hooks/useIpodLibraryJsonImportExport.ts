import { useCallback } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { openNativeFile, saveBlobToDevice } from "@/utils/nativeFileDialogs";

const LIBRARY_FILENAME = "ipod-library.json";

/** Shared JSON import/export handlers for iPod store library (iPod + Karaoke menubars). */
export function useIpodLibraryJsonImportExport(
  exportLibrary: () => string,
  importLibrary: (json: string) => void,
  t: TFunction,
) {
  const handleExportLibrary = useCallback(async () => {
    try {
      const json = exportLibrary();
      const blob = new Blob([json], { type: "application/json" });
      await saveBlobToDevice(blob, LIBRARY_FILENAME, {
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      toast.success(t("apps.ipod.dialogs.libraryExportedSuccessfully"));
    } catch (error) {
      console.error("Failed to export library:", error);
      toast.error(t("apps.ipod.dialogs.failedToExportLibrary"));
    }
  }, [exportLibrary, t]);

  const importJson = useCallback(
    (json: string) => {
      importLibrary(json);
      toast.success(t("apps.ipod.dialogs.libraryImportedSuccessfully"));
    },
    [importLibrary, t]
  );

  const handleImportLibrary = useCallback(async () => {
    try {
      const file = await openNativeFile({
        title: "Import iPod Library",
        filters: [{ name: "JSON", extensions: ["json"] }],
        mimeType: "application/json",
      });
      if (file) {
        importJson(await file.text());
        return;
      }
    } catch (error) {
      console.error("Native library import failed:", error);
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          importJson(json);
        } catch (error) {
          console.error("Failed to import library:", error);
          toast.error(t("apps.ipod.dialogs.failedToImportLibrary"));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importJson, t]);

  return { handleExportLibrary, handleImportLibrary };
}
