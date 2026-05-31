import React, { useState } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const { isWindowsTheme: isXpTheme, isMacOSTheme: isMacOsxTheme } =
    useThemeFlags();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const appId = "paint";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;

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
