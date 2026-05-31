import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "./Skeleton";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<
  UserProfilePanelViewModel,
  | "t"
  | "isLoading"
  | "heartbeats"
  | "isHeartbeatsOpen"
  | "hasLoadedHeartbeats"
  | "isHeartbeatsLoading"
  | "expandedHeartbeats"
  | "toggleHeartbeatsSection"
  | "toggleHeartbeat"
  | "formatRelativeTime"
>;

export function UserProfilePanelHeartbeatsSection({
  t,
  isLoading,
  heartbeats,
  isHeartbeatsOpen,
  hasLoadedHeartbeats,
  isHeartbeatsLoading,
  expandedHeartbeats,
  toggleHeartbeatsSection,
  toggleHeartbeat,
  formatRelativeTime,
}: Props) {
  if (isLoading) return null;

  const sentCount = heartbeats.filter((h) => h.shouldSend).length;
  const skippedCount = heartbeats.length - sentCount;
  const reversedHeartbeats = [...heartbeats].reverse();

  return (
    <div className="space-y-2">
      <SectionHeader onClick={toggleHeartbeatsSection} isOpen={isHeartbeatsOpen} showCaret={true}>
        {t("apps.admin.profile.heartbeats")}
        {hasLoadedHeartbeats ? ` (${heartbeats.length})` : ""}
      </SectionHeader>
      {isHeartbeatsOpen && (
        <>
          {isHeartbeatsLoading ? (
            <div className="space-y-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <>
              <div className="text-[10px] text-neutral-400">
                {sentCount} {t("apps.admin.profile.heartbeatSent")}, {skippedCount}{" "}
                {t("apps.admin.profile.heartbeatSkipped")}
              </div>
              {heartbeats.length > 0 && (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="text-[10px] border-none font-normal">
                      <TableHead className="font-normal bg-neutral-100/50 h-[24px] w-[22%]">
                        {t("apps.admin.tableHeaders.status")}
                      </TableHead>
                      <TableHead className="font-normal bg-neutral-100/50 h-[24px]">
                        {t("apps.admin.tableHeaders.message")}
                      </TableHead>
                      <TableHead className="font-normal bg-neutral-100/50 h-[24px] whitespace-nowrap w-[25%]">
                        {t("apps.admin.tableHeaders.time")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-[11px]">
                    {reversedHeartbeats.map((hb, index) => {
                      const isExpanded = expandedHeartbeats.has(hb.id);
                      return (
                        <React.Fragment key={hb.id}>
                          <TableRow
                            onClick={() => toggleHeartbeat(hb.id)}
                            className={cn(
                              "border-none hover:bg-neutral-100/50 transition-colors cursor-pointer",
                              index % 2 === 1 && "bg-neutral-200/30"
                            )}
                          >
                            <TableCell className="whitespace-nowrap">
                              <span
                                className={cn(
                                  "font-medium",
                                  hb.shouldSend ? "text-green-700" : "text-neutral-400"
                                )}
                              >
                                {hb.shouldSend ? "sent" : "skipped"}
                              </span>
                              <CaretRight
                                className={cn(
                                  "size-3 inline-block ml-1 text-neutral-400 transition-transform",
                                  isExpanded && "rotate-90"
                                )}
                                weight="bold"
                              />
                            </TableCell>
                            <TableCell className="min-w-0">
                              <span className="line-clamp-2 break-words text-neutral-500">
                                {hb.shouldSend
                                  ? hb.message || "heartbeat sent"
                                  : hb.skipReason || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-neutral-500">
                              {formatRelativeTime(hb.timestamp)}
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
                                <div className="pl-2 border-l-2 border-green-200 space-y-1">
                                  {hb.message && (
                                    <p className="text-[11px] whitespace-pre-wrap text-neutral-700">
                                      {hb.message}
                                    </p>
                                  )}
                                  {hb.skipReason && (
                                    <div className="text-[11px]">
                                      <span className="text-neutral-400">
                                        {t("apps.admin.profile.reason")}:
                                      </span>{" "}
                                      <span className="text-neutral-600">{hb.skipReason}</span>
                                    </div>
                                  )}
                                  <div className="text-[10px] text-neutral-400 font-mono break-all">
                                    {hb.stateSummary}
                                  </div>
                                  {(hb.localDate || hb.isoTimestamp) && (
                                    <div className="text-[10px] text-neutral-400">
                                      {hb.localDate
                                        ? `${hb.localDate} ${hb.localTime || ""}${hb.timeZone ? ` (${hb.timeZone})` : ""}`
                                        : new Date(hb.timestamp).toLocaleString()}
                                    </div>
                                  )}
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
            </>
          )}
        </>
      )}
    </div>
  );
}
