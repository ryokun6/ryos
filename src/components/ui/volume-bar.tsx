import { motion } from "framer-motion";

interface VolumeBarProps {
  volume: number;
  className?: string;
}

export function VolumeBar({ volume, className = "" }: VolumeBarProps) {
  // Normalize volume to 0-1 range and add some visual boost
  const normalizedVolume = Math.min(1, Math.max(0, volume * 2));

  return (
    <div
      className={`h-1 bg-neutral-200 rounded-full overflow-hidden ${className}`}
    >
      <motion.div
        className="h-full bg-black rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${normalizedVolume * 100}%` }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.15 }}
      />
    </div>
  );
}
