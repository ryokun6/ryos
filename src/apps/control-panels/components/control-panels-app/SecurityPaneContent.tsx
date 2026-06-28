import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { RecoveryEmailDialog } from "@/components/dialogs/RecoveryEmailDialog";
import { DeleteAccountDialog } from "@/components/dialogs/DeleteAccountDialog";
import type { LanguageCode } from "@/stores/useLanguageStore";
import type { RealtimeConnectionState } from "@/lib/pusherClient";
import type { Contact } from "@/utils/contacts";
import { AccountProfileHeader } from "./AccountProfileHeader";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";
import { cn } from "@/lib/utils";

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
  const [isLogoutAllConfirmOpen, setIsLogoutAllConfirmOpen] = useState(false);

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

        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.password")}
          description={t("apps.control-panels.passwordDescription")}
          className={cn(!username && "opacity-50")}
        >
          <Button
            variant="retro"
            onClick={openPasswordDialog}
            disabled={!username}
            className="h-7"
          >
            {hasPassword
              ? t("apps.control-panels.changePasswordButton")
              : t("apps.control-panels.setPassword")}
          </Button>
        </ControlPanelsPrefFormRow>

        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.recoveryEmailTitle")}
          description={t("apps.control-panels.recoveryEmailDescription")}
          className={cn(!username && "opacity-50")}
        >
          <Button
            variant="retro"
            onClick={() => setIsRecoveryEmailOpen(true)}
            disabled={!username}
            className="h-7"
          >
            {t("apps.control-panels.manage")}
          </Button>
        </ControlPanelsPrefFormRow>

        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.logOut")}
          description={t("apps.control-panels.logOutRowDescription")}
          className={cn(!username && "opacity-50")}
        >
          <Button
            variant="retro"
            onClick={logout}
            disabled={!username}
            className="h-7"
          >
            {t("apps.control-panels.logOutButton")}
          </Button>
        </ControlPanelsPrefFormRow>

        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.logOutOfAllDevices")}
          description={t("apps.control-panels.logOutOfAllDevicesRowDescription")}
          className={cn(!username && "opacity-50")}
        >
          <Button
            variant="retro"
            onClick={() => setIsLogoutAllConfirmOpen(true)}
            disabled={!username || isLoggingOutAllDevices}
            className="h-7"
          >
            {isLoggingOutAllDevices
              ? t("apps.control-panels.loggingOut")
              : t("apps.control-panels.logOutAll")}
          </Button>
        </ControlPanelsPrefFormRow>

        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.deleteAccount.title")}
          description={t("apps.control-panels.deleteAccountRowDescription")}
          className={cn(
            "[&_.control-panels-pref-form-label-text]:text-red-600",
            !username && "opacity-50"
          )}
        >
          <Button
            variant="retro"
            onClick={() => setIsDeleteAccountOpen(true)}
            disabled={!username}
            className="h-7 text-red-600"
          >
            {t("apps.control-panels.deleteAccount.openButton")}
          </Button>
        </ControlPanelsPrefFormRow>
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
      <ConfirmDialog
        isOpen={isLogoutAllConfirmOpen}
        onOpenChange={setIsLogoutAllConfirmOpen}
        onConfirm={() => {
          setIsLogoutAllConfirmOpen(false);
          handleLogoutAllDevices();
        }}
        title={t("apps.control-panels.logOutOfAllDevices")}
        description={t("apps.control-panels.logOutOfAllDevicesRowDescription")}
      />
    </div>
  );
}
