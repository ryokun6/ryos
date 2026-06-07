import type React from "react";
import type { Filter } from "../../types";

/** Props for the Paint app menubar shell (`paint-menu-bar/`). */
export interface PaintMenuBarProps {
  isWindowOpen: boolean;
  isForeground: boolean;
  onClose: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onNewFile: () => void;
  onSave: () => void;
  onImportFile: () => void;
  onExportFile: () => void;
  hasUnsavedChanges: boolean;
  currentFilePath: string | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onApplyFilter: (filter: Filter) => void;
}
