import * as React from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import { osFieldTextareaClasses } from "@/components/ui/os-field-styles";

export interface OsTextareaProps
  extends Omit<React.ComponentProps<"textarea">, "className"> {
  className?: string;
  /** Extra classes for the inner textarea element. */
  textareaClassName?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

/**
 * OS-themed multi-line field: same recessed chrome as SearchInput but with
 * `rounded-os` corners instead of a full pill.
 */
export function OsTextarea({
  className,
  textareaClassName,
  textareaRef,
  disabled,
  ...props
}: OsTextareaProps) {
  const { isMacOSTheme } = useThemeFlags();

  return (
    <textarea
      ref={textareaRef}
      disabled={disabled}
      data-os-field-input="true"
      className={cn(
        osFieldTextareaClasses(isMacOSTheme, textareaClassName),
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...props}
    />
  );
}
