import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const textEditSource = readFileSync(
  "src/apps/textedit/hooks/useFileOperations.ts",
  "utf8"
);
const paintSource = readFileSync(
  "src/apps/paint/hooks/usePaintLogic.ts",
  "utf8"
);
const appletSource = readFileSync(
  "src/apps/applet-viewer/hooks/useAppletViewerLogic.ts",
  "utf8"
);
const fileMetadataServiceSource = readFileSync(
  "src/services/vfs/FileMetadataService.ts",
  "utf8"
);

describe("VFS service wiring", () => {
  test("TextEdit uses VFS services for save/load", () => {
    expect(textEditSource).toContain("@/services/vfs/useVfsFileOperations");
    expect(textEditSource).toContain("@/services/vfs/FileContentRepository");
    expect(textEditSource).not.toContain("@/apps/finder/hooks/useFileSystem");
    expect(textEditSource).not.toContain("@/utils/indexedDB");
  });

  test("Paint uses VFS services for save/load", () => {
    expect(paintSource).toContain("@/services/vfs/useVfsFileOperations");
    expect(paintSource).toContain("@/services/vfs/FileContentRepository");
    expect(paintSource).not.toContain("@/apps/finder/hooks/useFileSystem");
    expect(paintSource).not.toContain("@/utils/indexedDB");
  });

  test("Applet Viewer uses VFS services for metadata/content I/O", () => {
    expect(appletSource).toContain("@/services/vfs/useVfsFileOperations");
    expect(appletSource).toContain("@/services/vfs/FileMetadataService");
    expect(appletSource).toContain("@/services/vfs/FileContentRepository");
    expect(appletSource).not.toContain("@/apps/finder/hooks/useFileSystem");
    expect(appletSource).not.toContain("dbOperations.");
  });

  test("VFS metadata path selector caches derived arrays", () => {
    expect(fileMetadataServiceSource).toContain(
      'import { useShallow } from "zustand/react/shallow";'
    );
    expect(fileMetadataServiceSource).toContain(
      "useFilesStore(useShallow((state) => state.getItemsInPath(path)))"
    );
    expect(fileMetadataServiceSource).not.toContain(
      "useFilesStore((state) => state.getItemsInPath(path))"
    );
  });
});
