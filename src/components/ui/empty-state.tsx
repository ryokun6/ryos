import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  message: string;
  className?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ message, className, icon }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-4 text-[11px] text-neutral-400",
        className
      )}
    >
      {icon && <div className="mb-2">{icon}</div>}
      <span>{message}</span>
    </div>
  );
}
