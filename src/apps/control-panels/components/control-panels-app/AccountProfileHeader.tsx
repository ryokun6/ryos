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
  /** Opens the auth dialog on the "login" tab. Falls back to `promptSetUsername`. */
  promptLogin?: () => void;
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
  promptLogin,
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
                // Nudge the head/shoulders silhouette down so it sits lower in
                // the circle (shoulders crop naturally at the bottom edge).
                style={{ transform: "translateY(8%)" }}
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
          "shrink-0 flex items-center justify-center"
        )}
      >
        <img
          src="/apple-touch-icon.png"
          alt={t("apps.control-panels.ryOSAccount")}
          className="size-full object-contain"
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
      <div className="control-panels-account-profile-login flex items-center justify-center gap-2">
        <Button variant="default" onClick={promptSetUsername} className="h-7">
          {t("apps.control-panels.signUp")}
        </Button>
        <Button
          variant="retro"
          onClick={promptLogin ?? promptSetUsername}
          className="h-7"
        >
          {t("apps.control-panels.login")}
        </Button>
      </div>
    </div>
  );
}
