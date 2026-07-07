import { useEffect, useMemo, useState } from "react";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { useFilesStore } from "@/stores/useFilesStore";
import { isWritablePath } from "@/services/vfs/pathPolicy";
import { getTranslatedFolderName } from "@/utils/i18n";
import { useTranslation } from "react-i18next";

interface WritableDirectory {
  path: string;
  name: string;
  depth: number;
}

const getParentPath = (path: string): string => {
  if (path === "/") return "/";
  const lastSlash = path.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : path.substring(0, lastSlash);
};

/**
 * All writable directories in the VFS, depth-first, so the list reads like an
 * indented tree (system folders like /Documents plus user-created folders).
 */
export function useWritableDirectories(): WritableDirectory[] {
  const items = useFilesStore((state) => state.items);

  return useMemo(() => {
    const result: WritableDirectory[] = [];
    const directories = Object.values(items).filter(
      (item) => item.isDirectory && item.status === "active"
    );

    const walk = (parent: string, depth: number) => {
      const children = directories
        .filter((item) => getParentPath(item.path) === parent)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) {
        if (!isWritablePath(child.path)) continue;
        result.push({ path: child.path, name: child.name, depth });
        walk(child.path, depth + 1);
      }
    };

    walk("/", 0);
    return result;
  }, [items]);
}

interface SaveFileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (fileName: string, directoryPath: string) => void;
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  /** Directory preselected when the dialog opens (e.g. "/Documents"). */
  defaultDirectory: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  additionalActions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "retro" | "destructive";
    position?: "left" | "right";
  }>;
  submitLabel?: string;
}

/**
 * Filename prompt with a save-location picker listing all writable VFS
 * directories (system folders and user-created folders).
 */
export function SaveFileDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  title,
  description,
  value,
  onChange,
  defaultDirectory,
  isLoading,
  errorMessage,
  additionalActions,
  submitLabel,
}: SaveFileDialogProps) {
  const { t } = useTranslation();
  const directories = useWritableDirectories();
  const [directory, setDirectory] = useState(defaultDirectory);

  // Re-anchor to the default whenever the dialog is (re)opened
  useEffect(() => {
    if (isOpen) {
      setDirectory(defaultDirectory);
    }
  }, [isOpen, defaultDirectory]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const opts = directories.map((dir) => {
      seen.add(dir.path);
      const translated =
        dir.depth === 0 ? getTranslatedFolderName(dir.path) : dir.name;
      return {
        value: dir.path,
        label: `${"\u00A0".repeat(dir.depth * 3)}${translated}`,
      };
    });
    // Keep the current default selectable even if it's not in the writable
    // list (e.g. an app-managed location).
    if (defaultDirectory && !seen.has(defaultDirectory)) {
      opts.unshift({ value: defaultDirectory, label: defaultDirectory });
    }
    return opts;
  }, [directories, defaultDirectory]);

  return (
    <InputDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={(fileName) => onSubmit(fileName, directory)}
      title={title}
      description={description}
      value={value}
      onChange={onChange}
      isLoading={isLoading}
      errorMessage={errorMessage}
      additionalActions={additionalActions}
      submitLabel={submitLabel}
      selectLabel={t("common.dialog.where")}
      selectOptions={options}
      selectValue={directory}
      onSelectChange={setDirectory}
    />
  );
}
