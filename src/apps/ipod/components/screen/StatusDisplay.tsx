interface StatusDisplayProps {
  message: string;
  variant?: "classic" | "modern";
}

export function StatusDisplay({
  message,
  variant = "classic",
}: StatusDisplayProps) {
  const isModern = variant === "modern";

  return (
    <div className="absolute top-4 left-4 pointer-events-none">
      <div className="relative">
        {isModern ? (
          <div
            className="font-ipod-modern-ui text-white text-[15px] font-semibold leading-none"
            style={{
              textShadow:
                "0 1px 1px rgba(0,0,0,0.45), 0 0 6px rgba(0,0,0,0.35)",
            }}
          >
            {message}
          </div>
        ) : (
          <>
            <div className="font-chicago text-white text-xl relative z-10">
              {message}
            </div>
            <div
              className="font-chicago text-black text-xl absolute inset-0"
              style={{
                WebkitTextStroke: "3px black",
                textShadow: "none",
              }}
            >
              {message}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
