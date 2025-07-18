import { useState, useEffect, useRef, useCallback } from "react";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ResEditMenuBar } from "./ResEditMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata, helpItems } from "..";
import { useResEditStore, ResourceItem } from "@/stores/useResEditStore";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useAppStore } from "@/stores/useAppStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { AppId } from "@/config/appIds";
import { ChevronRight, ChevronDown, Plus, Trash2, Edit3, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define the type for ResEdit initial data
interface ResEditInitialData {
  path?: string;
  resources?: ResourceItem[];
}

// Function to remove file extension
const removeFileExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};



// Helper function to generate suggested filename
const generateSuggestedFilename = (
  customTitle: string | undefined,
  resources: ResourceItem[]
): string => {
  // First priority: use custom title if provided
  if (customTitle && customTitle.trim() && customTitle !== "Untitled") {
    return (
      customTitle
        .split(/\s+/) // Split into words
        .filter(Boolean)
        .slice(0, 7) // Keep at most 7 words
        .join("-") // Join with hyphens
        .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric (except hyphen)
        .substring(0, 50) || "Untitled"
    ); // Cap to 50 characters, fallback to Untitled
  }

  // Second priority: use resource count
  if (resources.length > 0) {
    return `resources-${resources.length}`;
  }

  return "Untitled";
};

// Sample resource types for demonstration
const RESOURCE_TYPES = [
  "ICON", "PICT", "SND ", "MENU", "DLOG", "ALRT", "WIND", "STR ", "STR#", "TEXT", "CODE", "DATA"
];

export function ResEditAppComponent({
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  title: customTitle,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isConfirmNewDialogOpen, setIsConfirmNewDialogOpen] = useState(false);
  const [isCloseSaveDialogOpen, setIsCloseSaveDialogOpen] = useState(false);
  const [isAddResourceDialogOpen, setIsAddResourceDialogOpen] = useState(false);
  const [isEditResourceDialogOpen, setIsEditResourceDialogOpen] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { saveFile } = useFileSystem("/Documents");
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const clearInitialData = useAppStore((state) => state.clearInitialData);

  // Use store actions directly to avoid reference changes
  const createResEditInstance = useResEditStore(
    (state) => state.createInstance
  );
  const removeResEditInstance = useResEditStore(
    (state) => state.removeInstance
  );
  const updateResEditInstance = useResEditStore(
    (state) => state.updateInstance
  );
  const resEditInstances = useResEditStore((state) => state.instances);
  const addResource = useResEditStore((state) => state.addResource);
  const updateResource = useResEditStore((state) => state.updateResource);
  const removeResource = useResEditStore((state) => state.removeResource);
  const selectResource = useResEditStore((state) => state.selectResource);

  // Legacy store methods for single-window mode
  const legacySetFilePath = useResEditStore((state) => state.setFilePath);
  const legacySetResources = useResEditStore((state) => state.setResources);
  const legacySetSelectedResource = useResEditStore((state) => state.setSelectedResource);
  const legacySetHasUnsavedChanges = useResEditStore((state) => state.setHasUnsavedChanges);
  const legacyFilePath = useResEditStore((state) => state.filePath);
  const legacyResources = useResEditStore((state) => state.resources);
  const legacySelectedResource = useResEditStore((state) => state.selectedResource);
  const legacyHasUnsavedChanges = useResEditStore((state) => state.hasUnsavedChanges);

  // Create instance when component mounts (only if using instanceId)
  useEffect(() => {
    if (instanceId) {
      createResEditInstance(instanceId);
    }
  }, [instanceId, createResEditInstance]);

  // Clean up instance when component unmounts (only if using instanceId)
  useEffect(() => {
    if (!instanceId) return;

    return () => {
      removeResEditInstance(instanceId);
    };
  }, [instanceId]);

  // Get current instance data (only if using instanceId)
  const currentInstance = instanceId ? resEditInstances[instanceId] : null;

  // Use instance data if available, otherwise use legacy store
  const currentFilePath = instanceId
    ? currentInstance?.filePath || null
    : legacyFilePath;

  const resources = instanceId
    ? currentInstance?.resources || []
    : legacyResources;

  const selectedResource = instanceId
    ? currentInstance?.selectedResource || null
    : legacySelectedResource;

  const hasUnsavedChanges = instanceId
    ? currentInstance?.hasUnsavedChanges || false
    : legacyHasUnsavedChanges;

  const setCurrentFilePath = useCallback(
    (path: string | null) => {
      if (instanceId) {
        updateResEditInstance(instanceId, { filePath: path });
      } else {
        legacySetFilePath(path);
      }
    },
    [instanceId, updateResEditInstance, legacySetFilePath]
  );

  const setCurrentResources = useCallback(
    (resources: ResourceItem[]) => {
      if (instanceId) {
        updateResEditInstance(instanceId, { resources });
      } else {
        legacySetResources(resources);
      }
    },
    [instanceId, updateResEditInstance, legacySetResources]
  );

  const setCurrentSelectedResource = useCallback(
    (resourceId: string | null) => {
      if (instanceId) {
        selectResource(instanceId, resourceId);
      } else {
        legacySetSelectedResource(resourceId);
      }
    },
    [instanceId, selectResource, legacySetSelectedResource]
  );

  const setCurrentHasUnsavedChanges = useCallback(
    (val: boolean) => {
      if (instanceId) {
        updateResEditInstance(instanceId, { hasUnsavedChanges: val });
      } else {
        legacySetHasUnsavedChanges(val);
      }
    },
    [instanceId, updateResEditInstance, legacySetHasUnsavedChanges]
  );

  // Load content from initial data
  useEffect(() => {
    if (initialData) {
      const data = initialData as ResEditInitialData;
      
      if (data.path) {
        setCurrentFilePath(data.path);
      }
      
      if (data.resources) {
        setCurrentResources(data.resources);
      }
      
      // Clear initial data after loading
      clearInitialData((instanceId || "resedit") as AppId);
    }
  }, [initialData, instanceId, clearInitialData, setCurrentFilePath, setCurrentResources]);

  // Group resources by type
  const resourcesByType = resources.reduce((acc, resource) => {
    if (!acc[resource.type]) {
      acc[resource.type] = [];
    }
    acc[resource.type].push(resource);
    return acc;
  }, {} as Record<string, ResourceItem[]>);

  // Handle new file
  const handleNewFile = () => {
    if (hasUnsavedChanges) {
      setIsConfirmNewDialogOpen(true);
    } else {
      createNewFile();
    }
  };

  const createNewFile = () => {
    setCurrentFilePath(null);
    setCurrentResources([]);
    setCurrentSelectedResource(null);
    setCurrentHasUnsavedChanges(false);
  };

  // Handle save
  const handleSave = async () => {
    if (!currentFilePath) {
      setIsSaveDialogOpen(true);
      return;
    }

    // Save resources to file
    const resourceData = JSON.stringify(resources, null, 2);
    await saveFile({
      path: currentFilePath,
      name: currentFilePath.split("/").pop() || "resources",
      content: resourceData,
      type: 'json'
    });
    setCurrentHasUnsavedChanges(false);
  };

  const handleSaveSubmit = async (fileName: string) => {
    const resourceData = JSON.stringify(resources, null, 2);
    const filePath = `/Documents/${fileName}`;
    await saveFile({
      path: filePath,
      name: fileName,
      content: resourceData,
      type: 'json'
    });
    setCurrentFilePath(filePath);
    setCurrentHasUnsavedChanges(false);
    setIsSaveDialogOpen(false);
  };

  // Handle file import
  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const importedResources = JSON.parse(content) as ResourceItem[];
      setCurrentResources(importedResources);
      setCurrentFilePath(`/Documents/${file.name}`);
      setCurrentHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to read file:", error);
    }

    // Reset file input
    event.target.value = "";
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  // Handle close
  const handleClose = () => {
    if (hasUnsavedChanges) {
      setIsCloseSaveDialogOpen(true);
    } else {
      onClose();
    }
  };

  const handleCloseDelete = () => {
    createNewFile();
    setIsCloseSaveDialogOpen(false);
    onClose();
  };

  const handleCloseSave = async (fileName: string) => {
    await handleSaveSubmit(fileName);
    setIsCloseSaveDialogOpen(false);
    onClose();
  };

  // Handle resource operations
  const handleAddResource = (resourceData: { type: string; name: string; data: string }) => {
    const newResource: ResourceItem = {
      id: `${resourceData.type}-${Date.now()}`,
      type: resourceData.type,
      name: resourceData.name,
      data: resourceData.data,
      size: resourceData.data.length,
      modified: false,
    };

    if (instanceId) {
      addResource(instanceId, newResource);
    } else {
      setCurrentResources([...resources, newResource]);
      setCurrentHasUnsavedChanges(true);
    }
  };

  const handleEditResource = (resourceId: string, updates: Partial<ResourceItem>) => {
    if (instanceId) {
      updateResource(instanceId, resourceId, updates);
    } else {
      const updatedResources = resources.map((resource) =>
        resource.id === resourceId ? { ...resource, ...updates, modified: true } : resource
      );
      setCurrentResources(updatedResources);
      setCurrentHasUnsavedChanges(true);
    }
  };

  const handleDeleteResource = (resourceId: string) => {
    if (instanceId) {
      removeResource(instanceId, resourceId);
    } else {
      const filteredResources = resources.filter((resource) => resource.id !== resourceId);
      setCurrentResources(filteredResources);
      setCurrentSelectedResource(selectedResource === resourceId ? null : selectedResource);
      setCurrentHasUnsavedChanges(true);
    }
  };

  // Toggle resource type expansion
  const toggleTypeExpansion = (type: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedTypes(newExpanded);
  };

  // Determine if the window title should display the unsaved indicator
  const showUnsavedIndicator = hasUnsavedChanges || (!currentFilePath && resources.length > 0);

  // State for dialogs
  const [saveFileName, setSaveFileName] = useState(
    generateSuggestedFilename(customTitle, resources)
  );
  const [closeSaveFileName, setCloseSaveFileName] = useState(
    generateSuggestedFilename(customTitle, resources)
  );
  const [newResourceData, setNewResourceData] = useState({
    type: "ICON",
    name: "",
    data: ""
  });
  const [editResourceData, setEditResourceData] = useState({
    name: "",
    data: ""
  });

  // Update suggested filenames when resources change
  useEffect(() => {
    const newFileName = generateSuggestedFilename(customTitle, resources);
    setSaveFileName(newFileName);
    setCloseSaveFileName(newFileName);
  }, [customTitle, resources]);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".json,.rsrc"
        className="hidden"
      />
              <ResEditMenuBar
          onClose={handleClose}
          onShowHelp={() => setIsHelpDialogOpen(true)}
          onShowAbout={() => setIsAboutDialogOpen(true)}
          onNewFile={handleNewFile}
          onImportFile={handleImportFile}
          onSave={handleSave}
          hasUnsavedChanges={hasUnsavedChanges}
          currentFilePath={currentFilePath}
          onAddResource={() => setIsAddResourceDialogOpen(true)}
        />
      <WindowFrame
        title={
          customTitle ||
          (currentFilePath
            ? `${removeFileExtension(currentFilePath.split("/").pop() || "")}${
                hasUnsavedChanges ? " •" : ""
              }`
            : `Untitled${showUnsavedIndicator ? " •" : ""}`)
        }
        onClose={handleClose}
        isForeground={isForeground}
        appId="resedit"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        interceptClose={true}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex flex-col h-full w-full">
          <div className="flex h-full">
            {/* Resource List Panel */}
            <div className="w-64 bg-gray-100 border-r border-gray-300 flex flex-col">
              <div className="p-2 border-b border-gray-300 bg-gray-200">
                <div className="flex justify-between items-center">
                  <span className="font-geneva-12 text-sm font-bold">Resources</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      playButtonClick();
                      setIsAddResourceDialogOpen(true);
                    }}
                    className="h-6 px-2"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-1">
                {Object.entries(resourcesByType).map(([type, typeResources]) => (
                  <div key={type} className="mb-1">
                    <button
                      onClick={() => {
                        playButtonClick();
                        toggleTypeExpansion(type);
                      }}
                      className="w-full flex items-center justify-between p-1 hover:bg-gray-200 text-left"
                    >
                      <span className="font-geneva-12 text-xs font-bold">{type}</span>
                      <span className="font-geneva-12 text-xs text-gray-500">
                        ({typeResources.length})
                      </span>
                      {expandedTypes.has(type) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    
                    {expandedTypes.has(type) && (
                      <div className="ml-4">
                        {typeResources.map((resource) => (
                          <div
                            key={resource.id}
                            className={`flex items-center justify-between p-1 hover:bg-gray-200 cursor-pointer ${
                              selectedResource === resource.id ? "bg-blue-200" : ""
                            }`}
                            onClick={() => {
                              playButtonClick();
                              setCurrentSelectedResource(resource.id);
                            }}
                          >
                            <span className="font-geneva-12 text-xs truncate">
                              {resource.name || resource.id}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playButtonClick();
                                  setEditResourceData({
                                    name: resource.name,
                                    data: typeof resource.data === 'string' ? resource.data : JSON.stringify(resource.data)
                                  });
                                  setIsEditResourceDialogOpen(true);
                                }}
                                className="h-4 w-4 flex items-center justify-center hover:bg-gray-300"
                              >
                                <Edit3 className="h-2 w-2" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playButtonClick();
                                  handleDeleteResource(resource.id);
                                }}
                                className="h-4 w-4 flex items-center justify-center hover:bg-red-200"
                              >
                                <Trash2 className="h-2 w-2" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                
                {resources.length === 0 && (
                  <div className="p-4 text-center text-gray-500">
                    <p className="font-geneva-12 text-xs">No resources</p>
                    <p className="font-geneva-12 text-xs">Click + to add</p>
                  </div>
                )}
              </div>
            </div>

            {/* Resource Editor Panel */}
            <div className="flex-1 flex flex-col">
              {selectedResource ? (
                <ResourceEditor
                  resource={resources.find(r => r.id === selectedResource)!}
                  onUpdate={(updates) => handleEditResource(selectedResource, updates)}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Eye className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="font-geneva-12 text-sm">Select a resource to edit</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dialogs */}
        <InputDialog
          isOpen={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
          onSubmit={handleSaveSubmit}
          title="Save Resource File"
          description="Enter a name for your resource file"
          value={saveFileName}
          onChange={setSaveFileName}
        />
        
        <ConfirmDialog
          isOpen={isConfirmNewDialogOpen}
          onOpenChange={setIsConfirmNewDialogOpen}
          onConfirm={() => {
            createNewFile();
            setIsConfirmNewDialogOpen(false);
          }}
          title="Discard Changes"
          description="Do you want to discard your changes and create a new file?"
        />
        
        <InputDialog
          isOpen={isCloseSaveDialogOpen}
          onOpenChange={setIsCloseSaveDialogOpen}
          onSubmit={handleCloseSave}
          title="Save Resource File"
          description="Enter a filename to save, or discard changes."
          value={closeSaveFileName}
          onChange={setCloseSaveFileName}
          submitLabel="Save"
          additionalActions={[
            {
              label: "Discard",
              onClick: handleCloseDelete,
              variant: "retro" as const,
              position: "left" as const,
            },
          ]}
        />

        <AddResourceDialog
          isOpen={isAddResourceDialogOpen}
          onOpenChange={setIsAddResourceDialogOpen}
          onSubmit={handleAddResource}
          resourceData={newResourceData}
          onResourceDataChange={setNewResourceData}
        />

        <EditResourceDialog
          isOpen={isEditResourceDialogOpen}
          onOpenChange={setIsEditResourceDialogOpen}
          onSubmit={(updates) => {
            if (selectedResource) {
              handleEditResource(selectedResource, updates);
            }
            setIsEditResourceDialogOpen(false);
          }}
          resourceData={editResourceData}
          onResourceDataChange={setEditResourceData}
        />

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="ResEdit"
        />
        
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
      </WindowFrame>
    </>
  );
}

// Resource Editor Component
function ResourceEditor({ 
  resource, 
  onUpdate 
}: { 
  resource: ResourceItem; 
  onUpdate: (updates: Partial<ResourceItem>) => void;
}) {
  const [localData, setLocalData] = useState(
    typeof resource.data === 'string' ? resource.data : JSON.stringify(resource.data, null, 2)
  );

  useEffect(() => {
    setLocalData(typeof resource.data === 'string' ? resource.data : JSON.stringify(resource.data, null, 2));
  }, [resource.data]);

  const handleSave = () => {
    try {
      const parsedData = JSON.parse(localData);
      onUpdate({ data: parsedData, size: localData.length });
    } catch {
      // If not valid JSON, save as string
      onUpdate({ data: localData, size: localData.length });
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4">
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="resource-type" className="font-geneva-12 text-xs">Type</Label>
            <Input
              id="resource-type"
              value={resource.type}
              onChange={(e) => onUpdate({ type: e.target.value })}
              className="font-geneva-12 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="resource-name" className="font-geneva-12 text-xs">Name</Label>
            <Input
              id="resource-name"
              value={resource.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="font-geneva-12 text-xs"
            />
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col">
        <Label htmlFor="resource-data" className="font-geneva-12 text-xs mb-2">Data</Label>
        <Textarea
          id="resource-data"
          value={localData}
          onChange={(e) => setLocalData(e.target.value)}
          className="flex-1 font-mono text-xs resize-none"
          placeholder="Enter resource data..."
        />
      </div>
      
      <div className="mt-4 flex justify-between items-center">
        <div className="text-xs text-gray-500">
          Size: {resource.size} bytes
        </div>
        <Button onClick={handleSave} size="sm">
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// Add Resource Dialog Component
function AddResourceDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  resourceData,
  onResourceDataChange
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { type: string; name: string; data: string }) => void;
  resourceData: { type: string; name: string; data: string };
  onResourceDataChange: (data: { type: string; name: string; data: string }) => void;
}) {
  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isOpen ? '' : 'hidden'}`}>
      <div className="bg-white border-2 border-black p-4 w-96">
        <h2 className="font-geneva-12 text-lg font-bold mb-4">Add Resource</h2>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="new-resource-type" className="font-geneva-12 text-xs">Type</Label>
            <Select value={resourceData.type} onValueChange={(value) => onResourceDataChange({ ...resourceData, type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="new-resource-name" className="font-geneva-12 text-xs">Name</Label>
            <Input
              id="new-resource-name"
              value={resourceData.name}
              onChange={(e) => onResourceDataChange({ ...resourceData, name: e.target.value })}
              className="font-geneva-12 text-xs"
            />
          </div>
          
          <div>
            <Label htmlFor="new-resource-data" className="font-geneva-12 text-xs">Data</Label>
            <Textarea
              id="new-resource-data"
              value={resourceData.data}
              onChange={(e) => onResourceDataChange({ ...resourceData, data: e.target.value })}
              className="font-geneva-12 text-xs"
              rows={4}
              placeholder="Enter resource data..."
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => {
            onSubmit(resourceData);
            onOpenChange(false);
          }}>
            Add Resource
          </Button>
        </div>
      </div>
    </div>
  );
}

// Edit Resource Dialog Component
function EditResourceDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  resourceData,
  onResourceDataChange
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (updates: Partial<ResourceItem>) => void;
  resourceData: { name: string; data: string };
  onResourceDataChange: (data: { name: string; data: string }) => void;
}) {
  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isOpen ? '' : 'hidden'}`}>
      <div className="bg-white border-2 border-black p-4 w-96">
        <h2 className="font-geneva-12 text-lg font-bold mb-4">Edit Resource</h2>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-resource-name" className="font-geneva-12 text-xs">Name</Label>
            <Input
              id="edit-resource-name"
              value={resourceData.name}
              onChange={(e) => onResourceDataChange({ ...resourceData, name: e.target.value })}
              className="font-geneva-12 text-xs"
            />
          </div>
          
          <div>
            <Label htmlFor="edit-resource-data" className="font-geneva-12 text-xs">Data</Label>
            <Textarea
              id="edit-resource-data"
              value={resourceData.data}
              onChange={(e) => onResourceDataChange({ ...resourceData, data: e.target.value })}
              className="font-geneva-12 text-xs"
              rows={4}
              placeholder="Enter resource data..."
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => {
            onSubmit({ name: resourceData.name, data: resourceData.data });
            onOpenChange(false);
          }}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
} 