import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CaretRight, Eraser, ArrowsClockwise } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  adminAquaIconButtonClass,
  AQUA_ICON_BUTTON_ICON_CLASS_SM,
} from "@/lib/aquaIconButton";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "./Skeleton";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<
  UserProfilePanelViewModel,
  | "t"
  | "isLoading"
  | "memories"
  | "dailyNotes"
  | "isMemoriesOpen"
  | "hasLoadedMemories"
  | "isMemoriesLoading"
  | "expandedMemories"
  | "expandedDailyNotes"
  | "isClearingMemory"
  | "isProcessingNotes"
  | "toggleMemoriesSection"
  | "toggleMemory"
  | "toggleDailyNote"
  | "formatRelativeTime"
  | "setIsClearMemoryDialogOpen"
  | "setIsForceProcessDialogOpen"
>;

export function UserProfilePanelMemoriesSection(props: Props) {
  const {
    t,
    isLoading,
    memories,
    dailyNotes,
    isMemoriesOpen,
    hasLoadedMemories,
    isMemoriesLoading,
    expandedMemories,
    expandedDailyNotes,
    isClearingMemory,
    isProcessingNotes,
    toggleMemoriesSection,
    toggleMemory,
    toggleDailyNote,
    formatRelativeTime,
    setIsClearMemoryDialogOpen,
    setIsForceProcessDialogOpen,
  } = props;

  return (
    <>
      {/* Long-Term Memories */}
      {isLoading ? (
        <div className="space-y-2">
          <SectionHeader>{t("apps.admin.profile.longTermMemories")}</SectionHeader>
          <div className="space-y-1">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <SectionHeader
            onClick={toggleMemoriesSection}
            isOpen={isMemoriesOpen}
            showCaret={true}
          >
            {t("apps.admin.profile.longTermMemories")}
            {hasLoadedMemories ? ` (${memories.length})` : ""}
          </SectionHeader>
          {isMemoriesOpen && (
            <>
              {isMemoriesLoading ? (
            <div className="space-y-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
              ) : (
            <>
              {memories.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setIsClearMemoryDialogOpen(true)}
                    disabled={isClearingMemory}
                    className={cn(
                  adminAquaIconButtonClass("secondary", "sm"),
                  "disabled:opacity-50"
                    )}
                  >
                    <Eraser className={AQUA_ICON_BUTTON_ICON_CLASS_SM} weight="bold" />
                    <span>{isClearingMemory ? t("apps.admin.profile.clearing") : t("apps.admin.profile.clearAll")}</span>
                  </button>
                </div>
              )}
              {memories.length === 0 ? (
                <div className="text-[11px] text-neutral-400 text-center py-4">
                  {t("apps.admin.profile.noMemories")}
                </div>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="text-[10px] border-none font-normal">
                  <TableHead className="font-normal bg-neutral-100/50 h-[24px] w-[30%]">
                    {t("apps.admin.profile.memoryKey")}
                  </TableHead>
                  <TableHead className="font-normal bg-neutral-100/50 h-[24px]">
                    {t("apps.admin.profile.memorySummary")}
                  </TableHead>
                  <TableHead className="font-normal bg-neutral-100/50 h-[24px] whitespace-nowrap w-[20%]">
                    {t("apps.admin.tableHeaders.time")}
                  </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-[11px]">
                    {memories.map((memory, index) => {
                  const isExpanded = expandedMemories.has(memory.key);
                  return (
                    <React.Fragment key={memory.key}>
                      <TableRow
                        onClick={() => toggleMemory(memory.key)}
                        className={cn(
                          "border-none hover:bg-neutral-100/50 transition-colors cursor-pointer",
                          index % 2 === 1 && "bg-neutral-200/30"
                        )}
                      >
                        <TableCell>
                          <span className="text-purple-700 font-medium break-all">{memory.key}</span>
                          <CaretRight
                        className={cn(
                          "size-3 inline-block ml-1 text-neutral-400 transition-transform",
                          isExpanded && "rotate-90"
                        )}
                        weight="bold"
                          />
                        </TableCell>
                        <TableCell className="min-w-0">
                          <span className="line-clamp-2 break-words text-neutral-500">{memory.summary}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-neutral-500">
                          {formatRelativeTime(memory.updatedAt)}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow
                          className={cn(
                        "border-none",
                        index % 2 === 1 ? "bg-neutral-200/30" : ""
                          )}
                        >
                          <TableCell colSpan={3} className="pt-0 pb-3">
                        <div className="pl-2 border-l-2 border-purple-200">
                          <p className="text-[11px] whitespace-pre-wrap text-neutral-700">
                            {memory.content}
                          </p>
                        </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                    })}
                  </TableBody>
                </Table>
              )}
              {dailyNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <SectionHeader>
                  {t("apps.admin.profile.dailyNotes")} ({dailyNotes.reduce((acc, n) => acc + n.entries.length, 0)} {t("apps.admin.profile.entries")})
                    </SectionHeader>
                    <button
                  onClick={() => setIsForceProcessDialogOpen(true)}
                  disabled={isProcessingNotes}
                  className={cn(
                    adminAquaIconButtonClass("secondary", "sm"),
                    "disabled:opacity-50"
                  )}
                    >
                  <ArrowsClockwise
                    className={cn(
                      AQUA_ICON_BUTTON_ICON_CLASS_SM,
                      isProcessingNotes && "animate-spin"
                    )}
                    weight="bold"
                  />
                  <span>{isProcessingNotes ? t("apps.admin.profile.processing") : t("apps.admin.profile.reprocess")}</span>
                    </button>
                  </div>
                  <div className="space-y-1">
                    {dailyNotes.map((note) => {
                  const isExpanded = expandedDailyNotes.has(note.date);
                  const now = new Date();
                  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                  const dateLabel = note.date === today ? `${note.date} (${t("apps.admin.profile.today")})` : note.date;
                  return (
                    <div key={note.date}>
                      <button
                        onClick={() => toggleDailyNote(note.date)}
                        className="flex items-center gap-1.5 w-full text-left text-[11px] hover:bg-neutral-100/50 px-1 py-0.5 rounded transition-colors"
                      >
                        <CaretRight
                          className={cn(
                        "size-3 text-neutral-400 transition-transform flex-shrink-0",
                        isExpanded && "rotate-90"
                          )}
                          weight="bold"
                        />
                        <span className="text-amber-700 font-medium">{dateLabel}</span>
                        <span className="text-neutral-400 ml-1">
                          ({note.entries.length} {t("apps.admin.profile.entries")})
                          {note.processedForMemories ? (
                        <span className="text-green-600 ml-1" title={t("apps.admin.profile.processedTooltip")}>✓ {t("apps.admin.profile.processed")}</span>
                          ) : (
                        <span className="text-amber-500 ml-1" title={t("apps.admin.profile.pendingTooltip")}>○ {t("apps.admin.profile.pending")}</span>
                          )}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="pl-5 mt-1 space-y-1">
                          {note.entries.map((entry) => {
                        const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });
                        return (
                          <div key={`${entry.timestamp}-${entry.content.slice(0, 24)}`} className="text-[11px] flex gap-2">
                            <span className="text-neutral-400 whitespace-nowrap flex-shrink-0">{time}</span>
                            <span className="text-neutral-600">{entry.content}</span>
                          </div>
                        );
                          })}
                        </div>
                      )}
                    </div>
                  );
                    })}
                  </div>
                </div>
              )}
            </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
