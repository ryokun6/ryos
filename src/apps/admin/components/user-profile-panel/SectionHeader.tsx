import React from "react";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SECTION_HEADER_CLASS } from "./types";

export interface SectionHeaderProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  isOpen?: boolean;
  showCaret?: boolean;
  className?: string;
}

export const SectionHeader = ({
  children,
  icon,
  onClick,
  isOpen,
  showCaret,
  className,
}: SectionHeaderProps) => {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-expanded={onClick ? isOpen : undefined}
      className={cn(
        SECTION_HEADER_CLASS,
        onClick && "flex items-center gap-1.5 text-left",
        className
      )}
    >
      {showCaret && (
        <CaretRight
          className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
          weight="bold"
        />
      )}
      {icon}
      <span>{children}</span>
    </Component>
  );
};
