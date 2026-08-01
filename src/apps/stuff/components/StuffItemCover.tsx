import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { colorFromString, formatMoney } from "../utils/colors";
import type { StuffItem, StuffTag } from "../types";

interface StuffItemCoverProps {
  item: StuffItem;
  tags: StuffTag[];
  selected?: boolean;
  size?: "grid" | "list";
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function StuffItemCover({
  item,
  tags,
  selected,
  size = "grid",
  onClick,
  onContextMenu,
}: StuffItemCoverProps) {
  const colors = colorFromString(item.id + item.title);
  const isGrid = size === "grid";
  const width = isGrid ? 110 : 40;
  const height = isGrid ? 140 : 52;
  const primaryTag = tags.find((tag) => item.tagIds.includes(tag.id));
  const price =
    formatMoney(item.prices.discounted ?? item.prices.original, item.prices.currency) ??
    null;

  return (
    <motion.button
      type="button"
      whileHover={isGrid ? { y: -8 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-[2px] rounded-l-[4px] text-left shadow-md outline-none",
        selected && "ring-2 ring-os-accent ring-offset-1"
      )}
      style={{
        width,
        height,
        boxShadow: isGrid
          ? "-2px 4px 10px rgba(0,0,0,0.35), -1px 1px 0 rgba(0,0,0,0.2)"
          : "-1px 2px 4px rgba(0,0,0,0.25)",
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {item.imageDataUrl ? (
        <img
          src={item.imageDataUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col justify-between p-2"
          style={{ backgroundColor: colors.bg, color: colors.fg }}
        >
          <span
            className={cn(
              "line-clamp-4 font-apple-garamond leading-tight",
              isGrid ? "text-[13px]" : "text-[9px] line-clamp-2"
            )}
          >
            {item.title}
          </span>
          {isGrid && item.brand && (
            <span className="truncate text-[10px] opacity-80">{item.brand}</span>
          )}
        </div>
      )}

      {/* Left spine shade */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[7px]"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,0,0.45), rgba(0,0,0,0.12) 55%, rgba(255,255,255,0.25))",
        }}
      />

      {isGrid && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-6">
          <div className="truncate text-[10px] font-medium text-white">
            {item.title}
          </div>
          <div className="flex items-center justify-between gap-1">
            {primaryTag && (
              <span
                className="truncate rounded-sm px-1 text-[9px] text-white"
                style={{ backgroundColor: primaryTag.color }}
              >
                {primaryTag.name}
              </span>
            )}
            {price && (
              <span className="ml-auto text-[9px] text-white/90">{price}</span>
            )}
          </div>
        </div>
      )}

      <span
        className="absolute right-1 top-1 rounded bg-black/55 px-1 text-[9px] capitalize text-white"
        title={item.status}
      >
        {item.status.replace(/_/g, " ")}
      </span>
    </motion.button>
  );
}
