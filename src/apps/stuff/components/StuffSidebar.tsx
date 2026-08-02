import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash, Barcode, SquaresFour } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { SearchInput } from "@/components/ui/search-input";
import { InputDialog } from "@/components/dialogs/InputDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import {
  STUFF_STATUSES,
  type StuffStatus,
  type StuffTag,
  stuffStatusLabelDefault,
} from "../types";

interface StuffSidebarProps {
  tags: StuffTag[];
  selectedTagId: string | null;
  statusFilter: StuffStatus | "all";
  itemCountsByTag: Record<string, number>;
  totalCount: number;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSelectTag: (id: string | null) => void;
  onStatusFilter: (status: StuffStatus | "all") => void;
  onAddTag: (name: string) => void;
  onDeleteTag: (id: string) => void;
  onPrintTag: (id: string) => void;
}

export function StuffSidebar({
  tags,
  selectedTagId,
  statusFilter,
  itemCountsByTag,
  totalCount,
  searchQuery,
  onSearchQueryChange,
  onSelectTag,
  onStatusFilter,
  onAddTag,
  onDeleteTag,
  onPrintTag,
}: StuffSidebarProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isSystem7Theme } = useThemeFlags();
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const [isNewTagDialogOpen, setIsNewTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const handleNewTagSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAddTag(trimmed);
    setNewTagName("");
    setIsNewTagDialogOpen(false);
  };

  const openNewTagDialog = () => {
    setNewTagName("");
    setIsNewTagDialogOpen(true);
  };

  const statusOptions = useMemo(
    () =>
      (["all", ...STUFF_STATUSES] as const).map((status) => ({
        value: status,
        label:
          status === "all"
            ? t("apps.stuff.status.all", { defaultValue: "All Statuses" })
            : t(`apps.stuff.status.${status}`, {
                defaultValue: stuffStatusLabelDefault(status),
              }),
      })),
    [t]
  );

  const sidebarIconSlotClass =
    "flex h-2 w-2 shrink-0 items-center justify-center";

  const sidebarRowClass = (selected: boolean) =>
    cn(
      "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors",
      useGeneva && "font-geneva-12",
      selected ? "bg-black/25 text-[#f5e6d0]" : "text-black/80 hover:bg-black/15"
    );

  const sidebarCountClass = "shrink-0 text-[10px] opacity-50";

  return (
    <>
      <AppSidebarPanel
        bordered={false}
        className={cn(
          "flex h-full w-[160px] shrink-0 flex-col min-h-0 !bg-transparent !shadow-none",
          "pt-7 px-1.5 pb-2"
        )}
        style={
          !isMacOSTheme
            ? { borderRight: "1px solid rgba(0,0,0,0.12)" }
            : undefined
        }
      >
      <div className="shrink-0 mb-1">
        <SearchInput
          value={searchQuery}
          onChange={onSearchQueryChange}
          placeholder={t("apps.stuff.searchPlaceholder", {
            defaultValue: "Search Stuff…",
          })}
          ariaLabel={t("apps.stuff.searchPlaceholder", {
            defaultValue: "Search Stuff…",
          })}
          className="w-full"
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto py-1">
        <button
          type="button"
          className={sidebarRowClass(selectedTagId === null)}
          onClick={() => onSelectTag(null)}
        >
          <span className={sidebarIconSlotClass} aria-hidden>
            <SquaresFour size={8} weight="fill" className="opacity-50" />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {t("apps.stuff.sidebar.allStuff", { defaultValue: "All Stuff" })}
          </span>
          <span className={sidebarCountClass}>{totalCount}</span>
        </button>

        {tags.map((tag) => {
          const selected = selectedTagId === tag.id;
          return (
            <div key={tag.id} className="group relative flex items-center">
              <button
                type="button"
                className={sidebarRowClass(selected)}
                onClick={() => onSelectTag(tag.id)}
              >
                <span className={sidebarIconSlotClass} aria-hidden>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className={cn(sidebarCountClass, "group-hover:hidden")}>
                  {itemCountsByTag[tag.id] ?? 0}
                </span>
              </button>
              <div className="pointer-events-none absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 gap-0.5 group-hover:pointer-events-auto group-hover:flex">
                <button
                  type="button"
                  className="rounded p-0.5 text-black/40 hover:bg-black/10 hover:text-black/70"
                  aria-label={t("apps.stuff.sidebar.printTag", {
                    defaultValue: "Print Tag Label",
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
                    defaultValue: "Delete Tag",
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

        <button
          type="button"
          className={sidebarRowClass(false)}
          onClick={openNewTagDialog}
        >
          <span className={sidebarIconSlotClass} aria-hidden>
            <Plus size={8} weight="bold" className="opacity-60" />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {t("apps.stuff.sidebar.newTag", { defaultValue: "New Tag…" })}
          </span>
        </button>
      </div>

      <div className="shrink-0 px-0.5 pb-0.5 pt-1">
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            onStatusFilter(value as StuffStatus | "all")
          }
        >
          <SelectTrigger
            className={cn("w-full text-[11px]", useGeneva && "font-geneva-12")}
          >
            <SelectValue
              placeholder={t("apps.stuff.status.all", {
                defaultValue: "All Statuses",
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </AppSidebarPanel>

      <InputDialog
        isOpen={isNewTagDialogOpen}
        onOpenChange={(open) => {
          setIsNewTagDialogOpen(open);
          if (!open) setNewTagName("");
        }}
        onSubmit={handleNewTagSubmit}
        title={t("apps.stuff.dialogs.newTag.title", {
          defaultValue: "New Tag",
        })}
        description={t("apps.stuff.dialogs.newTag.description", {
          defaultValue: "Enter a name for the new tag.",
        })}
        value={newTagName}
        onChange={setNewTagName}
        submitLabel={t("apps.stuff.toolbar.add", { defaultValue: "Add" })}
      />
    </>
  );
}
