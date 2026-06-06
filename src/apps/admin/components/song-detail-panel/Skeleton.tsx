import { cn } from "@/lib/utils";

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("bg-os-panel-bg animate-pulse rounded", className)} />
);
