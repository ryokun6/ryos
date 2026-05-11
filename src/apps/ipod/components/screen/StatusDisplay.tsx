import {
  FastForward,
  Pause,
  Play,
  Prohibit,
  Rewind,
  SkipBack,
  SkipForward,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";

interface StatusDisplayProps {
  message: string;
  variant?: "classic" | "modern";
}

// Maps the leading playback glyph used in `showStatus(...)` calls to a
// Phosphor icon so the modern (color) skin renders proper vector icons
// instead of the raw emoji/symbol characters that Chicago renders for
// the classic skin. The trailing `\uFE0E` (text-presentation variation
// selector) is stripped before the lookup so both `"⏸"` and `"⏸\uFE0E"`
// resolve to the same icon.
const PLAYBACK_GLYPHS: Record<string, Icon> = {
  "\u25B6": Play,        // ▶
  "\u23F8": Pause,       // ⏸
  "\u23ED": SkipForward, // ⏭
  "\u23EE": SkipBack,    // ⏮
  "\u23E9": FastForward, // ⏩
  "\u23EA": Rewind,      // ⏪
  "\u274C": XCircle,     // ❌
  "\u{1F6AB}": Prohibit, // 🚫
};

interface ParsedStatus {
  Icon: Icon | null;
  rest: string;
}

function parseStatusMessage(message: string): ParsedStatus {
  if (!message) return { Icon: null, rest: message };

  // Match a leading glyph (handles surrogate pairs for emoji like 🚫)
  // followed by an optional U+FE0E variation selector.
  const match = message.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|.)\uFE0E?/);
  if (!match) return { Icon: null, rest: message };

  const leading = match[1];
  const Icon = PLAYBACK_GLYPHS[leading] ?? null;
  if (!Icon) return { Icon: null, rest: message };

  const rest = message.slice(match[0].length).replace(/^\s+/, "");
  return { Icon, rest };
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
          <ModernStatus message={message} />
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

function ModernStatus({ message }: { message: string }) {
  const { Icon, rest } = parseStatusMessage(message);
  const hasText = rest.length > 0;

  return (
    <div
      className="font-ipod-modern-ui text-white text-[15px] font-semibold leading-none flex items-center gap-1.5"
      style={{
        textShadow:
          "0 1px 1px rgba(0,0,0,0.45), 0 0 6px rgba(0,0,0,0.35)",
      }}
    >
      {Icon ? (
        <Icon
          size={15}
          weight="fill"
          aria-hidden
          style={{
            filter:
              "drop-shadow(0 1px 1px rgba(0,0,0,0.45)) drop-shadow(0 0 6px rgba(0,0,0,0.35))",
          }}
        />
      ) : null}
      {hasText || !Icon ? <span>{Icon ? rest : message}</span> : null}
    </div>
  );
}
