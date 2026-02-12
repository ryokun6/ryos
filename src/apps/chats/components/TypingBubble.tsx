/**
 * iMessage-style typing indicator dots.
 * 3 dots that animate opacity in a staggered wave pattern using CSS keyframes.
 * Renders just the dots — meant to be placed inside a chat bubble.
 */
export function TypingDots() {
  return (
    <>
      <style>{`
        @keyframes typingDot {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
      <div className="flex items-center gap-[3px]" style={{ minHeight: "1lh" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block rounded-full"
            style={{
              width: 7,
              height: 7,
              backgroundColor: "currentColor",
              opacity: 0.3,
              animation: `typingDot 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}
