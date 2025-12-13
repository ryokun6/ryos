import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface SeekBarProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  isHovered?: boolean;
  onDragChange?: (isDragging: boolean, seekTime?: number) => void;
  autoDismissTimeout?: number; // Time in milliseconds before auto-dismissing
}

export function SeekBar({
  duration,
  currentTime,
  onSeek,
  isPlaying,
  isHovered: parentHovered,
  onDragChange,
  autoDismissTimeout = 3000, // Default 3 seconds
}: SeekBarProps) {
  const [isLocalHovered, setIsLocalHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate progress percentage
  const progress = (currentTime / duration) * 100;

  // Update seek position when current time changes
  useEffect(() => {
    if (!isDragging) {
      setSeekPosition(progress);
    }
  }, [currentTime, duration, isDragging, progress]);

  // Auto-dismiss functionality
  const startAutoDismissTimer = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
    }

    if (isPlaying && !isDragging) {
      autoDismissTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, autoDismissTimeout);
    }
  }, [isPlaying, isDragging, autoDismissTimeout]);

  const clearAutoDismissTimer = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  // Show seekbar when interaction occurs
  const showSeekBar = useCallback(() => {
    setIsVisible(true);
    clearAutoDismissTimer();
    startAutoDismissTimer();
  }, [clearAutoDismissTimer, startAutoDismissTimer]);

  // Handle visibility based on interactions
  useEffect(() => {
    if (isPlaying && (parentHovered || isLocalHovered || isDragging)) {
      setIsVisible(true);
      clearAutoDismissTimer();
      if (!isDragging) {
        startAutoDismissTimer();
      }
    } else if (!isPlaying) {
      setIsVisible(false);
      clearAutoDismissTimer();
    }
  }, [
    isPlaying,
    parentHovered,
    isLocalHovered,
    isDragging,
    clearAutoDismissTimer,
    startAutoDismissTimer,
  ]);

  // NEW: Always ensure a timer is running whenever the bar is visible and dragging has ended.
  // This catches mobile swipe cases where parentHovered may remain true longer than expected.
  useEffect(() => {
    if (isVisible && !isDragging && isPlaying) {
      clearAutoDismissTimer();
      startAutoDismissTimer();
    }
  }, [
    isVisible,
    isDragging,
    isPlaying,
    clearAutoDismissTimer,
    startAutoDismissTimer,
  ]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      clearAutoDismissTimer();
    };
  }, [clearAutoDismissTimer]);

  // Calculate position from client coordinates (works for both mouse and touch)
  const calculatePosition = useCallback((clientX: number) => {
    if (!seekBarRef.current) return 0;
    const rect = seekBarRef.current.getBoundingClientRect();
    const position = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, position));
  }, []);

  // Handle mouse movement on seek bar
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const position = calculatePosition(e.clientX);
    setSeekPosition(position);
  };

  // Handle mouse down on seek bar
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent click from reaching the play/pause overlay
    setIsDragging(true);
    showSeekBar();
    const position = calculatePosition(e.clientX);
    setSeekPosition(position);
    if (onDragChange) {
      const seekTime = (position / 100) * duration;
      onDragChange(true, seekTime);
    }
  };

  // Handle mouse up - seek to position
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      onSeek((seekPosition / 100) * duration);
      setIsDragging(false);
      if (onDragChange) {
        onDragChange(false);
      }
      startAutoDismissTimer();
    }
  }, [
    isDragging,
    onSeek,
    seekPosition,
    duration,
    onDragChange,
    startAutoDismissTimer,
  ]);

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent default touch behavior
    e.stopPropagation();
    setIsDragging(true);
    showSeekBar();
    const touch = e.touches[0];
    const position = calculatePosition(touch.clientX);
    setSeekPosition(position);
    if (onDragChange) {
      const seekTime = (position / 100) * duration;
      onDragChange(true, seekTime);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling while dragging
    const touch = e.touches[0];
    const position = calculatePosition(touch.clientX);
    setSeekPosition(position);
    if (onDragChange) {
      const seekTime = (position / 100) * duration;
      onDragChange(true, seekTime);
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      onSeek((seekPosition / 100) * duration);
      setIsDragging(false);
      if (onDragChange) {
        onDragChange(false);
      }
      startAutoDismissTimer();
    }
  };

  // Add global mouse up listener when dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => {
        handleMouseUp();
      };

      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const position = calculatePosition(e.clientX);
        setSeekPosition(position);
        if (onDragChange) {
          const seekTime = (position / 100) * duration;
          onDragChange(true, seekTime);
        }
      };

      document.addEventListener("mouseup", handleGlobalMouseUp);
      document.addEventListener("mousemove", handleGlobalMouseMove);

      return () => {
        document.removeEventListener("mouseup", handleGlobalMouseUp);
        document.removeEventListener("mousemove", handleGlobalMouseMove);
      };
    }
  }, [
    isDragging,
    duration,
    onSeek,
    onDragChange,
    calculatePosition,
    handleMouseUp,
  ]);

  if (!isPlaying) return null;

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent h-48 pointer-events-none"
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: isVisible ? 1 : 0,
        y: isVisible ? 0 : 20,
      }}
      transition={{
        duration: 0.2,
        ease: "easeOut",
      }}
      onMouseEnter={() => {
        setIsLocalHovered(true);
        showSeekBar();
      }}
      onMouseLeave={() => {
        setIsLocalHovered(false);
        if (!isDragging) {
          startAutoDismissTimer();
        }
      }}
    >
      <div className="absolute bottom-0 left-0 right-0 px-4 py-3">
        {/* Seek bar */}
        <div
          ref={seekBarRef}
          className={`relative h-[8px] rounded-full cursor-pointer pointer-events-auto overflow-hidden transition-all duration-150 select-none no-select-gesture ${
            isDragging
              ? "border border-white/80 bg-white/25"
              : "border border-white/50 bg-white/15"
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={!isDragging ? handleMouseMove : undefined}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            touchAction: "none", // Prevent default touch behaviors
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        >
          {/* Progress bar */}
          <div
            className={`absolute left-0 top-0 h-full transition-colors duration-150 ${
              isDragging ? "bg-white/80" : "bg-white/50"
            }`}
            style={{ width: `${isDragging ? seekPosition : progress}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}
