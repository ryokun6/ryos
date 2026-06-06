import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MagnifyingGlass, Trash, Prohibit } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  adminAvatarWellClass,
  adminGhostIconBtnClass,
  adminLoadMoreBtnClass,
  adminTableHeadClass,
  adminTableRowClass,
} from "../../utils/adminStyles";
import type { TFunction } from "i18next";

interface UserRow {
  username: string;
  lastActive: number;
  banned?: boolean;
}

export interface AdminUsersViewProps {
  t: TFunction;
  users: UserRow[];
  isLoading: boolean;
  visibleUsersCount: number;
  setVisibleUsersCount: Dispatch<SetStateAction<number>>;
  USERS_PER_PAGE: number;
  setSelectedUserProfile: (u: string) => void;
  formatRelativeTime: (ts: number) => string;
  promptDelete: (
    type: "user" | "room" | "message" | "song",
    id: string,
    name: string,
  ) => void;
}

export function AdminUsersView({
  t,
  users,
  isLoading,
  visibleUsersCount,
  setVisibleUsersCount,
  USERS_PER_PAGE,
  setSelectedUserProfile,
  formatRelativeTime,
  promptDelete,
}: AdminUsersViewProps) {
  return (
    <div className="font-geneva-12">
      {users.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
          <MagnifyingGlass className="size-8 mb-2 opacity-50" weight="bold" />
          <span className="text-[11px]">{t("apps.admin.search.noResults")}</span>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="text-[10px] border-none font-normal">
                <TableHead className={cn(adminTableHeadClass, "h-[28px]")}>
                  {t("apps.admin.tableHeaders.username")}
                </TableHead>
                <TableHead className={cn(adminTableHeadClass, "h-[28px]")}>
                  {t("apps.admin.tableHeaders.status")}
                </TableHead>
                <TableHead className={cn(adminTableHeadClass, "h-[28px] whitespace-nowrap")}>
                  {t("apps.admin.tableHeaders.lastActive")}
                </TableHead>
                <TableHead className={cn(adminTableHeadClass, "h-[28px] w-8")}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-[11px]">
              {users.slice(0, visibleUsersCount).map((user) => (
                <TableRow
                  key={user.username}
                  className={cn(
                    adminTableRowClass,
                    "cursor-pointer",
                    user.banned && "bg-red-50/50 odd:bg-red-50/70",
                  )}
                  onClick={() => setSelectedUserProfile(user.username)}
                >
                  <TableCell className="flex items-center gap-2">
                    <div
                      className={cn(
                        "size-4 rounded-full flex items-center justify-center text-[9px] font-medium",
                        user.banned
                          ? "bg-red-200 text-red-700"
                          : adminAvatarWellClass,
                      )}
                    >
                      {user.username[0].toUpperCase()}
                    </div>
                    {user.username}
                  </TableCell>
                  <TableCell>
                    {user.banned ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 rounded">
                        <Prohibit className="size-2.5" weight="bold" />
                        {t("apps.admin.user.banned")}
                      </span>
                    ) : user.username.toLowerCase() === "ryo" ? (
                      <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded">
                        {t("apps.admin.user.admin")}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[9px] bg-green-100 text-green-700 rounded">
                        {t("apps.admin.user.active")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatRelativeTime(user.lastActive)}
                  </TableCell>
                  <TableCell>
                    {user.username !== "ryo" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          promptDelete("user", user.username, user.username);
                        }}
                        className={cn("size-5 p-0 md:opacity-0 md:group-hover:opacity-100", adminGhostIconBtnClass)}
                      >
                        <Trash size={14} weight="bold" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.length > visibleUsersCount && (
            <div className="pt-2 pb-1 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setVisibleUsersCount((prev) => prev + USERS_PER_PAGE)
                }
                className={adminLoadMoreBtnClass}
              >
                {t("apps.admin.loadMore", {
                  remaining: users.length - visibleUsersCount,
                })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
