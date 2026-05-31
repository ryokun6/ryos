import React from "react";
import { useTranslation } from "react-i18next";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import type { PaintMenuBarProps } from "./types";

export type PaintMenuBarViewModel = ReturnType<typeof usePaintMenuBar>;

export function usePaintMenuBar(props: PaintMenuBarProps) {
  const {
    isWindowOpen,
    onClose,
    onShowHelp,
    onShowAbout,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onClear,
    onNewFile,
    onSave,
    onImportFile,
    onExportFile,
    currentFilePath,
    handleFileSelect,
    onCut,
    onCopy,
    onPaste,
    onApplyFilter,
  } = props;

  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("paint");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return {
    t,
    isWindowOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    fileInputRef,
    appId,
    appName,
    onClose,
    onShowHelp,
    onShowAbout,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onClear,
    onNewFile,
    onSave,
    onImportFile,
    onExportFile,
    currentFilePath,
    handleFileSelect,
    onCut,
    onCopy,
    onPaste,
    onApplyFilter,
  };
}
