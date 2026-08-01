import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STUFF_STATUSES, type StuffStatus, type StuffTag } from "../types";

interface StuffSidebarProps {
  tags: StuffTag[];
  selectedTagId: string | null;
  statusFilter: StuffStatus | "all";
  itemCountsByTag: Record<string, number>;
  totalCount: number;
  onSelectTag: (id: string | null) => void;
  onStatusFilter: (status: StuffStatus | "all") => void;
  onAddTag: (name: string) => void;
  onDeleteTag: (id: string) => void;
}

export function StuffSidebar({
  tags,
  selectedTagId,
  statusFilter,
  itemCountsByTag,
  totalCount,
  onSelectTag,
  onStatusFilter,
  onAddTag,
  onDeleteTag,
}: StuffSidebarProps) {
  const { t } = useTranslation();

  const statusOptions = useMemo(
    () =>
      (["all", ...STUFF_STATUSES] as const).map((status) => ({
        value: status,
        label:
          status === "all"
            ? t("apps.stuff.status.all", { defaultValue: "All statuses" })
            : t(`apps.stuff.status.${status}`, {
                defaultValue: status.replace(/_/g, " "),
              }),
      })),
    [t]
  );

  return (
    <aside className="flex w-44 shrink-0 flex-col border-r border-black/15 bg-black/5 dark:border-white/10 dark:bg-black/20">
      <div className="border-b border-black/10 px-3 py-2 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/55 dark:text-white/55">
          {t("apps.stuff.sidebar.tags", { defaultValue: "Tags" })}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <button
          type="button"
          className={cn(
            "mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm",
            selectedTagId === null
              ? "bg-black/15 dark:bg-white/15"
              : "hover:bg-black/8 dark:hover:bg-white/10"
          )}
          onClick={() => onSelectTag(null)}
        >
          <span>{t("apps.stuff.sidebar.allStuff", { defaultValue: "All Stuff" })}</span>
          <span className="text-xs opacity-60">{totalCount}</span>
        </button>
        {tags.map((tag) => (
          <div key={tag.id} className="group mb-0.5 flex items-center gap-1">
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                selectedTagId === tag.id
                  ? "bg-black/15 dark:bg-white/15"
                  : "hover:bg-black/8 dark:hover:bg-white/10"
              )}
              onClick={() => onSelectTag(tag.id)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="truncate">{tag.name}</span>
              <span className="ml-auto text-xs opacity-60">
                {itemCountsByTag[tag.id] ?? 0}
              </span>
            </button>
            <button
              type="button"
              className="rounded p-1 opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
              aria-label={t("apps.stuff.sidebar.deleteTag", {
                defaultValue: "Delete tag",
              })}
              onClick={() => onDeleteTag(tag.id)}
            >
              <Trash size={12} />
            </button>
          </div>
        ))}
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.elements.namedItem("tagName") as HTMLInputElement;
            if (input.value.trim()) {
              onAddTag(input.value);
              input.value = "";
            }
          }}
        >
          <Input
            name="tagName"
            className="h-7 text-xs"
            placeholder={t("apps.stuff.sidebar.newTag", {
              defaultValue: "New tag…",
            })}
          />
          <Button type="submit" size="sm" variant="ghost" className="h-7 w-7 p-0">
            <Plus size={14} />
          </Button>
        </form>
      </div>

      <div className="border-t border-black/10 px-3 py-2 dark:border-white/10">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-black/55 dark:text-white/55">
          {t("apps.stuff.sidebar.status", { defaultValue: "Status" })}
        </p>
        <select
          className="w-full rounded border border-black/20 bg-white/80 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/40"
          value={statusFilter}
          onChange={(e) =>
            onStatusFilter(e.target.value as StuffStatus | "all")
          }
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
