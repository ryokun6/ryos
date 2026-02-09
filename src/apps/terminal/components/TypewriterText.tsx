import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { parseSimpleMarkdown } from "./typewriterMarkdown";

interface TypewriterTextProps {
  text: string;
  className?: string;
  speed?: number;
  renderMarkdown?: boolean;
}

export function TypewriterText({
  text,
  className,
  speed = 15,
  renderMarkdown = false,
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const textRef = useRef(text);

  useEffect(() => {
    // Reset when text changes
    setDisplayedText("");
    setIsComplete(false);
    textRef.current = text;

    // Skip animation for long text (performance)
    if (text.length > 200) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    // Adjust speed based on text length - faster for longer text
    const adjustedSpeed =
      text.length > 100 ? speed * 0.7 : text.length > 50 ? speed * 0.85 : speed;

    // Split into reasonable chunks for better performance
    // This makes animation smoother by reducing React state updates
    const chunkSize = text.length > 100 ? 3 : text.length > 50 ? 2 : 1;
    const chunks: string[] = [];

    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, Math.min(i + chunkSize, text.length)));
    }

    // Use a recursive setTimeout for more reliable animation
    let currentIndex = 0;
    let timeoutId: NodeJS.Timeout;

    const typeNextChunk = () => {
      if (currentIndex < chunks.length) {
        const chunk = chunks[currentIndex];
        setDisplayedText((prev) => prev + chunk);
        currentIndex++;

        // Pause longer after punctuation for natural rhythm
        const endsWithPunctuation = /[.,!?;:]$/.test(chunk);
        const delay = endsWithPunctuation ? adjustedSpeed * 3 : adjustedSpeed;

        timeoutId = setTimeout(typeNextChunk, delay);
      } else {
        setIsComplete(true);
      }
    };

    // Start the typing animation
    timeoutId = setTimeout(typeNextChunk, adjustedSpeed);

    // Clean up on unmount
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [text, speed]);

  return (
    <span className={`select-text cursor-text ${className || ""}`}>
      {renderMarkdown ? parseSimpleMarkdown(displayedText) : displayedText}
      {!isComplete && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        >
          _
        </motion.span>
      )}
    </span>
  );
}