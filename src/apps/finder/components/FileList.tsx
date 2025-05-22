import { FileIcon } from "./FileIcon";
import { ViewType } from "./FinderMenuBar";
import { useSound, Sounds } from "@/hooks/useSound";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useRef, useEffect } from "react";

export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
  icon?: string;
  appId?: string; // For application files
  content?: string | Blob; // For document files or images
  contentUrl?: string; // For blob URLs
  size?: number; // File size in bytes
  modifiedAt?: Date; // Last modified date
  type?: string;
}

interface FileListProps {
  files: FileItem[];
  onFileOpen: (file: FileItem) => void;
  onFileSelect: (file: FileItem) => void;
  selectedFile?: FileItem;
  viewType?: ViewType;
  getFileType: (file: FileItem) => string;
  onFileDrop?: (sourceFile: FileItem, targetFolder: FileItem) => void;
  onDropToCurrentDirectory?: (sourceFile: FileItem) => void;
  canDropFiles?: boolean;
  currentPath?: string;
  onRenameRequest?: (file: FileItem) => void;
}

export function FileList({
  files,
  onFileOpen,
  onFileSelect,
  selectedFile,
  viewType = "small",
  getFileType,
  onFileDrop,
  onDropToCurrentDirectory,
  canDropFiles = false,
  currentPath = "/",
  onRenameRequest,
}: FileListProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const [draggedFile, setDraggedFile] = useState<FileItem | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  
  // Add refs for rename timing
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastClickedPathRef = useRef<string | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleFileOpen = (file: FileItem) => {
    // Clear any pending rename timeout when opening a file
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    playClick();
    onFileOpen(file);
    onFileSelect(null as unknown as FileItem); // Clear selection with proper typing
  };

  const handleFileSelect = (file: FileItem) => {
    playClick();
    
    // If user clicks on already selected file
    if (selectedFile && selectedFile.path === file.path) {
      // If rename is already pending, don't set another timeout
      if (clickTimeoutRef.current) {
        return;
      }
      
      // Start a timeout to trigger rename after a short delay (600ms)
      lastClickedPathRef.current = file.path;
      clickTimeoutRef.current = setTimeout(() => {
        // Only trigger rename if this is still the selected file
        if (onRenameRequest && lastClickedPathRef.current === file.path) {
          onRenameRequest(file);
        }
        clickTimeoutRef.current = null;
      }, 600);
      
      return;
    }
    
    // If clicking on a different file, cancel any pending rename and update selection
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    lastClickedPathRef.current = file.path;
    onFileSelect(file);
  };

  const handleDragStart = (e: React.DragEvent<HTMLElement>, file: FileItem) => {
    // Only allow dragging files, not folders
    if (file.isDirectory) {
      e.preventDefault();
      return;
    }

    // Set dragged file data
    e.dataTransfer.setData("application/json", JSON.stringify({ 
      path: file.path, 
      name: file.name 
    }));
    setDraggedFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>, file: FileItem) => {
    // Only allow dropping onto directories and only if canDropFiles is true
    if (file.isDirectory && canDropFiles && draggedFile && draggedFile.path !== file.path) {
      e.preventDefault();
      setDropTargetPath(file.path);
    }
  };

  const handleDragLeave = () => {
    setDropTargetPath(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>, targetFolder: FileItem) => {
    e.preventDefault();
    
    // Reset states
    setDropTargetPath(null);
    
    // Only process if we have a dragged file and onFileDrop handler
    if (!draggedFile || !onFileDrop || !targetFolder.isDirectory) {
      setDraggedFile(null);
      return;
    }

    // Prevent dropping a folder into itself or its descendant
    if (draggedFile.path === targetFolder.path || 
        targetFolder.path.startsWith(draggedFile.path + '/')) {
      setDraggedFile(null);
      return;
    }
    
    // Call the handler with source and target
    onFileDrop(draggedFile, targetFolder);
    setDraggedFile(null);
  };

  const handleDragEnd = () => {
    setDraggedFile(null);
    setDropTargetPath(null);
  };

  // Handlers for container-level drag events
  const handleContainerDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (canDropFiles && draggedFile && (currentPath === "/Documents" || currentPath === "/Images")) {
      e.preventDefault();
    }
  };

  const handleContainerDragLeave = () => {
    // Only needed for type compatibility, no state change required
  };

  const handleContainerDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    
    // If already processed by a folder drop handler, don't double process
    if (dropTargetPath) {
      setDropTargetPath(null);
      return;
    }
    
    // Process drop on the container
    if (draggedFile && onDropToCurrentDirectory && 
        (currentPath === "/Documents" || currentPath === "/Images")) {
      onDropToCurrentDirectory(draggedFile);
    }
    
    setDraggedFile(null);
  };

  // Add a helper function to detect image files
  const isImageFile = (file: FileItem): boolean => {
    // Check by extension first
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      return true;
    }
    
    // Then check by type
    if (file.type?.startsWith("image") || 
        file.type === "png" || 
        file.type === "jpg" || 
        file.type === "jpeg" || 
        file.type === "gif" || 
        file.type === "webp" || 
        file.type === "bmp") {
      return true;
    }
    
    return false;
  };

  if (viewType === "list") {
    return (
      <div 
        className="font-geneva-12"
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleContainerDrop}
      >
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow className="text-[10px] border-none font-normal">
              <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                Name
              </TableHead>
              <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                Type
              </TableHead>
              <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                Size
              </TableHead>
              <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                Modified
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-[11px]">
            {files.map((file) => (
              <TableRow
                key={file.path}
                className={`border-none hover:bg-gray-100/50 transition-colors cursor-default ${
                  selectedFile?.path === file.path || dropTargetPath === file.path
                    ? "bg-black text-white hover:bg-black"
                    : "odd:bg-gray-200/50"
                }`}
                onClick={() => handleFileSelect(file)}
                onDoubleClick={() => handleFileOpen(file)}
                draggable={!file.isDirectory}
                onDragStart={(e) => handleDragStart(e, file)}
                onDragOver={(e) => handleDragOver(e, file)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, file)}
                onDragEnd={handleDragEnd}
              >
                <TableCell className="flex items-center gap-2">
                  {file.contentUrl && isImageFile(file) ? (
                    <img
                      src={file.contentUrl}
                      alt={file.name}
                      className="w-4 h-4 object-contain"
                      style={{ imageRendering: "pixelated" }}
                      onError={(e) => { 
                        console.error(`Error loading thumbnail for ${file.name}`);
                        (e.target as HTMLImageElement).style.display = 'none'; 
                      }}
                    />
                  ) : (
                    <img
                      src={file.icon}
                      alt={file.isDirectory ? "Directory" : "File"}
                      className={`w-4 h-4 ${
                        selectedFile?.path === file.path || dropTargetPath === file.path ? "invert" : ""
                      }`}
                      style={{ imageRendering: "pixelated" }}
                    />
                  )}
                  {file.name}
                </TableCell>
                <TableCell>{getFileType(file)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {file.size
                    ? file.size < 1024
                      ? `${file.size} B`
                      : file.size < 1024 * 1024
                      ? `${(file.size / 1024).toFixed(1)} KB`
                      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : "--"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {file.modifiedAt
                    ? new Date(file.modifiedAt).toLocaleDateString()
                    : "--"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div 
      className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 p-2 min-h-[150px]"
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
    >
      {files.map((file) => (
        <div 
          key={file.path}
          draggable={!file.isDirectory}
          onDragStart={(e) => handleDragStart(e, file)}
          onDragOver={(e) => handleDragOver(e, file)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, file)}
          onDragEnd={handleDragEnd}
          className="p-1 transition-all duration-75"
        >
          <FileIcon
            name={file.name}
            isDirectory={file.isDirectory}
            icon={file.icon}
            content={isImageFile(file) ? file.content : undefined}
            contentUrl={isImageFile(file) ? file.contentUrl : undefined}
            onDoubleClick={() => handleFileOpen(file)}
            onClick={() => handleFileSelect(file)}
            isSelected={selectedFile?.path === file.path}
            isDropTarget={dropTargetPath === file.path}
            size={viewType === "large" ? "large" : "small"}
          />
        </div>
      ))}
    </div>
  );
}
