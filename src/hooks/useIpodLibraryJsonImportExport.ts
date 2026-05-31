import { useCallback } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";

const LIBRARY_FILENAME = "ipod-library.json";

/** Shared JSON import/export handlers for iPod store library (iPod + Karaoke menubars). */
export function useIpodLibraryJsonImportExport(
  exportLibrary: () => string,
  importLibrary: (json: string) => void,
  t: TFunction,
) {
  const handleExportLibrary = useCallback(() => {
    try {
      const json = exportLibrary();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = LIBRARY_FILENAME;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("apps.ipod.dialogs.libraryExportedSuccessfully"));
    } catch (error) {
      console.error("Failed to export library:", error);
      toast.error(t("apps.ipod.dialogs.failedToExportLibrary"));
    }
  }, [exportLibrary, t]);

  const handleImportLibrary = useCallback(() => {
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
          importLibrary(json);
          toast.success(t("apps.ipod.dialogs.libraryImportedSuccessfully"));
        } catch (error) {
          console.error("Failed to import library:", error);
          toast.error(t("apps.ipod.dialogs.failedToImportLibrary"));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importLibrary, t]);

  return { handleExportLibrary, handleImportLibrary };
}
