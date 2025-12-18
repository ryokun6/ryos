interface StatusDisplayProps {
  message: string;
}

export function StatusDisplay({ message }: StatusDisplayProps) {
  return (
    <div className="absolute top-4 left-4 pointer-events-none">
      <div className="relative">
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
      </div>
    </div>
  );
}
