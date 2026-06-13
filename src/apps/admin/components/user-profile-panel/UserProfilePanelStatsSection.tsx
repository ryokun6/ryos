import { Prohibit } from "@phosphor-icons/react";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<UserProfilePanelViewModel, "t" | "profile" | "isLoading" | "formatDate">;

export function UserProfilePanelStatsSection({ t, profile, isLoading, formatDate }: Props) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="py-1.5">
          <SectionHeader className="mb-1">{t("apps.admin.profile.messages")}</SectionHeader>
          {isLoading ? (
            <Skeleton className="h-5 w-8" />
          ) : (
            <span className="text-[14px] font-medium">{profile?.messageCount || 0}</span>
          )}
        </div>
        <div className="py-1.5">
          <SectionHeader className="mb-1">{t("apps.admin.profile.rooms")}</SectionHeader>
          {isLoading ? (
            <Skeleton className="h-5 w-8" />
          ) : (
            <span className="text-[14px] font-medium">{profile?.rooms?.length || 0}</span>
          )}
        </div>
      </div>
      {!isLoading && profile?.banned && (
        <div className="p-2 bg-red-500/10 rounded border border-red-500/20 os-mac-aqua-dark:border-red-400/25">
          <SectionHeader
            className="flex items-start gap-1.5 text-red-600 mb-1"
            icon={<Prohibit className="size-3 mt-px" weight="bold" />}
          >
            {t("apps.admin.profile.banDetails")}
          </SectionHeader>
          <div className="text-[11px] space-y-1">
            <div>
              <span className="text-neutral-500">{t("apps.admin.profile.reason")}:</span>{" "}
              {profile.banReason || t("apps.admin.profile.noReason")}
            </div>
            {profile.bannedAt && (
              <div>
                <span className="text-neutral-500">{t("apps.admin.profile.bannedOn")}:</span>{" "}
                {formatDate(profile.bannedAt)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
