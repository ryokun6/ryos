import { useState, useEffect } from "react";

export function UrgentMessageAnimation() {
  const [frame, setFrame] = useState(0);
  const frames = ["!   ", "!!  ", "!!! ", "!!  ", "!   "];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 300);

    return () => clearInterval(interval);
  }, [frames.length]);

  return <span className="text-red-400 animate-pulse">{frames[frame]}</span>;
}