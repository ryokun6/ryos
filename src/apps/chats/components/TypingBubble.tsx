import { motion } from "framer-motion";

/**
 * iMessage-style typing indicator bubble.
 * Gray bubble with 3 dots that animate opacity in a staggered pattern.
 */
export function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="flex flex-col items-start w-full"
    >
      <div className="text-[10px] chat-messages-meta text-gray-500 mb-0.5 font-['Geneva-9'] mb-[-2px] select-text flex items-center gap-2">
        <span>ryo</span>
      </div>
      <div
        className="flex items-center gap-[3px] rounded px-2.5 py-2 w-fit"
        style={{ backgroundColor: "#e5e5ea" }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block rounded-full"
            style={{
              width: 7,
              height: 7,
              backgroundColor: "#8e8e93",
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
