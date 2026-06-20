import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RecoveryEmailDialog } from "@/components/dialogs/RecoveryEmailDialog";
import { DeleteAccountDialog } from "@/components/dialogs/DeleteAccountDialog";
import type { LanguageCode } from "@/stores/useLanguageStore";
import type { RealtimeConnectionState } from "@/lib/pusherClient";
import type { Contact } from "@/utils/contacts";
import { AccountProfileHeader } from "./AccountProfileHeader";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";

export type SecurityPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  username: string | null;
  myContact: Contact | null;
  accountAvatarLabel: string;
  accountAvatarInitials: string;
  realtimeStatus: RealtimeConnectionState;
  accountJoinedAt?: number | null;
  locale: LanguageCode;
  hasPassword: boolean | null;
  promptSetUsername: () => void;
  promptLogin: () => void;
  logout: () => void;
  handleLogoutAllDevices: () => void;
  isLoggingOutAllDevices: boolean;
  setPasswordInput: (value: string) => void;
  setPasswordError: (error: string | null) => void;
  setIsPasswordDialogOpen: (open: boolean) => void;
};

export function SecurityPaneContent({
  t,
  username,
  myContact,
  accountAvatarLabel,
  accountAvatarInitials,
  realtimeStatus,
  accountJoinedAt,
  locale,
  hasPassword,
  promptSetUsername,
  promptLogin,
  logout,
  handleLogoutAllDevices,
  isLoggingOutAllDevices,
  setPasswordInput,
  setPasswordError,
  setIsPasswordDialogOpen,
}: SecurityPaneContentProps) {
  const [isRecoveryEmailOpen, setIsRecoveryEmailOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);

  const openPasswordDialog = () => {
    setPasswordInput("");
    setPasswordError(null);
    setIsPasswordDialogOpen(true);
  };

  return (
    <div className="control-panels-pref-form space-y-0 h-full overflow-y-auto">
      <div className="control-panels-pref-form-section">
        <AccountProfileHeader
          t={t}
          username={username}
          myContact={myContact}
          accountAvatarLabel={accountAvatarLabel}
          accountAvatarInitials={accountAvatarInitials}
          realtimeStatus={realtimeStatus}
          accountJoinedAt={accountJoinedAt}
          locale={locale}
          promptSetUsername={promptSetUsername}
          promptLogin={promptLogin}
        />

        {username ? (
          <>
            <ControlPanelsPrefFormRow
              label={t("apps.control-panels.password")}
              description={t("apps.control-panels.passwordDescription")}
            >
              <Button variant="retro" onClick={openPasswordDialog} className="h-7">
                {hasPassword
                  ? t("apps.control-panels.changePassword")
                  : t("apps.control-panels.setPassword")}
              </Button>
            </ControlPanelsPrefFormRow>

            <ControlPanelsPrefFormRow
              label={t("apps.control-panels.recoveryEmailTitle")}
              description={t("apps.control-panels.recoveryEmailDescription")}
            >
              <Button
                variant="retro"
                onClick={() => setIsRecoveryEmailOpen(true)}
                className="h-7"
              >
                {t("apps.control-panels.manage")}
              </Button>
            </ControlPanelsPrefFormRow>

            <ControlPanelsPrefFormRow
              label={t("apps.control-panels.logOut")}
              description={t("apps.control-panels.logOutRowDescription")}
            >
              <Button variant="retro" onClick={logout} className="h-7">
                {t("apps.control-panels.logOut")}
              </Button>
            </ControlPanelsPrefFormRow>

            <ControlPanelsPrefFormRow
              label={t("apps.control-panels.logOutOfAllDevices")}
              description={t("apps.control-panels.logOutOfAllDevicesRowDescription")}
            >
              <Button
                variant="retro"
                onClick={handleLogoutAllDevices}
                disabled={isLoggingOutAllDevices}
                className="h-7"
              >
                {isLoggingOutAllDevices
                  ? t("apps.control-panels.loggingOut")
                  : t("apps.control-panels.logOutOfAllDevices")}
              </Button>
            </ControlPanelsPrefFormRow>

            <ControlPanelsPrefFormRow
              label={t("apps.control-panels.deleteAccount.title")}
              description={t("apps.control-panels.deleteAccountRowDescription")}
              className="[&_.control-panels-pref-form-label-text]:text-red-600"
            >
              <Button
                variant="retro"
                onClick={() => setIsDeleteAccountOpen(true)}
                className="h-7 text-red-600"
              >
                {t("apps.control-panels.deleteAccount.submit")}
              </Button>
            </ControlPanelsPrefFormRow>
          </>
        ) : null}
      </div>
      <RecoveryEmailDialog
        isOpen={isRecoveryEmailOpen}
        onOpenChange={setIsRecoveryEmailOpen}
      />
      <DeleteAccountDialog
        isOpen={isDeleteAccountOpen}
        onOpenChange={setIsDeleteAccountOpen}
        hasPassword={hasPassword}
      />
    </div>
  );
}
