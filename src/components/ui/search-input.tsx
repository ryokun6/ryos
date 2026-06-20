import * as React from "react";
import { MagnifyingGlass, XCircle } from "@phosphor-icons/react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";

interface OsPillInputPadding {
  /** Room for a left search glyph (`pl-7`). */
  withSearchIcon?: boolean;
  /** Room for a right clear button (`pr-7`). */
  withClearButton?: boolean;
}

function osPillInputClasses(
  isMacOSTheme: boolean,
  { withSearchIcon = false, withClearButton = false }: OsPillInputPadding = {},
  inputClassName?: string,
) {
  const pl = withSearchIcon ? "pl-7" : "pl-3";
  const pr = withClearButton ? "pr-7" : "pr-3";

  return cn(
    "w-full outline-none min-w-0",
    isMacOSTheme
      ? `rounded-full border border-black/40 bg-white ${pl} ${pr} py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] font-geneva-12`
      : `rounded-full border border-black/20 bg-white ${pl} ${pr} py-1 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]`,
    inputClassName,
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Extra classes for the inner input element (e.g. size overrides). */
  inputClassName?: string;
  width?: string;
  id?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  ariaLabel?: string;
  ariaBusy?: boolean;
  title?: string;
  /** Accessible label (and tooltip) for the clear button. */
  clearAriaLabel?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  /** Show the magnifying glass on the left (default true). */
  showSearchIcon?: boolean;
  /** Show the clear button when there is text (default true). */
  showClear?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "",
  className,
  inputClassName,
  width,
  id,
  inputRef,
  ariaLabel,
  ariaBusy,
  title,
  clearAriaLabel,
  onKeyDown,
  onFocus,
  onBlur,
  disabled,
  showSearchIcon = true,
  showClear = true,
}: SearchInputProps) {
  const { isMacOSTheme } = useThemeFlags();
  const canClear = showClear && value.length > 0 && !disabled;

  return (
    <div
      className={cn("relative min-w-0", className)}
      style={width ? { width } : undefined}
    >
      {showSearchIcon ? (
        <MagnifyingGlass
          size={13}
          weight="bold"
          className={cn(
            "pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 os-search-icon",
            isMacOSTheme ? "text-black/45" : "text-black/35",
          )}
        />
      ) : null}
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={ariaLabel}
        aria-busy={ariaBusy || undefined}
        title={title}
        placeholder={placeholder}
        disabled={disabled}
        data-os-search-input="true"
        className={osPillInputClasses(
          isMacOSTheme,
          {
            withSearchIcon: showSearchIcon,
            withClearButton: canClear,
          },
          inputClassName,
        )}
      />
      {canClear && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
          aria-label={clearAriaLabel}
          title={clearAriaLabel}
          className={cn(
            "absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center os-search-clear",
            isMacOSTheme
              ? "text-black/40 hover:text-black/60"
              : "text-black/35 hover:text-black/55"
          )}
        >
          <XCircle size={14} weight="fill" />
        </button>
      )}
    </div>
  );
}
