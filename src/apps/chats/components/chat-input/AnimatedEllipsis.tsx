import { useState, useEffect } from "react";

// Animated ellipsis component (copied from TerminalAppComponent)
export function AnimatedEllipsis() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const patterns = [".", "..", "...", "..", ".", ".", "..", "..."];
    let index = 0;

    const interval = setInterval(() => {
      setDots(patterns[index]);
      index = (index + 1) % patterns.length;
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return <span>{dots}</span>;
}
