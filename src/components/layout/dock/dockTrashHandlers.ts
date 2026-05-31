import type React from "react";

export function createDockTrashHandlers(
  removeFileItem: (path: string) => void,
  setIsDraggingOverTrash: (over: boolean) => void,
) {
  const handleTrashDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes("application/json")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsDraggingOverTrash(true);
    }
  };

  const handleTrashDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTrash(false);

    try {
      const data = e.dataTransfer.getData("application/json");
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.path && parsed.path.startsWith("/Desktop/")) {
          removeFileItem(parsed.path);
        }
      }
    } catch (err) {
      console.warn("[Dock] Failed to handle trash drop:", err);
    }
  };

  const handleTrashDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTrash(false);
  };

  return {
    handleTrashDragOver,
    handleTrashDrop,
    handleTrashDragLeave,
  };
}
