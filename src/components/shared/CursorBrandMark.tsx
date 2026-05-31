import { cn } from "@/lib/utils";

export interface CursorBrandMarkProps {
  /** Outer circle diameter (Tailwind size class number, e.g. 9 → size-9). */
  size?: 9 | 6;
  className?: string;
}

/**
 * Cursor cube logo in a fully round badge (light/dark assets).
 */
export function CursorBrandMark({ size = 9, className }: CursorBrandMarkProps) {
  const outer = size === 9 ? "size-9" : "size-6";
  const inner = size === 9 ? "size-5" : "size-4";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        outer,
        className
      )}
      aria-hidden
    >
      <img
        src="/brands/cursor-cube-2d-light.svg"
        alt=""
        width={size === 9 ? 20 : 16}
        height={size === 9 ? 20 : 16}
        className={cn(inner, "dark:hidden")}
        draggable={false}
      />
      <img
        src="/brands/cursor-cube-2d-dark.svg"
        alt=""
        width={size === 9 ? 20 : 16}
        height={size === 9 ? 20 : 16}
        className={cn(inner, "hidden dark:block")}
        draggable={false}
      />
    </span>
  );
}
