import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "../shared/Skeleton";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<
  UserProfilePanelViewModel,
  | "t"
  | "profile"
  | "isLoading"
  | "isRoomsOpen"
  | "roomsCount"
  | "dispatchProfileUi"
>;

export function UserProfilePanelRoomsSection({
  t,
  profile,
  isLoading,
  isRoomsOpen,
  roomsCount,
  dispatchProfileUi,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeader>{t("apps.admin.profile.activeRooms")}</SectionHeader>
        <div className="flex gap-1">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SectionHeader
        onClick={() =>
          dispatchProfileUi({
            type: "set",
            payload: { isRoomsOpen: !isRoomsOpen },
          })
        }
        isOpen={isRoomsOpen}
        showCaret={true}
      >
        {t("apps.admin.profile.activeRooms")} ({roomsCount})
      </SectionHeader>
      {isRoomsOpen && roomsCount > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile?.rooms?.map((room) => (
            <span key={room.id} className="px-2 py-1 text-[10px] bg-os-panel-bg rounded">
              #{room.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
