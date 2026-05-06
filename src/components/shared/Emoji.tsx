import { useMemo } from "react";
import { cn } from "@/lib/utils";

function toCodepointHex(code: number): string {
  return code.toString(16);
}

/**
 * Variants tried in order. Some emoji on disk are stored without their
 * FE0F variation selector and vice-versa.
 */
function buildFilenameCandidates(emoji: string): string[] {
  const trimmed = emoji.replace(/\s+$/g, "");
  const codepoints: number[] = [];
  for (const char of trimmed) {
    const code = char.codePointAt(0);
    if (code !== undefined) codepoints.push(code);
  }

  const candidates = new Set<string>();
  candidates.add(codepoints.map(toCodepointHex).join("-"));
  candidates.add(
    codepoints
      .filter((cp) => cp !== 0xfe0f)
      .map(toCodepointHex)
      .join("-")
  );
  // Some single-codepoint emoji files on disk include FE0F.
  if (
    codepoints.length === 1 &&
    !codepoints.includes(0xfe0f) &&
    codepoints[0] !== 0xfe0f
  ) {
    candidates.add(`${toCodepointHex(codepoints[0])}-fe0f`);
  }
  return Array.from(candidates).filter(Boolean);
}

export interface EmojiProps {
  /** The emoji character/sequence to render (e.g. "🐠" or "🌤️"). */
  emoji: string;
  /** Pixel size; controls both width and height. Defaults to 1em. */
  size?: number | string;
  /** Optional accessible label; defaults to the emoji itself. */
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Optional title attribute, e.g. for tooltips. */
  title?: string;
  /** Render as inline span vs block div. Defaults to inline-block. */
  draggable?: boolean;
}

/**
 * Render an emoji as an Apple-style PNG sourced from public/emoji/apple.
 * Falls back to the raw emoji text via alt text if the image fails to load.
 */
export function Emoji({
  emoji,
  size,
  alt,
  className,
  style,
  title,
  draggable = false,
}: EmojiProps) {
  // Strip the most common combining marks for the primary src; fall back to
  // the next candidate via onError.
  const candidates = useMemo(() => buildFilenameCandidates(emoji), [emoji]);
  const primary = candidates[0] ?? "";

  const dimensionStyle: React.CSSProperties = {};
  if (size !== undefined) {
    dimensionStyle.width = typeof size === "number" ? `${size}px` : size;
    dimensionStyle.height = typeof size === "number" ? `${size}px` : size;
  } else {
    dimensionStyle.width = "1em";
    dimensionStyle.height = "1em";
  }

  return (
    <img
      src={`/emoji/apple/${primary}.png`}
      alt={alt ?? emoji}
      title={title}
      draggable={draggable}
      className={cn("inline-block align-[-0.15em] select-none", className)}
      style={{
        objectFit: "contain",
        // Avoid the browser's image smoothing turning the small PNG fuzzy.
        imageRendering: "auto",
        ...dimensionStyle,
        ...style,
      }}
      onError={(event) => {
        const img = event.currentTarget;
        const tried = (img.dataset.triedIndex
          ? parseInt(img.dataset.triedIndex, 10)
          : 0) + 1;
        if (tried < candidates.length) {
          img.dataset.triedIndex = String(tried);
          img.src = `/emoji/apple/${candidates[tried]}.png`;
          return;
        }
        img.dataset.triedIndex = String(candidates.length);
        // Replace the failing <img> with a text fallback so the original
        // emoji still renders even when no PNG exists for it.
        const text = document.createElement("span");
        text.textContent = emoji;
        if (size !== undefined) {
          const dim = typeof size === "number" ? `${size}px` : size;
          text.style.fontSize = dim;
          text.style.lineHeight = "1";
        }
        text.className = img.className;
        img.replaceWith(text);
      }}
    />
  );
}

export default Emoji;
