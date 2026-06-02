import { useEffect, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const menuItemClassName =
  "text-md min-h-9 px-3 py-2 touch-manipulation cursor-pointer font-geneva-12";

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
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="retro"
          className="h-7 min-h-9 shrink-0 gap-1 px-2.5 sm:min-h-7"
          aria-label={t("apps.control-panels.accountMenu")}
        >
          <span className="font-geneva-12 text-[13px] leading-none">
            {t("apps.control-panels.accountMenu")}
          </span>
          <CaretDown size={10} weight="bold" className="shrink-0" aria-hidden />
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
  );
}
