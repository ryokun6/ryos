import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { cn } from "@/lib/utils";
import {
  adminAvatarWellClass,
  adminGhostIconBtnClass,
  adminTableHeadClass,
  adminTableRowClass,
} from "../../utils/adminStyles";

interface MessageRow {
  id: string;
  username: string;
  content: string;
  timestamp: number;
}

export interface AdminRoomMessagesViewProps {
  t: TFunction;
  roomMessages: MessageRow[];
  selectedRoomId: string | null;
  formatRelativeTime: (ts: number) => string;
  deleteMessage: (roomId: string, messageId: string) => void;
}

export function AdminRoomMessagesView({
  t,
  roomMessages,
  selectedRoomId,
  formatRelativeTime,
  deleteMessage,
}: AdminRoomMessagesViewProps) {
  return (
    <div className="font-geneva-12">
      {roomMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
          <span className="text-[11px]">
            {t("apps.admin.room.noMessages")}
          </span>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-[10px] border-none font-normal">
              <TableHead className={cn(adminTableHeadClass, "h-[28px]")}>
                {t("apps.admin.tableHeaders.user")}
              </TableHead>
              <TableHead className={cn(adminTableHeadClass, "h-[28px]")}>
                {t("apps.admin.tableHeaders.message")}
              </TableHead>
              <TableHead className={cn(adminTableHeadClass, "h-[28px] whitespace-nowrap")}>
                {t("apps.admin.tableHeaders.time")}
              </TableHead>
              <TableHead className={cn(adminTableHeadClass, "h-[28px] w-8")}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-[11px]">
            {roomMessages.map((message) => (
              <TableRow
                key={message.id}
                className={cn(adminTableRowClass, "cursor-default")}
              >
                <TableCell className="flex items-center gap-2 whitespace-nowrap">
                  <div className={cn("size-4 rounded-full flex items-center justify-center text-[9px] font-medium", adminAvatarWellClass)}>
                    {message.username[0].toUpperCase()}
                  </div>
                  {message.username}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <span className="truncate block">{message.content}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatRelativeTime(message.timestamp)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedRoomId) {
                        deleteMessage(selectedRoomId, message.id);
                      }
                    }}
                    className={cn("size-5 p-0 md:opacity-0 md:group-hover:opacity-100", adminGhostIconBtnClass)}
                  >
                    <Trash size={14} weight="bold" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
