import { useState, useEffect } from "react";

const FRAMES = ["!   ", "!!  ", "!!! ", "!!  ", "!   "];

export function UrgentMessageAnimation() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length);
    }, 300);

    return () => clearInterval(interval);
  }, []);

  return <span className="text-red-400 animate-pulse">{FRAMES[frame]}</span>;
}