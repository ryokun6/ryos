import { motion } from "framer-motion";

/**
 * iMessage-style typing indicator dots.
 * 3 dots that animate opacity in a staggered wave pattern.
 * Renders just the dots — meant to be placed inside a chat bubble.
 */
export function TypingDots() {
  return (
    <div className="flex items-center gap-[3px]" style={{ minHeight: "1lh" }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block rounded-full"
          style={{
            width: 7,
            height: 7,
            backgroundColor: "currentColor",
          }}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: [0.35, 0.9, 0.35] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}
