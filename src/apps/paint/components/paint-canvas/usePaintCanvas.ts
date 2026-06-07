import React, { useEffect, useRef, useImperativeHandle, useState, useCallback } from "react";
import type { Filter } from "../../types";
import { performFloodFill } from "./paintCanvasFloodFill";
import { extractSelectionRegion as extractSelectionRegionFromCanvas } from "./paintCanvasSelectionUtils";
import {
  compareImageData,
  getCanvasPoint,
  isPointInLassoPath,
  isPointInSelection,
} from "./paintCanvasUtils";
import type { PaintCanvasComponentProps, Point, Selection } from "./types";

export function usePaintCanvas({
  ref,
  selectedTool,
  selectedPattern,
  strokeWidth,
  onCanUndoChange,
  onCanRedoChange,
  onContentChange,
  canvasWidth = 589,
  canvasHeight = 418,
  isForeground = false,
}: PaintCanvasComponentProps) {
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

  // Handle canvas resize — preserve content at original position (no scaling)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const newW = Math.round(width);
        const newH = Math.round(height);

        if (canvas.width === newW && canvas.height === newH) return;

        // Snapshot current content at 1:1 (no scaling)
        const tempCanvas = document.createElement("canvas");
        const tempContext = tempCanvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (tempContext && contextRef.current) {
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          tempContext.drawImage(canvas, 0, 0);
        }

        // Update canvas pixel dimensions
        canvas.width = newW;
        canvas.height = newH;

        // Restore context properties (setting canvas.width resets the context)
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = strokeWidth;
          contextRef.current = context;

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

          // Fill new area with white, then paste old content at 1:1
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, newW, newH);
          if (tempContext) {
            context.drawImage(tempCanvas, 0, 0);
          }
        }
      }
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [strokeWidth]);

  // Handle ESC key for selection
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && selection) {
        if (lastImageRef.current && contextRef.current) {
          contextRef.current.putImageData(lastImageRef.current, 0, 0);
        }
        setSelection(null);
      }
    },
    [selection]
  );

  useEffect(() => {
    if (!isForeground) return;
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
      const initialImageData = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );
      historyRef.current = [initialImageData];
      historyIndexRef.current = 0;
      onCanUndoChange(false);
      onCanRedoChange(false);
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
  }, [
    selectedPattern,
    canvasHeight,
    canvasWidth,
    onCanRedoChange,
    onCanUndoChange,
    strokeWidth,
  ]);

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

  const extractSelectionRegion = useCallback(() => {
    if (!contextRef.current || !canvasRef.current || !selection) return null;
    return extractSelectionRegionFromCanvas(
      contextRef.current,
      canvasRef.current,
      selection
    );
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
      importImage: (source: string | HTMLImageElement) => {
        const drawOnCanvas = (img: HTMLImageElement) => {
          if (!canvasRef.current) return;

          const canvas = canvasRef.current;

          // Set canvas pixel dimensions to match the target size
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;

          // Re-acquire context after resizing (resets all state)
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.lineWidth = strokeWidth;
          contextRef.current = ctx;

          if (patternRef.current) {
            const pattern = ctx.createPattern(patternRef.current, "repeat");
            if (pattern) {
              ctx.strokeStyle = pattern;
              ctx.fillStyle = pattern;
            }
          }

          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          saveToHistory();
        };

        if (source instanceof HTMLImageElement) {
          drawOnCanvas(source);
        } else {
          const img = new Image();
          img.src = source;
          img.onload = () => drawOnCanvas(img);
        }
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
      selection,
      canvasWidth,
      canvasHeight,
      strokeWidth,
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

  const getPointFromEvent = useCallback(
    (
      event:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ): Point =>
      getCanvasPoint(canvasRef.current, event, startPointRef.current),
    []
  );

  const floodFill = useCallback(
    (startX: number, startY: number) => {
      const canvas = canvasRef.current;
      const context = contextRef.current;
      if (!canvas || !context || !patternRef.current) return;

      performFloodFill(
        canvas,
        context,
        patternRef.current,
        startX,
        startY,
        saveToHistory
      );
    },
    [saveToHistory]
  );

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

      const point = getPointFromEvent(event);

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
      getPointFromEvent,
      setSelection,
      setTextPosition,
      setIsTyping,
      sprayAtPoint,
    ]
  );

  const draw = useCallback(
    (
      event:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ) => {
      if (!contextRef.current || !canvasRef.current) return;

      const point = getPointFromEvent(event);

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
    [selectedTool, isDraggingSelection, selection, sprayAtPoint]
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

      const point = getPointFromEvent(event);

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

  return {
    containerRef,
    canvasRef,
    textInputRef,
    selectedTool,
    selection,
    canvasWidth,
    canvasHeight,
    isTyping,
    textPosition,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTextInput,
    handleTextBlur,
  };
}
