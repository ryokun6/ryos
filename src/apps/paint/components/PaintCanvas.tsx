import React, {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
} from "react";
import { motion } from "framer-motion";
import { Filter } from "./PaintFiltersMenu";

interface PaintCanvasProps {
  selectedTool: string;
  selectedPattern: string;
  strokeWidth: number;
  onCanUndoChange: (canUndo: boolean) => void;
  onCanRedoChange: (canRedo: boolean) => void;
  onContentChange?: () => void;
  canvasWidth?: number;
  canvasHeight?: number;
  /** Whether the Paint window is currently foreground (active) */
  isForeground?: boolean;
}

interface PaintCanvasRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportCanvas: () => Promise<Blob>;
  importImage: (dataUrl: string) => void;
  cut: () => Promise<void>;
  copy: () => Promise<void>;
  paste: () => Promise<void>;
  applyFilter: (filter: Filter) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Selection {
  type: "rectangle" | "lasso";
  startX: number;
  startY: number;
  width: number;
  height: number;
  imageData?: ImageData;
  path?: Point[]; // For lasso selections
}

export const PaintCanvas = forwardRef<PaintCanvasRef, PaintCanvasProps>(
  (
    {
      selectedTool,
      selectedPattern,
      strokeWidth,
      onCanUndoChange,
      onCanRedoChange,
      onContentChange,
      canvasWidth = 589,
      canvasHeight = 418,
      isForeground = false,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawing = useRef(false);
    const historyRef = useRef<ImageData[]>([]);
    const historyIndexRef = useRef(-1);
    const patternRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(
      null
    );
    const startPointRef = useRef<Point | null>(null);
    const lastImageRef = useRef<ImageData | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [textPosition, setTextPosition] = useState<Point | null>(null);
    const textInputRef = useRef<HTMLInputElement | null>(null);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const dragStartRef = useRef<Point | null>(null);
    const dashOffsetRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);
    const touchStartRef = useRef<Point | null>(null);
    const [isLoadingFile] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const lassoPathRef = useRef<Point[]>([]);

    // Handle canvas resize
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;

          // Store current canvas content
          const tempCanvas = document.createElement("canvas");
          const tempContext = tempCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          if (tempContext && contextRef.current) {
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempContext.drawImage(canvas, 0, 0);
          }

          // Update canvas size
          canvas.width = width;
          canvas.height = height;

          // Restore context properties
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.lineCap = "round";
            context.lineJoin = "round";
            context.lineWidth = strokeWidth;
            contextRef.current = context;

            // Restore pattern if exists
            if (patternRef.current) {
              const pattern = context.createPattern(
                patternRef.current,
                "repeat"
              );
              if (pattern) {
                context.strokeStyle = pattern;
                context.fillStyle = pattern;
              }
            }

            // Restore canvas content
            if (tempContext) {
              context.drawImage(
                tempCanvas,
                0,
                0,
                tempCanvas.width,
                tempCanvas.height,
                0,
                0,
                width,
                height
              );
            }
          }
        }
      });

      resizeObserver.observe(canvas);
      return () => resizeObserver.disconnect();
    }, [strokeWidth]);

    // Handle ESC key and shortcuts
    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        // Handle selection escape
        if (event.key === "Escape" && selection) {
          // Restore canvas to state before selection
          if (lastImageRef.current && contextRef.current) {
            contextRef.current.putImageData(lastImageRef.current, 0, 0);
          }
          setSelection(null);
          return;
        }

        // Handle undo/redo shortcuts
        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const cmdKey = isMac ? event.metaKey : event.ctrlKey;

        if (cmdKey && !event.altKey) {
          if (event.key.toLowerCase() === "z") {
            event.preventDefault();
            if (event.shiftKey) {
              // Cmd/Ctrl+Shift+Z - Redo
              if (historyIndexRef.current < historyRef.current.length - 1) {
                historyIndexRef.current++;
                const imageData = historyRef.current[historyIndexRef.current];
                if (contextRef.current && imageData) {
                  contextRef.current.putImageData(imageData, 0, 0);
                  onCanUndoChange(true);
                  onCanRedoChange(
                    historyIndexRef.current < historyRef.current.length - 1
                  );
                }
              }
            } else {
              // Cmd/Ctrl+Z - Undo
              if (historyIndexRef.current > 0) {
                historyIndexRef.current--;
                const imageData = historyRef.current[historyIndexRef.current];
                if (contextRef.current && imageData) {
                  contextRef.current.putImageData(imageData, 0, 0);
                  onCanUndoChange(historyIndexRef.current > 0);
                  onCanRedoChange(true);
                }
              }
            }
          } else if (event.key.toLowerCase() === "y" && !event.shiftKey) {
            // Cmd/Ctrl+Y - Alternative Redo
            event.preventDefault();
            if (historyIndexRef.current < historyRef.current.length - 1) {
              historyIndexRef.current++;
              const imageData = historyRef.current[historyIndexRef.current];
              if (contextRef.current && imageData) {
                contextRef.current.putImageData(imageData, 0, 0);
                onCanUndoChange(true);
                onCanRedoChange(
                  historyIndexRef.current < historyRef.current.length - 1
                );
              }
            }
          }
        }
      },
      [selection, onCanUndoChange, onCanRedoChange]
    );

    useEffect(() => {
      if (!isForeground) return; // Only register shortcuts when window is foreground
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isForeground, handleKeyDown]);

    // Animate selection dashes
    useEffect(() => {
      if (!selection) {
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        // Restore canvas to state before selection was made
        if (lastImageRef.current && contextRef.current) {
          contextRef.current.putImageData(lastImageRef.current, 0, 0);
        }
        return;
      }

      const animate = () => {
        if (
          !contextRef.current ||
          !canvasRef.current ||
          !selection ||
          !lastImageRef.current
        )
          return;

        // Always restore the original canvas state before drawing selection
        contextRef.current.putImageData(lastImageRef.current, 0, 0);

        // Draw animated selection outline
        contextRef.current.save();
        contextRef.current.strokeStyle = "#000";
        contextRef.current.lineWidth = 1;
        contextRef.current.setLineDash([5, 5]);
        contextRef.current.lineDashOffset = dashOffsetRef.current;

        if (selection.type === "rectangle") {
          // Draw rectangle selection
          contextRef.current.strokeRect(
            selection.startX,
            selection.startY,
            selection.width,
            selection.height
          );
        } else if (selection.type === "lasso" && selection.path && selection.path.length > 0) {
          // Draw lasso selection path
          contextRef.current.beginPath();
          contextRef.current.moveTo(selection.path[0].x, selection.path[0].y);
          for (let i = 1; i < selection.path.length; i++) {
            contextRef.current.lineTo(selection.path[i].x, selection.path[i].y);
          }
          contextRef.current.closePath();
          contextRef.current.stroke();
        }

        contextRef.current.restore();

        // Update dash offset
        dashOffsetRef.current = (dashOffsetRef.current + 1) % 10;
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animate();

      return () => {
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }, [selection]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Only set up the canvas dimensions and context once
      if (!contextRef.current) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;

        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = strokeWidth;
        contextRef.current = context;

        // Fill canvas with white background initially
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Save initial canvas state
        saveToHistory();
      }

      // Load and update the pattern
      const patternNum = selectedPattern.split("-")[1];
      const img = new Image();
      img.crossOrigin = "anonymous"; // Add cross-origin attribute before setting src

      img.onload = () => {
        // Create a temporary canvas to draw the pattern
        const patternCanvas = document.createElement("canvas");
        const patternContext = patternCanvas.getContext("2d");
        if (!patternContext || !contextRef.current) return;

        // Set pattern canvas size to match the pattern size
        patternCanvas.width = img.width;
        patternCanvas.height = img.height;

        // Draw the pattern onto the temporary canvas
        patternContext.drawImage(img, 0, 0);

        // Store the pattern canvas instead of the image
        patternRef.current = patternCanvas;

        // Create pattern from the temporary canvas
        const pattern = contextRef.current.createPattern(
          patternCanvas,
          "repeat"
        );
        if (pattern) {
          contextRef.current.strokeStyle = pattern;
          contextRef.current.fillStyle = pattern;
        }
      };

      img.onerror = (e) => {
        console.error("Error loading pattern:", e);
      };

      img.src = `/patterns/Property 1=${patternNum}.svg`;
    }, [selectedPattern]);

    useEffect(() => {
      if (contextRef.current) {
        contextRef.current.lineWidth = strokeWidth;
      }
    }, [strokeWidth]);

    const sprayAtPoint = useCallback(
      (point: Point) => {
        if (!contextRef.current) return;

        const radius = strokeWidth * 2;
        const density = radius * 2;

        for (let i = 0; i < density; i++) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          const x = point.x + r * Math.cos(angle);
          const y = point.y + r * Math.sin(angle);
          contextRef.current.fillRect(x, y, 1, 1);
        }
      },
      [strokeWidth]
    );

    const saveToHistory = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !contextRef.current) return;

      // If there's an active selection, use the clean state from lastImageRef
      // to avoid saving the selection ring overlay into history
      let newImageData: ImageData;
      if (selection && lastImageRef.current) {
        newImageData = lastImageRef.current;
      } else {
        newImageData = contextRef.current.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );
      }

      // Check if there are actual changes before saving to history
      const hasChanges =
        historyIndexRef.current < 0 ||
        !historyRef.current[historyIndexRef.current] ||
        !compareImageData(
          newImageData,
          historyRef.current[historyIndexRef.current]
        );

      if (!hasChanges) return;

      // Remove any redo states
      historyRef.current = historyRef.current.slice(
        0,
        historyIndexRef.current + 1
      );

      // Add current state to history
      historyRef.current.push(newImageData);
      historyIndexRef.current++;

      // Limit history size to prevent memory issues (keep last 50 states)
      if (historyRef.current.length > 50) {
        historyRef.current = historyRef.current.slice(-50);
        historyIndexRef.current = Math.min(historyIndexRef.current, 49);
      }

      // Update undo/redo availability
      onCanUndoChange(historyIndexRef.current > 0);
      onCanRedoChange(historyIndexRef.current < historyRef.current.length - 1);

      // Notify content change
      if (!isLoadingFile) {
        onContentChange?.();
      }
    }, [onCanUndoChange, onCanRedoChange, onContentChange, isLoadingFile, selection]);

    // Helper function to compare ImageData
    const compareImageData = useCallback((img1: ImageData, img2: ImageData) => {
      if (img1.width !== img2.width || img1.height !== img2.height)
        return false;

      // Compare a sample of pixels to determine if images are significantly different
      // This is more performant than comparing every pixel
      const data1 = img1.data;
      const data2 = img2.data;
      const length = data1.length;
      const sampleSize = Math.min(1000, length / 4); // Sample at most 1000 pixels
      const step = Math.floor(length / (sampleSize * 4));

      for (let i = 0; i < length; i += step) {
        if (data1[i] !== data2[i]) return false;
      }

      return true;
    }, []);

    // Helper function to extract selection region with mask support
    const extractSelectionRegion = useCallback(() => {
      if (!contextRef.current || !canvasRef.current || !selection) return null;

      const { startX, startY, width, height, type, path } = selection;

      // Normalize selection bounds to integers so we don't end up indexing
      // image data with fractional coordinates (which returns undefined and
      // yields a transparent copy).
      const intStartX = Math.floor(startX);
      const intStartY = Math.floor(startY);
      const intEndX = Math.ceil(startX + width);
      const intEndY = Math.ceil(startY + height);
      const intWidth = Math.max(1, intEndX - intStartX);
      const intHeight = Math.max(1, intEndY - intStartY);

      // Create a temporary canvas for the selection
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = intWidth;
      tempCanvas.height = intHeight;
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
      if (!tempCtx) return null;

      if (type === "rectangle") {
        // Simple rectangle extraction
        const imageData = contextRef.current.getImageData(
          intStartX,
          intStartY,
          intWidth,
          intHeight
        );
        tempCtx.putImageData(imageData, 0, 0);
      } else if (type === "lasso" && path && path.length > 0) {
        // Lasso selection: extract pixels within the path
        // Get the full canvas image data
        const fullImageData = contextRef.current.getImageData(
          0,
          0,
          canvasRef.current.width,
          canvasRef.current.height
        );

        // Create a mask for the lasso path
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = canvasRef.current.width;
        maskCanvas.height = canvasRef.current.height;
        const maskCtx = maskCanvas.getContext("2d");
        if (!maskCtx) return null;

        // Draw the path as a filled shape
        maskCtx.beginPath();
        maskCtx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          maskCtx.lineTo(path[i].x, path[i].y);
        }
        maskCtx.closePath();
        maskCtx.fillStyle = "white";
        maskCtx.fill();

        // Extract pixels that are within the mask
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const outputData = tempCtx.createImageData(intWidth, intHeight);

        for (let y = 0; y < intHeight; y++) {
          for (let x = 0; x < intWidth; x++) {
            const canvasX = intStartX + x;
            const canvasY = intStartY + y;
            const canvasIdx =
              (canvasY * canvasRef.current.width + canvasX) * 4;
            const outputIdx = (y * intWidth + x) * 4;

            // Check if pixel is within mask
            if (maskData.data[canvasIdx + 3] > 0) {
              // Copy pixel
              outputData.data[outputIdx] = fullImageData.data[canvasIdx];
              outputData.data[outputIdx + 1] = fullImageData.data[canvasIdx + 1];
              outputData.data[outputIdx + 2] = fullImageData.data[canvasIdx + 2];
              outputData.data[outputIdx + 3] = fullImageData.data[canvasIdx + 3];
            } else {
              // Transparent pixel
              outputData.data[outputIdx] = 0;
              outputData.data[outputIdx + 1] = 0;
              outputData.data[outputIdx + 2] = 0;
              outputData.data[outputIdx + 3] = 0;
            }
          }
        }

        tempCtx.putImageData(outputData, 0, 0);
      }

      return tempCanvas;
    }, [selection]);

    // Clipboard methods
    const copySelectionToClipboard = useCallback(async () => {
      if (!contextRef.current || !canvasRef.current) {
        console.error("Canvas not available for copy");
        return;
      }

      // Restore canvas to show actual content (not selection overlay)
      if (lastImageRef.current && selection) {
        contextRef.current.putImageData(lastImageRef.current, 0, 0);
      }

      let tempCanvas: HTMLCanvasElement | null = null;

      if (selection) {
        // Extract selection region
        tempCanvas = extractSelectionRegion();
        if (!tempCanvas) {
          console.error("Failed to extract selection region");
          return;
        }
      } else {
        // If no selection, copy entire canvas
        tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvasRef.current.width;
        tempCanvas.height = canvasRef.current.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) {
          console.error("Failed to create temp canvas context");
          return;
        }
        tempCtx.drawImage(canvasRef.current, 0, 0);
      }

      // Convert to blob and copy to clipboard
      return new Promise<void>((resolve, reject) => {
        if (!tempCanvas) {
          reject(new Error("Failed to create temp canvas"));
          return;
        }
        tempCanvas.toBlob((blob) => {
          if (!blob) {
            console.error("Failed to create blob from canvas");
            reject(new Error("Failed to create blob"));
            return;
          }
          
          const item = new ClipboardItem({ "image/png": blob });
          navigator.clipboard
            .write([item])
            .then(() => {
              console.log("Successfully copied to clipboard");
              resolve();
            })
            .catch((err) => {
              console.error("Failed to write to clipboard:", err);
              reject(err);
            });
        }, "image/png");
      });
    }, [selection, extractSelectionRegion]);

    const handlePaste = useCallback(async () => {
      if (!contextRef.current || !canvasRef.current) {
        console.error("Canvas not available for paste");
        return;
      }

      try {
        // Restore canvas to actual state (remove selection overlay if present)
        if (lastImageRef.current && selection) {
          contextRef.current.putImageData(lastImageRef.current, 0, 0);
        }

        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
          for (const type of clipboardItem.types) {
            if (type.startsWith("image/")) {
              const blob = await clipboardItem.getType(type);
              const blobUrl = URL.createObjectURL(blob);
              const img = new Image();
              img.src = blobUrl;
              try {
                await new Promise<void>((resolve, reject) => {
                  img.onload = () => {
                    if (!contextRef.current || !canvasRef.current) {
                      reject(new Error("Canvas not available"));
                      return;
                    }

                    // Restore the clean canvas state again right before drawing.
                    // The selection outline animation may have drawn additional
                    // strokes while we were waiting on the clipboard/image load,
                    // so re-applying the clean snapshot prevents baking the
                    // marching-ants box into the canvas when pasting.
                    if (selection && lastImageRef.current) {
                      contextRef.current.putImageData(lastImageRef.current, 0, 0);
                    }

                    // If there's a selection, paste into the selection area (scaled to fit)
                    if (selection) {
                      // Calculate scaling to fit selection while maintaining aspect ratio
                      const scaleX = selection.width / img.width;
                      const scaleY = selection.height / img.height;
                      const scale = Math.min(scaleX, scaleY);
                      const scaledWidth = img.width * scale;
                      const scaledHeight = img.height * scale;
                      const offsetX = (selection.width - scaledWidth) / 2;
                      const offsetY = (selection.height - scaledHeight) / 2;

                      // For lasso selections, we need to clip to the path
                      if (selection.type === "lasso" && selection.path) {
                        // Save current state
                        contextRef.current.save();
                        
                        // Create clipping path
                        contextRef.current.beginPath();
                        contextRef.current.moveTo(
                          selection.path[0].x,
                          selection.path[0].y
                        );
                        for (let i = 1; i < selection.path.length; i++) {
                          contextRef.current.lineTo(
                            selection.path[i].x,
                            selection.path[i].y
                          );
                        }
                        contextRef.current.closePath();
                        contextRef.current.clip();

                        // Draw image scaled to fit
                        contextRef.current.drawImage(
                          img,
                          selection.startX + offsetX,
                          selection.startY + offsetY,
                          scaledWidth,
                          scaledHeight
                        );

                        contextRef.current.restore();
                      } else {
                        // Rectangle selection - simple draw
                        contextRef.current.drawImage(
                          img,
                          selection.startX + offsetX,
                          selection.startY + offsetY,
                          scaledWidth,
                          scaledHeight
                        );
                      }
                    } else {
                      // If no selection, paste at center
                      const x = (canvasRef.current.width - img.width) / 2;
                      const y = (canvasRef.current.height - img.height) / 2;
                      contextRef.current.drawImage(img, x, y);
                    }
                    
                    // Clear selection FIRST to stop the animation from drawing the selection box
                    // This must happen before updating lastImageRef to prevent race conditions
                    setSelection(null);
                    
                    // Update lastImageRef to reflect the pasted state (without selection box)
                    if (canvasRef.current && contextRef.current) {
                      lastImageRef.current = contextRef.current.getImageData(
                        0,
                        0,
                        canvasRef.current.width,
                        canvasRef.current.height
                      );
                    }
                    
                    saveToHistory();
                    if (onContentChange) onContentChange();
                    
                    resolve();
                  };
                  img.onerror = () => {
                    reject(new Error("Failed to load image from clipboard"));
                  };
                });
              } finally {
                URL.revokeObjectURL(blobUrl);
              }
              break;
            }
          }
        }
      } catch (err) {
        console.error("Failed to read clipboard contents: ", err);
        // Show user-friendly error message
        if (err instanceof Error && err.name === "NotAllowedError") {
          console.error("Clipboard access denied. Please grant clipboard permissions.");
        }
      }
    }, [selection, saveToHistory, onContentChange]);

    const clearSelection = useCallback(() => {
      if (!contextRef.current || !canvasRef.current || !selection) return;

      // Restore canvas to actual state (remove selection overlay)
      if (lastImageRef.current) {
        contextRef.current.putImageData(lastImageRef.current, 0, 0);
      }

      contextRef.current.save();

      if (selection.type === "lasso" && selection.path && selection.path.length > 0) {
        // For lasso, fill the path shape with white
        contextRef.current.beginPath();
        contextRef.current.moveTo(selection.path[0].x, selection.path[0].y);
        for (let i = 1; i < selection.path.length; i++) {
          contextRef.current.lineTo(selection.path[i].x, selection.path[i].y);
        }
        contextRef.current.closePath();
        contextRef.current.fillStyle = "#FFFFFF";
        contextRef.current.fill();
      } else {
        // Rectangle selection - fill with white
        contextRef.current.fillStyle = "#FFFFFF";
        contextRef.current.fillRect(
          selection.startX,
          selection.startY,
          selection.width,
          selection.height
        );
      }

      contextRef.current.restore();
      
      // Update lastImageRef to reflect the cleared state
      if (canvasRef.current && contextRef.current) {
        lastImageRef.current = contextRef.current.getImageData(
          0,
          0,
          canvasRef.current.width,
          canvasRef.current.height
        );
      }
      
      saveToHistory();
      if (onContentChange) onContentChange();
      
      // Clear selection after cut
      setSelection(null);
    }, [selection, saveToHistory, onContentChange]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          if (historyIndexRef.current > 0) {
            historyIndexRef.current--;
            const imageData = historyRef.current[historyIndexRef.current];
            if (contextRef.current && imageData) {
              contextRef.current.putImageData(imageData, 0, 0);
              onCanUndoChange(historyIndexRef.current > 0);
              onCanRedoChange(true);
            }
          }
        },
        redo: () => {
          if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current++;
            const imageData = historyRef.current[historyIndexRef.current];
            if (contextRef.current && imageData) {
              contextRef.current.putImageData(imageData, 0, 0);
              onCanUndoChange(true);
              onCanRedoChange(
                historyIndexRef.current < historyRef.current.length - 1
              );
            }
          }
        },
        clear: () => {
          if (!contextRef.current || !canvasRef.current) return;
          contextRef.current.fillStyle = "#FFFFFF";
          contextRef.current.fillRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
          saveToHistory();
        },
        exportCanvas: () => {
          const canvas = canvasRef.current;
          if (!canvas) {
            return Promise.reject(new Error("Canvas not available"));
          }

          return new Promise<Blob>((resolve, reject) => {
            // If selection is active, use clean state from lastImageRef
            if (selection && lastImageRef.current && contextRef.current) {
              const tempCanvas = document.createElement("canvas");
              tempCanvas.width = canvas.width;
              tempCanvas.height = canvas.height;
              const tempCtx = tempCanvas.getContext("2d");
              if (!tempCtx) {
                reject(new Error("Failed to create temp canvas"));
                return;
              }
              tempCtx.putImageData(lastImageRef.current, 0, 0);
              tempCanvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to create blob"));
              }, "image/png");
              return;
            }

            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Failed to create blob from canvas"));
              }
            }, "image/png");
          });
        },
        importImage: (dataUrl: string) => {
          const img = new Image();
          img.src = dataUrl;
          img.onload = () => {
            if (!contextRef.current || !canvasRef.current) return;

            const canvas = canvasRef.current;
            const ctx = contextRef.current;

            // Clear the canvas first
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw the image at the canvas dimensions (which are already scaled)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            saveToHistory();
          };
        },
        cut: async () => {
          if (selection) {
            try {
              await copySelectionToClipboard();
              clearSelection();
            } catch (err) {
              console.error("Failed to cut selection:", err);
            }
          }
        },
        copy: async () => {
          try {
            await copySelectionToClipboard();
          } catch (err) {
            console.error("Failed to copy selection:", err);
          }
        },
        paste: handlePaste,
        applyFilter: (filter: Filter) => {
          if (canvasRef.current) {
            saveToHistory();
            filter.apply(canvasRef.current);
            onContentChange?.();
          }
        },
      }),
      [
        onCanUndoChange,
        onCanRedoChange,
        saveToHistory,
        copySelectionToClipboard,
        clearSelection,
        handlePaste,
        onContentChange,
      ]
    );

    // Add keyboard shortcuts for clipboard operations
    useEffect(() => {
      if (!isForeground) return; // Only register clipboard shortcuts when foreground
      const handleClipboardShortcuts = (e: KeyboardEvent) => {
        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const cmdKey = isMac ? e.metaKey : e.ctrlKey;

        if (cmdKey && !e.shiftKey && !e.altKey) {
          if (e.key.toLowerCase() === "x") {
            e.preventDefault();
            copySelectionToClipboard();
            clearSelection();
          } else if (e.key.toLowerCase() === "c") {
            e.preventDefault();
            copySelectionToClipboard();
          } else if (e.key.toLowerCase() === "v") {
            e.preventDefault();
            handlePaste();
          }
        }
      };

      window.addEventListener("keydown", handleClipboardShortcuts);
      return () =>
        window.removeEventListener("keydown", handleClipboardShortcuts);
    }, [isForeground, copySelectionToClipboard, clearSelection, handlePaste]);

    const getCanvasPoint = (
      event:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();

      // Handle both mouse and touch events
      let clientX: number;
      let clientY: number;

      if ("touches" in event) {
        // For touchend/touchcancel, touches list will be empty, so use changedTouches
        if (event.touches.length === 0 && event.changedTouches?.length > 0) {
          clientX = event.changedTouches[0].clientX;
          clientY = event.changedTouches[0].clientY;
        } else if (event.touches.length > 0) {
          clientX = event.touches[0].clientX;
          clientY = event.touches[0].clientY;
        } else {
          // If no touch data available, return the last known point or a default
          return startPointRef.current || { x: 0, y: 0 };
        }
      } else {
        clientX = event.clientX;
        clientY = event.clientY;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const isPointInSelection = (point: Point, sel: Selection): boolean => {
      if (sel.type === "rectangle") {
        return (
          point.x >= sel.startX &&
          point.x <= sel.startX + sel.width &&
          point.y >= sel.startY &&
          point.y <= sel.startY + sel.height
        );
      } else if (sel.type === "lasso" && sel.path) {
        return isPointInLassoPath(point, sel.path);
      }
      return false;
    };

    // Point-in-polygon test for lasso selection
    const isPointInLassoPath = useCallback((point: Point, path: Point[]): boolean => {
      if (path.length < 3) return false;

      let inside = false;
      for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        const xi = path[i].x;
        const yi = path[i].y;
        const xj = path[j].x;
        const yj = path[j].y;

        const intersect =
          yi > point.y !== yj > point.y &&
          point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }, []);

    const floodFill = (startX: number, startY: number) => {
      const canvas = canvasRef.current;
      const context = contextRef.current;
      if (!canvas || !context || !patternRef.current) return;

      // Get the image data
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      // Get the color at target pixel
      const startPos = (startY * canvas.width + startX) * 4;
      const startR = pixels[startPos];
      const startG = pixels[startPos + 1];
      const startB = pixels[startPos + 2];
      const startA = pixels[startPos + 3];

      // Create a temporary canvas to draw the pattern
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempContext = tempCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!tempContext) return;

      // Fill the temporary canvas with the pattern
      const pattern = tempContext.createPattern(patternRef.current, "repeat");
      if (!pattern) return;
      tempContext.fillStyle = pattern;
      tempContext.fillRect(0, 0, canvas.width, canvas.height);
      const patternData = tempContext.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Performance optimization: Check if we're trying to fill with the same color
      const targetPos = (startY * canvas.width + startX) * 4;
      if (
        pixels[targetPos] === patternData.data[targetPos] &&
        pixels[targetPos + 1] === patternData.data[targetPos + 1] &&
        pixels[targetPos + 2] === patternData.data[targetPos + 2] &&
        pixels[targetPos + 3] === patternData.data[targetPos + 3]
      ) {
        return; // No need to fill if the colors are the same
      }

      // Performance optimization: Limit the maximum area to fill (e.g., 80% of canvas)
      const maxPixels = Math.floor(canvas.width * canvas.height * 0.8);
      let filledPixels = 0;

      // Helper to check if a pixel matches the start color
      const matchesStart = (pos: number) => {
        return (
          pixels[pos] === startR &&
          pixels[pos + 1] === startG &&
          pixels[pos + 2] === startB &&
          pixels[pos + 3] === startA
        );
      };

      // Helper to set a pixel to the pattern color
      const setPixel = (pos: number) => {
        pixels[pos] = patternData.data[pos];
        pixels[pos + 1] = patternData.data[pos + 1];
        pixels[pos + 2] = patternData.data[pos + 2];
        pixels[pos + 3] = patternData.data[pos + 3];
        filledPixels++;
      };

      // Scanline stack for flood fill (more efficient than pixel stack)
      interface ScanLine {
        y: number;
        leftX: number;
        rightX: number;
        direction: number; // 1 for up, -1 for down
      }
      const scanlines: ScanLine[] = [];

      // Add initial scanline
      scanlines.push({
        y: startY,
        leftX: startX,
        rightX: startX,
        direction: 1,
      });
      scanlines.push({
        y: startY,
        leftX: startX,
        rightX: startX,
        direction: -1,
      });

      while (scanlines.length > 0 && filledPixels < maxPixels) {
        const { y, leftX, rightX, direction } = scanlines.pop()!;
        const newY = y + direction;

        // Skip if we're out of bounds
        if (newY < 0 || newY >= canvas.height) continue;

        // Find the extents of the current scanline
        let x1 = leftX;
        let x2 = rightX;

        // Extend left
        while (x1 > 0 && matchesStart((y * canvas.width + (x1 - 1)) * 4)) {
          x1--;
        }

        // Extend right
        while (
          x2 < canvas.width - 1 &&
          matchesStart((y * canvas.width + (x2 + 1)) * 4)
        ) {
          x2++;
        }

        // Fill the current scanline
        for (let x = x1; x <= x2; x++) {
          setPixel((y * canvas.width + x) * 4);
        }

        // Look for new scanlines above/below
        let inRange = false;
        for (let x = x1; x <= x2; x++) {
          const newPos = (newY * canvas.width + x) * 4;
          const matchesNow = matchesStart(newPos);

          if (!inRange && matchesNow) {
            scanlines.push({
              y: newY,
              leftX: x,
              rightX: x,
              direction: direction,
            });
            inRange = true;
          } else if (inRange && !matchesNow) {
            scanlines[scanlines.length - 1].rightX = x - 1;
            inRange = false;
          }
        }
        if (inRange) {
          scanlines[scanlines.length - 1].rightX = x2;
        }
      }

      // Put the modified image data back
      context.putImageData(imageData, 0, 0);
      saveToHistory();
    };

    const renderText = (text: string) => {
      if (!contextRef.current || !patternRef.current || !textPosition) return;

      const context = contextRef.current;
      context.save();

      // Set up text rendering
      context.font = `16px Geneva-12`;
      context.textBaseline = "top";

      // Create pattern from the pattern canvas
      const pattern = context.createPattern(patternRef.current, "repeat");
      if (pattern) {
        context.fillStyle = pattern;
        context.fillText(text, textPosition.x, textPosition.y);
      }

      context.restore();
      saveToHistory();
    };

    const handleTextInput = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        const text = event.currentTarget.value;
        if (!text) {
          setIsTyping(false);
          return;
        }

        renderText(text);
        event.currentTarget.value = "";
        setIsTyping(false);
      }
    };

    const handleTextBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const text = event.currentTarget.value;
      if (text) {
        renderText(text);
      }
      setIsTyping(false);
    };

    const startDrawing = useCallback(
      (
        event:
          | React.MouseEvent<HTMLCanvasElement>
          | React.TouchEvent<HTMLCanvasElement>
      ) => {
        const canvas = canvasRef.current;
        if (!canvas || !contextRef.current) return;

        const point = getCanvasPoint(event);

        // Don't handle panning here anymore, let Framer Motion handle it
        if (selectedTool === "hand") return;

        // Store touch start position for tap detection
        if ("touches" in event) {
          touchStartRef.current = point;
          // Execute bucket fill immediately on touch for better responsiveness
          if (selectedTool === "bucket") {
            floodFill(Math.floor(point.x), Math.floor(point.y));
            return;
          }
        }

        // Handle rectangle selection tool
        if (selectedTool === "rect-select") {
          // If clicking outside selection, clear it
          if (selection && !isPointInSelection(point, selection)) {
            // Restore canvas to state before selection
            if (lastImageRef.current) {
              contextRef.current.putImageData(lastImageRef.current, 0, 0);
            }
            setSelection(null);
          }

          // If clicking inside existing selection, prepare for drag
          if (selection && isPointInSelection(point, selection)) {
            setIsDraggingSelection(true);
            dragStartRef.current = point;
            return;
          }

          // Start new selection
          startPointRef.current = point;
          // Store the current canvas state before starting new selection
          lastImageRef.current = contextRef.current.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );
          return;
        }

        // Handle lasso selection tool
        if (selectedTool === "select") {
          // If clicking outside selection, clear it
          if (selection && selection.type === "lasso" && selection.path) {
            const isInside = isPointInLassoPath(point, selection.path);
            if (!isInside) {
              // Restore canvas to state before selection
              if (lastImageRef.current) {
                contextRef.current.putImageData(lastImageRef.current, 0, 0);
              }
              setSelection(null);
            } else {
              // If clicking inside existing selection, prepare for drag
              setIsDraggingSelection(true);
              dragStartRef.current = point;
              return;
            }
          }

          // Start new lasso selection
          lassoPathRef.current = [point];
          // Store the current canvas state before starting new selection
          lastImageRef.current = contextRef.current.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );
          isDrawing.current = true;
          return;
        }

        // Clear any existing selection when starting to draw with other tools
        if (selection) {
          // Restore canvas to state before selection
          if (lastImageRef.current) {
            contextRef.current.putImageData(lastImageRef.current, 0, 0);
          }
          setSelection(null);
        }

        if (selectedTool === "text") {
          if (!isTyping) {
            // Only set new position when starting new text input
            setTextPosition(point);
          }
          setIsTyping(true);
          // Focus the input after a short delay to ensure it's mounted
          setTimeout(() => {
            if (textInputRef.current) {
              textInputRef.current.focus();
            }
          }, 0);
          return;
        }

        // Handle bucket fill for mouse click
        if (selectedTool === "bucket" && !("touches" in event)) {
          floodFill(Math.floor(point.x), Math.floor(point.y));
          return;
        }

        if (["line", "rectangle", "oval"].includes(selectedTool)) {
          // Store the current canvas state for shape preview
          lastImageRef.current = contextRef.current.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );
          startPointRef.current = point;
        } else {
          // Set up context based on tool
          if (selectedTool === "eraser") {
            contextRef.current.globalCompositeOperation = "destination-out";
            contextRef.current.strokeStyle = "#FFFFFF"; // Use white color for eraser
          } else {
            contextRef.current.globalCompositeOperation = "source-over";
            // Restore pattern for drawing tools
            if (patternRef.current) {
              const pattern = contextRef.current.createPattern(
                patternRef.current,
                "repeat"
              );
              if (pattern) {
                contextRef.current.strokeStyle = pattern;
                contextRef.current.fillStyle = pattern;
              }
            }
          }

          contextRef.current.beginPath();
          if (selectedTool !== "spray") {
            contextRef.current.moveTo(point.x, point.y);
          } else {
            sprayAtPoint(point);
          }
        }

        isDrawing.current = true;
      },
      [
        selectedTool,
        selection,
        isTyping,
        floodFill,
        isPointInSelection,
        isPointInLassoPath,
        setSelection,
        setTextPosition,
        setIsTyping,
      ]
    );

    const draw = useCallback(
      (
        event:
          | React.MouseEvent<HTMLCanvasElement>
          | React.TouchEvent<HTMLCanvasElement>
      ) => {
        if (!contextRef.current || !canvasRef.current) return;

        const point = getCanvasPoint(event);

        if (selectedTool === "hand") return;

        if (isDraggingSelection && selection && dragStartRef.current) {
          const dx = point.x - dragStartRef.current.x;
          const dy = point.y - dragStartRef.current.y;

          setSelection((prev) => {
            if (!prev) return null;
            if (prev.type === "rectangle") {
              return {
                ...prev,
                startX: prev.startX + dx,
                startY: prev.startY + dy,
              };
            } else if (prev.type === "lasso" && prev.path) {
              // Move all path points
              const newPath = prev.path.map((p) => ({
                x: p.x + dx,
                y: p.y + dy,
              }));
              return {
                ...prev,
                startX: prev.startX + dx,
                startY: prev.startY + dy,
                path: newPath,
              };
            }
            return prev;
          });

          dragStartRef.current = point;
          return;
        }

        // Handle lasso selection drawing
        if (selectedTool === "select" && isDrawing.current && lastImageRef.current) {
          // Add point to lasso path
          lassoPathRef.current.push(point);

          // Restore canvas and draw lasso preview
          contextRef.current.putImageData(lastImageRef.current, 0, 0);

          contextRef.current.save();
          contextRef.current.strokeStyle = "#000";
          contextRef.current.lineWidth = 1;
          contextRef.current.setLineDash([5, 5]);
          contextRef.current.lineDashOffset = dashOffsetRef.current;

          if (lassoPathRef.current.length > 1) {
            contextRef.current.beginPath();
            contextRef.current.moveTo(
              lassoPathRef.current[0].x,
              lassoPathRef.current[0].y
            );
            for (let i = 1; i < lassoPathRef.current.length; i++) {
              contextRef.current.lineTo(
                lassoPathRef.current[i].x,
                lassoPathRef.current[i].y
              );
            }
            // Draw line back to start if path is long enough
            if (lassoPathRef.current.length > 2) {
              contextRef.current.lineTo(
                lassoPathRef.current[0].x,
                lassoPathRef.current[0].y
              );
            }
            contextRef.current.stroke();
          }

          contextRef.current.restore();
          return;
        }

        if (
          selectedTool === "rect-select" &&
          startPointRef.current &&
          lastImageRef.current
        ) {
          contextRef.current.putImageData(lastImageRef.current, 0, 0);

          const width = point.x - startPointRef.current.x;
          const height = point.y - startPointRef.current.y;

          contextRef.current.save();
          contextRef.current.strokeStyle = "#000";
          contextRef.current.lineWidth = 1;
          contextRef.current.setLineDash([5, 5]);
          contextRef.current.strokeRect(
            startPointRef.current.x,
            startPointRef.current.y,
            width,
            height
          );
          contextRef.current.restore();
          return;
        }

        if (!isDrawing.current) return;

        if (
          ["line", "rectangle", "oval"].includes(selectedTool) &&
          startPointRef.current &&
          lastImageRef.current
        ) {
          contextRef.current.putImageData(lastImageRef.current, 0, 0);

          contextRef.current.globalCompositeOperation = "source-over";
          if (patternRef.current) {
            const pattern = contextRef.current.createPattern(
              patternRef.current,
              "repeat"
            );
            if (pattern) {
              contextRef.current.strokeStyle = pattern;
            }
          }

          contextRef.current.beginPath();

          if (selectedTool === "line") {
            contextRef.current.moveTo(
              startPointRef.current.x,
              startPointRef.current.y
            );
            contextRef.current.lineTo(point.x, point.y);
          } else if (selectedTool === "rectangle") {
            const width = point.x - startPointRef.current.x;
            const height = point.y - startPointRef.current.y;
            contextRef.current.rect(
              startPointRef.current.x,
              startPointRef.current.y,
              width,
              height
            );
          } else if (selectedTool === "oval") {
            const centerX = (startPointRef.current.x + point.x) / 2;
            const centerY = (startPointRef.current.y + point.y) / 2;
            const radiusX = Math.abs(point.x - startPointRef.current.x) / 2;
            const radiusY = Math.abs(point.y - startPointRef.current.y) / 2;

            contextRef.current.ellipse(
              centerX,
              centerY,
              radiusX,
              radiusY,
              0,
              0,
              2 * Math.PI
            );
          }

          contextRef.current.stroke();
        } else if (!["line", "rectangle", "oval"].includes(selectedTool)) {
          if (selectedTool === "spray") {
            sprayAtPoint(point);
          } else {
            contextRef.current.lineTo(point.x, point.y);
            contextRef.current.stroke();
          }
        }
      },
      [selectedTool, isDraggingSelection, selection]
    );

    const stopDrawing = useCallback(
      (
        event:
          | React.MouseEvent<HTMLCanvasElement>
          | React.TouchEvent<HTMLCanvasElement>
      ) => {
        const canvas = canvasRef.current;
        if (!canvas || !contextRef.current) return;

        if (selectedTool === "hand") return;

        const point = getCanvasPoint(event);

        touchStartRef.current = null;

        // Handle lasso selection completion
        if (selectedTool === "select" && lassoPathRef.current.length > 2) {
          const path = [...lassoPathRef.current];
          
          // Calculate bounding box
          let minX = path[0].x;
          let minY = path[0].y;
          let maxX = path[0].x;
          let maxY = path[0].y;

          for (const p of path) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }

          const width = maxX - minX;
          const height = maxY - minY;

          if (width > 0 && height > 0) {
            if (lastImageRef.current) {
              contextRef.current.putImageData(lastImageRef.current, 0, 0);
            }

            // Extract selection region (will be used for copy/cut)
            const selectionImageData = contextRef.current.getImageData(
              minX,
              minY,
              width,
              height
            );

            setSelection({
              type: "lasso",
              startX: minX,
              startY: minY,
              width,
              height,
              path,
              imageData: selectionImageData,
            });
          } else {
            if (lastImageRef.current) {
              contextRef.current.putImageData(lastImageRef.current, 0, 0);
            }
            setSelection(null);
          }

          lassoPathRef.current = [];
          isDrawing.current = false;
        }

        if (selectedTool === "rect-select" && startPointRef.current) {
          const width = point.x - startPointRef.current.x;
          const height = point.y - startPointRef.current.y;

          const startX = Math.min(point.x, startPointRef.current.x);
          const startY = Math.min(point.y, startPointRef.current.y);
          const absWidth = Math.abs(width);
          const absHeight = Math.abs(height);

          if (absWidth > 0 && absHeight > 0) {
            if (lastImageRef.current) {
              contextRef.current.putImageData(lastImageRef.current, 0, 0);
            }

            const selectionImageData = contextRef.current.getImageData(
              startX,
              startY,
              absWidth,
              absHeight
            );

            setSelection({
              type: "rectangle",
              startX,
              startY,
              width: absWidth,
              height: absHeight,
              imageData: selectionImageData,
            });
          } else {
            if (lastImageRef.current) {
              contextRef.current.putImageData(lastImageRef.current, 0, 0);
            }
            setSelection(null);
          }
        }

        if (isDraggingSelection) {
          setIsDraggingSelection(false);
          dragStartRef.current = null;
        }

        if (
          isDrawing.current ||
          isDraggingSelection ||
          selectedTool === "bucket"
        ) {
          saveToHistory();
        }

        isDrawing.current = false;
        startPointRef.current = null;

        if (contextRef.current && selectedTool === "eraser") {
          contextRef.current.globalCompositeOperation = "source-over";
          if (patternRef.current) {
            const pattern = contextRef.current.createPattern(
              patternRef.current,
              "repeat"
            );
            if (pattern) {
              contextRef.current.strokeStyle = pattern;
            }
          }
        }
      },
      [
        selectedTool,
        isDraggingSelection,
        setSelection,
        setIsDraggingSelection,
        saveToHistory,
      ]
    );

    // Unified pointer event handlers
    const handlePointerDown = useCallback(
      (
        event:
          | React.MouseEvent<HTMLCanvasElement>
          | React.TouchEvent<HTMLCanvasElement>
      ) => {
        event.preventDefault();
        startDrawing(event);
      },
      [startDrawing]
    );

    const handlePointerMove = useCallback(
      (
        event:
          | React.MouseEvent<HTMLCanvasElement>
          | React.TouchEvent<HTMLCanvasElement>
      ) => {
        event.preventDefault();
        draw(event);
      },
      [draw]
    );

    const handlePointerUp = useCallback(
      (
        event:
          | React.MouseEvent<HTMLCanvasElement>
          | React.TouchEvent<HTMLCanvasElement>
      ) => {
        event.preventDefault();
        stopDrawing(event);
      },
      [stopDrawing]
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const touchStartHandler = (e: TouchEvent) =>
        handlePointerDown(e as unknown as React.TouchEvent<HTMLCanvasElement>);
      const touchMoveHandler = (e: TouchEvent) =>
        handlePointerMove(e as unknown as React.TouchEvent<HTMLCanvasElement>);
      const touchEndHandler = (e: TouchEvent) =>
        handlePointerUp(e as unknown as React.TouchEvent<HTMLCanvasElement>);

      canvas.addEventListener("touchstart", touchStartHandler, {
        passive: false,
      });
      canvas.addEventListener("touchmove", touchMoveHandler, {
        passive: false,
      });
      canvas.addEventListener("touchend", touchEndHandler, {
        passive: false,
      });

      return () => {
        canvas.removeEventListener("touchstart", touchStartHandler);
        canvas.removeEventListener("touchmove", touchMoveHandler);
        canvas.removeEventListener("touchend", touchEndHandler);
      };
    }, [handlePointerDown, handlePointerMove, handlePointerUp]);

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-auto"
        style={{
          cursor:
            selectedTool === "hand"
              ? "grab"
              : selectedTool === "rect-select"
              ? "crosshair"
              : selection
              ? "move"
              : "crosshair",
        }}
      >
        <motion.div
          className="bg-white"
          style={{
            minWidth: `${canvasWidth}px`,
            minHeight: `${canvasHeight}px`,
          }}
          drag={selectedTool === "hand"}
          dragConstraints={containerRef}
          dragElastic={0.2}
          dragMomentum={true}
          dragTransition={{
            bounceStiffness: 300,
            bounceDamping: 20,
            min: 0,
            max: 100,
          }}
        >
          <div
            className="relative"
            style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
          >
            <canvas
              ref={canvasRef}
              style={{
                imageRendering: "pixelated",
                width: "100%",
                height: "100%",
                touchAction: selectedTool === "hand" ? "none" : "none",
                cursor: selectedTool === "hand" ? "grab" : "crosshair",
              }}
              className={`${
                selectedTool === "rect-select"
                  ? "cursor-crosshair"
                  : selection
                  ? "cursor-move"
                  : "cursor-crosshair"
              }`}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
            />
            {isTyping && textPosition && (
              <input
                ref={textInputRef}
                type="text"
                className="absolute bg-transparent border-none outline-none font-geneva-12 text-black pointer-events-auto"
                style={{
                  left: `${textPosition.x}px`,
                  top: `${textPosition.y}px`,
                  fontSize: `16px`,
                  minWidth: "100px",
                  padding: 0,
                  margin: 0,
                  transform: "translateZ(0)",
                }}
                onKeyDown={handleTextInput}
                onBlur={handleTextBlur}
              />
            )}
          </div>
        </motion.div>
      </div>
    );
  }
);
