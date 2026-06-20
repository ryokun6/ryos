import { Button } from "@/components/ui/button";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import type { LanguageCode } from "@/stores/useLanguageStore";
import type { RealtimeConnectionState } from "@/lib/pusherClient";
import type { Contact } from "@/utils/contacts";
import { cn } from "@/lib/utils";
import { getAccountJoinStatusLabel } from "./accountJoinDateLabel";
import { ACCOUNT_PROFILE_AVATAR_ICON } from "./constants";

/** macOS Control Panels account "head" — larger than list-item icons (32px). */
const ACCOUNT_PROFILE_AVATAR_SIZE = "size-10";

export type AccountProfileHeaderProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  username: string | null;
  myContact: Contact | null;
  accountAvatarLabel: string;
  accountAvatarInitials: string;
  realtimeStatus: RealtimeConnectionState;
  accountJoinedAt?: number | null;
  locale: LanguageCode;
  promptSetUsername: () => void;
};

export function AccountProfileHeader({
  t,
  username,
  myContact,
  accountAvatarLabel,
  realtimeStatus,
  accountJoinedAt,
  locale,
  promptSetUsername,
}: AccountProfileHeaderProps) {
  if (username) {
    return (
      <div className="control-panels-account-profile">
        <div className="control-panels-account-profile-avatar-wrap">
          <div
            className={cn(
              ACCOUNT_PROFILE_AVATAR_SIZE,
              "shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] flex items-center justify-center overflow-hidden"
            )}
            style={
              myContact?.picture
                ? { background: "rgba(255, 255, 255, 0.72)" }
                : undefined
            }
            aria-label={accountAvatarLabel}
          >
            {myContact?.picture ? (
              <img
                src={myContact.picture}
                alt={accountAvatarLabel}
                className="size-full object-contain"
              />
            ) : (
              <ThemedIcon
                name={ACCOUNT_PROFILE_AVATAR_ICON}
                alt={accountAvatarLabel}
                className="size-full object-contain"
              />
            )}
          </div>
          <span
            className={cn(
              "control-panels-account-profile-presence",
              realtimeStatus === "connected"
                ? "bg-green-500"
                : realtimeStatus === "connecting"
                  ? "bg-amber-400"
                  : "bg-neutral-400"
            )}
          />
        </div>
        <div className="control-panels-account-profile-text">
          <span className="control-panels-account-profile-username">
            @{username}
          </span>
          <span className="control-panels-account-profile-status">
            {getAccountJoinStatusLabel(t, accountJoinedAt, locale)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="control-panels-account-profile">
      <div
        className={cn(
          ACCOUNT_PROFILE_AVATAR_SIZE,
          "shrink-0 flex items-center justify-center overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
        )}
      >
        <img
          src="/apple-touch-icon.png"
          alt={t("apps.control-panels.ryOSAccount")}
          className="size-7 object-contain"
        />
      </div>
      <div className="control-panels-account-profile-text">
        <span className="control-panels-account-profile-username">
          {t("apps.control-panels.ryOSAccount")}
        </span>
        <span className="control-panels-account-profile-status">
          {t("apps.control-panels.loginToSendMessages")}
        </span>
      </div>
      <Button
        variant="retro"
        onClick={promptSetUsername}
        className="control-panels-account-profile-login h-7"
      >
        {t("apps.control-panels.login")}
      </Button>
    </div>
  );
}
