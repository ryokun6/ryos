import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "../shared/Skeleton";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";
import { adminAvatarWellClass, adminDetailHeaderClass } from "../../utils/adminStyles";

type Props = Pick<
  UserProfilePanelViewModel,
  | "t"
  | "username"
  | "onBack"
  | "profile"
  | "isLoading"
  | "isTargetAdmin"
  | "formatRelativeTime"
>;

export function UserProfilePanelHeader({
  t,
  username,
  onBack,
  profile,
  isLoading,
  isTargetAdmin,
  formatRelativeTime,
}: Props) {
  return (
    <div className={adminDetailHeaderClass}>
      <Button variant="ghost" size="sm" onClick={onBack} className="size-6 p-0">
        <ArrowLeft className="size-3.5" weight="bold" />
      </Button>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "size-8 rounded-full flex items-center justify-center text-sm font-medium",
            adminAvatarWellClass,
            isLoading && "animate-pulse"
          )}
        >
          {!isLoading && username[0].toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            {isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <>
                <span className="text-[12px] font-medium">{profile?.username || username}</span>
                {profile?.banned && (
                  <span className="px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 rounded">
                    {t("apps.admin.profile.banned")}
                  </span>
                )}
                {isTargetAdmin && (
                  <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded">
                    {t("apps.admin.user.admin")}
                  </span>
                )}
              </>
            )}
          </div>
          {isLoading ? (
            <Skeleton className="h-3 w-32 mt-1" />
          ) : (
            <span className="text-[10px] text-neutral-500">
              {t("apps.admin.profile.lastActive")}: {formatRelativeTime(profile?.lastActive || 0)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
