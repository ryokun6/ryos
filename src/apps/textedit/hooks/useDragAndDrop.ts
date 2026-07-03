import { useState, useCallback } from "react";

interface UseDragAndDropProps {
  hasUnsavedChanges: boolean;
  onFileDropped: (file: File) => Promise<void>;
  onConfirmOverwrite: (file: File) => void;
}

export function useDragAndDrop({
  hasUnsavedChanges,
  onFileDropped,
  onConfirmOverwrite,
}: UseDragAndDropProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  }, [isDraggingOver]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're leaving to a child element
    const relatedTarget = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(relatedTarget)) {
      return;
    }
    setIsDraggingOver(false);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Only accept text and markdown files
    if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
      return;
    }

    // If there are unsaved changes, prompt the user
    if (hasUnsavedChanges) {
      onConfirmOverwrite(file);
    } else {
      await onFileDropped(file);
    }
  }, [hasUnsavedChanges, onFileDropped, onConfirmOverwrite]);

  const dragHandlers = {
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDragEnd: handleDragEnd,
    onMouseLeave: handleMouseLeave,
    onDrop: handleFileDrop,
  };

  return {
    isDraggingOver,
    dragHandlers,
  };
}