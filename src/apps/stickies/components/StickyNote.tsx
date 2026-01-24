import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { StickyNote as StickyNoteType, StickyColor } from "@/stores/useStickiesStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface StickyNoteProps {
  note: StickyNoteType;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Omit<StickyNoteType, "id" | "createdAt">>) => void;
  onDelete: () => void;
  zIndex: number;
}

const COLOR_STYLES: Record<StickyColor, { bg: string; border: string; text: string }> = {
  yellow: {
    bg: "#FFFFA5",
    border: "#E6E650",
    text: "#000000",
  },
  blue: {
    bg: "#D4EDFC",
    border: "#8EC8E8",
    text: "#000000",
  },
  green: {
    bg: "#D4F5D4",
    border: "#8ED88E",
    text: "#000000",
  },
  pink: {
    bg: "#FFD4E5",
    border: "#FF8EB8",
    text: "#000000",
  },
  purple: {
    bg: "#E8D4F5",
    border: "#C88EE8",
    text: "#000000",
  },
  orange: {
    bg: "#FFE4C4",
    border: "#FFB870",
    text: "#000000",
  },
};

export function StickyNote({
  note,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  zIndex,
}: StickyNoteProps) {
  const { t } = useTranslation();
  const noteRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const colors = COLOR_STYLES[note.color];

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      onSelect();
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - note.position.x,
        y: e.clientY - note.position.y,
      });
    },
    [note.position, onSelect]
  );

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      setIsResizing(true);
    },
    [onSelect]
  );

  // Handle mouse move for drag and resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        let newX = e.clientX - dragOffset.x;
        let newY = e.clientY - dragOffset.y;

        // Constrain to viewport bounds
        const maxX = window.innerWidth - note.size.width;
        const maxY = window.innerHeight - note.size.height;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(24, Math.min(newY, maxY)); // 24px for menu bar

        onUpdate({ position: { x: newX, y: newY } });
      }

      if (isResizing) {
        const noteEl = noteRef.current;
        if (!noteEl) return;

        const rect = noteEl.getBoundingClientRect();
        const newWidth = Math.max(180, e.clientX - rect.left);
        const newHeight = Math.max(120, e.clientY - rect.top);

        onUpdate({ size: { width: newWidth, height: newHeight } });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, note.size, onUpdate]);

  // Handle content change
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ content: e.target.value });
    },
    [onUpdate]
  );

  const noteElement = (
    <div
      ref={noteRef}
      onMouseDown={onSelect}
      className={cn(
        "fixed flex flex-col overflow-hidden",
        "shadow-[0_4px_12px_rgba(0,0,0,0.15)]",
        isDragging && "cursor-grabbing opacity-95"
      )}
      style={{
        left: note.position.x,
        top: note.position.y,
        width: note.size.width,
        height: note.size.height,
        zIndex: zIndex,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "1px",
      }}
    >
      {/* Compact title bar */}
      <div
        onMouseDown={handleDragStart}
        className={cn(
          "flex items-center h-[14px] px-[3px] cursor-grab select-none",
          isDragging && "cursor-grabbing"
        )}
        style={{
          backgroundColor: colors.bg,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-[9px] h-[9px] flex items-center justify-center"
          style={{ 
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bg,
          }}
          title="Close"
        />
      </div>

      {/* Content */}
      <textarea
        ref={textareaRef}
        value={note.content}
        onChange={handleContentChange}
        placeholder={t("apps.stickies.placeholder")}
        className={cn(
          "flex-1 p-2 resize-none outline-none bg-transparent",
          "placeholder:text-black/30"
        )}
        style={{ 
          fontSize: "13px", 
          lineHeight: "1.5",
          color: colors.text,
          fontFamily: "Geneva, Helvetica, sans-serif",
        }}
      />

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        style={{
          background: `linear-gradient(135deg, transparent 50%, ${colors.border} 50%)`,
        }}
      />
    </div>
  );

  // Render via portal to ensure notes float above everything
  return createPortal(noteElement, document.body);
}
