import { cn } from "@/lib/utils";

interface BookSpineOverlayProps {
  variant: "grid" | "list";
}

/** Subtle spine shadow and hinge highlight on shelf book covers. */
export function BookSpineOverlay({ variant }: BookSpineOverlayProps) {
  const isGrid = variant === "grid";

  return (
    <>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/45 to-transparent",
          isGrid ? "w-[6px]" : "w-[3px]"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 w-px bg-white/18",
          isGrid ? "left-[6px]" : "left-[3px]"
        )}
      />
    </>
  );
}
