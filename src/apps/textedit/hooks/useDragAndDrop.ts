import { useState, useCallback } from "react";
import { markdownToHtml } from "@/utils/markdown";

interface UseDragAndDropProps {
  hasUnsavedChanges: boolean;
  onFileDropped: (file: File) => Promise<void>;
  onConfirmOverwrite: () => void;
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

    const filePath = `/Documents/${file.name}`;
    const text = await file.text();

    // Convert content based on file type
    let content;
    if (file.name.endsWith(".html")) {
      content = text;
    } else if (file.name.endsWith(".md")) {
      content = markdownToHtml(text);
    } else {
      content = `<p>${text}</p>`;
    }

    // If there are unsaved changes, prompt the user
    if (hasUnsavedChanges) {
      // Store the dropped file temporarily
      localStorage.setItem(
        "ryos:pending-file-open",
        JSON.stringify({
          path: filePath,
          content: content,
        })
      );
      onConfirmOverwrite();
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