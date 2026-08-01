import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash, Barcode } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { useThemeFlags } from "@/hooks/useThemeFlags";
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
  onPrintTag: (id: string) => void;
}

function SectionHeader({
  title,
  isMacOSTheme,
  useGeneva,
}: {
  title: string;
  isMacOSTheme: boolean;
  useGeneva: boolean;
}) {
  if (isMacOSTheme) {
    return (
      <div
        className={cn(
          "text-center text-[11px] font-regular",
          useGeneva && "font-geneva-12"
        )}
        style={{
          background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
          color: "#222",
          textShadow: "0 1px 0 #e1e1e1",
          borderTop: "1px solid rgba(255,255,255,0.5)",
          borderBottom: "1px solid #787878",
        }}
      >
        {title}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mb-1 px-2.5 text-[9px] font-bold uppercase tracking-wide opacity-50",
        useGeneva && "font-geneva-12"
      )}
    >
      {title}
    </div>
  );
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
  onPrintTag,
}: StuffSidebarProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isSystem7Theme } = useThemeFlags();
  const useGeneva = isMacOSTheme || isSystem7Theme;

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

  const rowClass = (selected: boolean) =>
    cn(
      "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors",
      useGeneva && "font-geneva-12",
      selected ? "bg-black/[0.06]" : "hover:bg-black/5"
    );

  return (
    <AppSidebarPanel
      bordered={isMacOSTheme}
      className="flex h-full w-[160px] shrink-0 flex-col min-h-0"
      style={
        !isMacOSTheme
          ? { borderRight: "1px solid rgba(0,0,0,0.08)" }
          : undefined
      }
    >
      <SectionHeader
        title={t("apps.stuff.sidebar.tags", { defaultValue: "Tags" })}
        isMacOSTheme={isMacOSTheme}
        useGeneva={useGeneva}
      />

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto",
          !isMacOSTheme && "py-1.5"
        )}
      >
        <button
          type="button"
          className={rowClass(selectedTagId === null)}
          onClick={() => onSelectTag(null)}
        >
          <span className="min-w-0 flex-1 truncate">
            {t("apps.stuff.sidebar.allStuff", { defaultValue: "All Stuff" })}
          </span>
          <span className="shrink-0 text-[10px] opacity-50">{totalCount}</span>
        </button>

        {tags.map((tag) => {
          const selected = selectedTagId === tag.id;
          return (
            <div key={tag.id} className="group relative flex items-center">
              <button
                type="button"
                className={rowClass(selected)}
                onClick={() => onSelectTag(tag.id)}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="shrink-0 text-[10px] opacity-50">
                  {itemCountsByTag[tag.id] ?? 0}
                </span>
              </button>
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  className="rounded p-0.5 text-black/40 hover:bg-black/10 hover:text-black/70"
                  aria-label={t("apps.stuff.sidebar.printTag", {
                    defaultValue: "Print tag label",
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrintTag(tag.id);
                  }}
                >
                  <Barcode size={11} />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-black/40 hover:bg-black/10 hover:text-black/70"
                  aria-label={t("apps.stuff.sidebar.deleteTag", {
                    defaultValue: "Delete tag",
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTag(tag.id);
                  }}
                >
                  <Trash size={11} />
                </button>
              </div>
            </div>
          );
        })}

        <form
          className="mt-1 flex items-center gap-1 px-2 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.elements.namedItem(
              "tagName"
            ) as HTMLInputElement;
            if (input.value.trim()) {
              onAddTag(input.value);
              input.value = "";
            }
          }}
        >
          <input
            name="tagName"
            className={cn(
              "min-w-0 flex-1 rounded border border-black/15 bg-white/80 px-1.5 py-0.5 text-[10px] outline-none",
              useGeneva && "font-geneva-12"
            )}
            placeholder={t("apps.stuff.sidebar.newTag", {
              defaultValue: "New tag…",
            })}
          />
          <button
            type="submit"
            className="rounded p-0.5 text-black/45 hover:bg-black/10 hover:text-black/70"
            aria-label={t("apps.stuff.toolbar.add", { defaultValue: "Add" })}
          >
            <Plus size={12} />
          </button>
        </form>
      </div>

      <SectionHeader
        title={t("apps.stuff.sidebar.status", { defaultValue: "Status" })}
        isMacOSTheme={isMacOSTheme}
        useGeneva={useGeneva}
      />
      <div className="px-2 py-1.5">
        <select
          className={cn(
            "w-full rounded-sm border border-black/20 bg-white px-1 py-0.5 text-[11px] outline-none",
            useGeneva && "font-geneva-12"
          )}
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
    </AppSidebarPanel>
  );
}
