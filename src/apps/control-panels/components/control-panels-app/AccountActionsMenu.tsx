import { useEffect, useState } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RecoveryEmailDialog } from "@/components/dialogs/RecoveryEmailDialog";
import { DeleteAccountDialog } from "@/components/dialogs/DeleteAccountDialog";

const menuItemClassName = "text-md h-6 px-3";

export type AccountActionsMenuProps = {
  t: (key: string) => string;
  hasPassword: boolean | null;
  debugMode: boolean;
  isLoggingOutAllDevices: boolean;
  setPasswordInput: (value: string) => void;
  setPasswordError: (error: string | null) => void;
  setIsPasswordDialogOpen: (open: boolean) => void;
  logout: () => void;
  handleLogoutAllDevices: () => void;
  promptVerifyToken: () => void;
};

export function AccountActionsMenu({
  t,
  hasPassword,
  debugMode,
  isLoggingOutAllDevices,
  setPasswordInput,
  setPasswordError,
  setIsPasswordDialogOpen,
  logout,
  handleLogoutAllDevices,
  promptVerifyToken,
}: AccountActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [isRecoveryEmailOpen, setIsRecoveryEmailOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [hasPassword, isLoggingOutAllDevices]);

  const openPasswordDialog = () => {
    setPasswordInput("");
    setPasswordError(null);
    setIsPasswordDialogOpen(true);
  };

  const showChangePasswordActions = hasPassword !== false;

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="retro"
          className={cn(
            "h-7 w-7 min-h-7 min-w-7 shrink-0 rounded-full p-0",
            "inline-flex items-center justify-center"
          )}
          aria-label={t("apps.control-panels.accountMenu")}
        >
          <DotsThree size={16} weight="bold" className="shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
        {debugMode ? (
          <DropdownMenuItem
            className={menuItemClassName}
            onSelect={() => promptVerifyToken()}
          >
            {t("apps.control-panels.logIn")}
          </DropdownMenuItem>
        ) : null}
        {showChangePasswordActions ? (
          <>
            <DropdownMenuItem
              className={menuItemClassName}
              onSelect={openPasswordDialog}
            >
              {t("apps.control-panels.changePassword")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClassName}
              onSelect={() => logout()}
            >
              {t("apps.control-panels.logOut")}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            className={menuItemClassName}
            onSelect={openPasswordDialog}
          >
            {t("apps.control-panels.setPassword")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => setIsRecoveryEmailOpen(true)}
        >
          {t("apps.control-panels.recoveryEmailMenu")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(menuItemClassName, "text-red-600")}
          onSelect={() => setIsDeleteAccountOpen(true)}
        >
          {t("apps.control-panels.deleteAccountMenu")}
        </DropdownMenuItem>
        {debugMode ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={menuItemClassName}
              disabled={isLoggingOutAllDevices}
              onSelect={() => {
                if (!isLoggingOutAllDevices) {
                  handleLogoutAllDevices();
                }
              }}
            >
              {isLoggingOutAllDevices
                ? t("apps.control-panels.loggingOut")
                : t("apps.control-panels.logOutOfAllDevices")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
      <RecoveryEmailDialog
        isOpen={isRecoveryEmailOpen}
        onOpenChange={setIsRecoveryEmailOpen}
      />
      <DeleteAccountDialog
        isOpen={isDeleteAccountOpen}
        onOpenChange={setIsDeleteAccountOpen}
        hasPassword={hasPassword}
      />
    </>
  );
}
