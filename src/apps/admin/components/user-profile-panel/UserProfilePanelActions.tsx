import { Input } from "@/components/ui/input";
import { Check, Prohibit, Trash } from "@phosphor-icons/react";
import { adminAquaIconButtonClass, AQUA_ICON_BUTTON_ICON_CLASS } from "@/lib/aquaIconButton";
import { SectionHeader } from "./SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<
  UserProfilePanelViewModel,
  | "t"
  | "profile"
  | "isLoading"
  | "isTargetAdmin"
  | "showBanInput"
  | "banReason"
  | "dispatchProfileUi"
  | "setIsBanDialogOpen"
  | "setIsDeleteDialogOpen"
  | "handleUnban"
>;

export function UserProfilePanelActions({
  t,
  profile,
  isLoading,
  isTargetAdmin,
  showBanInput,
  banReason,
  dispatchProfileUi,
  setIsBanDialogOpen,
  setIsDeleteDialogOpen,
  handleUnban,
}: Props) {
  if (isTargetAdmin) return null;
  return (
    <div className="space-y-2">
      <SectionHeader>{t("apps.admin.profile.actions")}</SectionHeader>
      {isLoading ? (
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-24" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {profile?.banned ? (
            <button onClick={handleUnban} className={adminAquaIconButtonClass("primary")}>
              <Check className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
              <span>{t("apps.admin.profile.unban")}</span>
            </button>
          ) : showBanInput ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                placeholder={t("apps.admin.profile.banReasonPlaceholder")}
                value={banReason}
                onChange={(e) =>
                  dispatchProfileUi({ type: "set", payload: { banReason: e.target.value } })
                }
                className="h-7 text-[11px] flex-1"
              />
              <button
                onClick={() => setIsBanDialogOpen(true)}
                className="aqua-button orange h-7 px-3 text-[11px]"
                style={{ color: "#000", textShadow: "none" }}
              >
                <span style={{ color: "#000" }}>{t("apps.admin.profile.confirmBan")}</span>
              </button>
              <button
                onClick={() =>
                  dispatchProfileUi({
                    type: "set",
                    payload: { showBanInput: false, banReason: "" },
                  })
                }
                className="aqua-button secondary h-7 px-3 text-[11px]"
              >
                <span>{t("common.dialog.cancel")}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => dispatchProfileUi({ type: "set", payload: { showBanInput: true } })}
              className={adminAquaIconButtonClass("orange")}
              style={{ color: "#000", textShadow: "none" }}
            >
              <Prohibit className={AQUA_ICON_BUTTON_ICON_CLASS} style={{ color: "#000" }} weight="bold" />
              <span style={{ color: "#000" }}>{t("apps.admin.profile.ban")}</span>
            </button>
          )}
          <button onClick={() => setIsDeleteDialogOpen(true)} className={adminAquaIconButtonClass("secondary")}>
            <Trash className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
            <span>{t("apps.admin.profile.delete")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
