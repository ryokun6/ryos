import { useMemo } from "react";

/**
 * Inline SVG play/pause indicator for the modern iPod titlebar.
 *
 * Uses an embedded `<linearGradient>` so the glyph can be filled with
 * the same vertical blue gradient as the row-selection highlight
 * (`linear-gradient(180deg, rgb(60, 184, 255) 0%, rgb(52, 122, 181) 100%)`).
 * Phosphor icons render with `currentColor` and don't expose a way to
 * paint a gradient, so this small custom SVG is the cleanest way to
 * land that look without adding a new icon dep.
 *
 * Each instance gets a unique gradient ID — multiple icons may render
 * in the same DOM (e.g. mini-player + screen titlebar + Cover Flow
 * status bar) and SVG defs are document-scoped.
 */
export function IpodModernPlayPauseIcon({
  playing,
  size = 10,
}: {
  playing: boolean;
  size?: number;
}) {
  const gradientId = useMemo(
    () => `ipod-modern-titlebar-grad-${Math.random().toString(36).slice(2)}`,
    []
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label={playing ? "playing" : "paused"}
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(60, 184, 255)" />
          <stop offset="100%" stopColor="rgb(52, 122, 181)" />
        </linearGradient>
      </defs>
      {playing ? (
        <path d="M8 5v14l11-7z" fill={`url(#${gradientId})`} />
      ) : (
        <g fill={`url(#${gradientId})`}>
          <rect x="6" y="5" width="4" height="14" rx="0.5" />
          <rect x="14" y="5" width="4" height="14" rx="0.5" />
        </g>
      )}
    </svg>
  );
}
