import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SectionHeader } from "./SectionHeader";
import { adminTableHeadClass, adminTableRowClass } from "../../utils/adminStyles";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<
  UserProfilePanelViewModel,
  | "t"
  | "messages"
  | "isLoading"
  | "isMessagesOpen"
  | "isMessagesLoading"
  | "messagesCount"
  | "toggleMessagesSection"
  | "formatRelativeTime"
>;

export function UserProfilePanelMessagesSection({
  t,
  messages,
  isLoading,
  isMessagesOpen,
  isMessagesLoading,
  messagesCount,
  toggleMessagesSection,
  formatRelativeTime,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeader>{t("apps.admin.profile.recentMessages")}</SectionHeader>
        <div className="space-y-1">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SectionHeader onClick={toggleMessagesSection} isOpen={isMessagesOpen} showCaret={true}>
        {t("apps.admin.profile.recentMessages")} ({messagesCount})
      </SectionHeader>
      {isMessagesOpen && (
        <>
          {isMessagesLoading ? (
            <div className="space-y-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : messagesCount === 0 ? (
            <div className="text-[11px] text-neutral-400 text-center py-4">
              {t("apps.admin.profile.noMessages")}
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="text-[10px] border-none font-normal">
                  <TableHead className={cn(adminTableHeadClass, "h-[24px] w-[25%]")}>
                    {t("apps.admin.profile.room")}
                  </TableHead>
                  <TableHead className={cn(adminTableHeadClass, "h-[24px]")}>
                    {t("apps.admin.tableHeaders.message")}
                  </TableHead>
                  <TableHead className={cn(adminTableHeadClass, "h-[24px] whitespace-nowrap w-[20%]")}>
                    {t("apps.admin.tableHeaders.time")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-[11px]">
                {messages.map((message) => (
                  <TableRow
                    key={message.id}
                    className={cn(adminTableRowClass, "cursor-default")}
                  >
                    <TableCell>
                      <span className="text-neutral-500">#</span>
                      <span className="break-all">{message.roomName || message.roomId}</span>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <span className="line-clamp-2 break-words">{message.content}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-500">
                      {formatRelativeTime(message.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
