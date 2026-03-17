import * as React from "react";
import { MagnifyingGlass, XCircle } from "@phosphor-icons/react";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  width?: string;
  ariaLabel?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "",
  className,
  width,
  ariaLabel,
  onKeyDown,
}: SearchInputProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isMacOSTheme = currentTheme === "macosx";

  return (
    <div
      className={cn("relative min-w-0", className)}
      style={width ? { width } : undefined}
    >
      <MagnifyingGlass
        size={13}
        weight="bold"
        className={cn(
          "pointer-events-none absolute left-2 top-1/2 -translate-y-1/2",
          isMacOSTheme ? "text-black/45" : "text-black/35"
        )}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn(
          "w-full outline-none min-w-0",
          isMacOSTheme
            ? "rounded-full border border-black/40 bg-white pl-7 pr-7 py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] font-geneva-12"
            : "rounded-full border border-black/20 bg-white pl-7 pr-7 py-1 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]"
        )}
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
          className={cn(
            "absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center",
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
