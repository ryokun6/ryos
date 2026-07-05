import { cn } from "@/lib/utils";

export type OsFieldShape = "pill" | "rounded";

export interface OsFieldPadding {
  /** Room for a left glyph (e.g. search icon). */
  withLeadingIcon?: boolean;
  /** Room for a right action (e.g. clear button). */
  withTrailingAction?: boolean;
}

/** Shared recessed field chrome used by SearchInput, OsTextarea, etc. */
export function osFieldInputClasses(
  isMacOSTheme: boolean,
  shape: OsFieldShape = "rounded",
  { withLeadingIcon = false, withTrailingAction = false }: OsFieldPadding = {},
  className?: string,
) {
  const rounding = shape === "pill" ? "rounded-full" : "rounded-os";
  const pl = withLeadingIcon ? "pl-7" : "pl-3";
  const pr = withTrailingAction ? "pr-7" : "pr-3";

  return cn(
    "w-full outline-none min-w-0",
    isMacOSTheme
      ? `${rounding} border border-black/40 bg-white ${pl} ${pr} py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] font-geneva-12`
      : `${rounding} border border-black/20 bg-white ${pl} ${pr} py-1 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]`,
    className,
  );
}

/** Multi-line variant: same chrome as osFieldInputClasses but with textarea padding. */
export function osFieldTextareaClasses(
  isMacOSTheme: boolean,
  className?: string,
) {
  return cn(
    "w-full outline-none min-w-0 resize-y",
    isMacOSTheme
      ? "rounded-os border border-black/40 bg-white px-3 py-2 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] font-geneva-12"
      : "rounded-os border border-black/20 bg-white px-3 py-2 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]",
    className,
  );
}
