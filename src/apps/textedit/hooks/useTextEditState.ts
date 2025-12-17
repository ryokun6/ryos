import { useCallback, useEffect } from "react";
import { JSONContent } from "@tiptap/core";
import { useTextEditStore } from "@/stores/useTextEditStore";

interface UseTextEditStateProps {
  instanceId: string;
}

export function useTextEditState({ instanceId }: UseTextEditStateProps) {
  // Store actions
  const createTextEditInstance = useTextEditStore(
    (state) => state.createInstance
  );
  const removeTextEditInstance = useTextEditStore(
    (state) => state.removeInstance
  );
  const updateTextEditInstance = useTextEditStore(
    (state) => state.updateInstance
  );
  const textEditInstances = useTextEditStore((state) => state.instances);

  // Create instance when component mounts
  useEffect(() => {
    createTextEditInstance(instanceId);
  }, [instanceId, createTextEditInstance]);

  // Clean up instance when component unmounts
  useEffect(() => {
    return () => {
      removeTextEditInstance(instanceId);
    };
  }, [instanceId, removeTextEditInstance]);

  // Get current instance data
  const currentInstance = textEditInstances[instanceId] || null;

  // Instance state
  const currentFilePath = currentInstance?.filePath || null;
  const contentJson = currentInstance?.contentJson || null;
  const hasUnsavedChanges = currentInstance?.hasUnsavedChanges || false;

  const setCurrentFilePath = useCallback(
    (path: string | null) => {
      updateTextEditInstance(instanceId, { filePath: path });
    },
    [instanceId, updateTextEditInstance]
  );

  const setContentJson = useCallback(
    (json: JSONContent | null) => {
      updateTextEditInstance(instanceId, { contentJson: json });
    },
    [instanceId, updateTextEditInstance]
  );

  const setHasUnsavedChanges = useCallback(
    (val: boolean) => {
      updateTextEditInstance(instanceId, { hasUnsavedChanges: val });
    },
    [instanceId, updateTextEditInstance]
  );

  return {
    // Current state
    currentFilePath,
    contentJson,
    hasUnsavedChanges,
    currentInstance,

    // State setters
    setCurrentFilePath,
    setContentJson,
    setHasUnsavedChanges,

    // Instance management
    instanceId,
  };
}