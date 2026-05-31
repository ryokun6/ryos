import { cn } from "@/lib/utils";

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("bg-neutral-200 animate-pulse rounded", className)} />
);
