import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { AboutFinderDialog } from "@/components/dialogs/AboutFinderDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { LogoutDialog } from "@/components/dialogs/LogoutDialog";
import { AnyApp } from "@/apps/base/types";
import { AppId } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getTranslatedAppName } from "@/utils/i18n";
import { forceRefreshCache } from "@/utils/prefetch";

interface AppleMenuProps {
  apps: AnyApp[];
}

export function AppleMenu({ apps }: AppleMenuProps) {
  const { t } = useTranslation();
  const [aboutFinderOpen, setAboutFinderOpen] = useState(false);
  const launchApp = useLaunchApp();
  const currentTheme = useThemeStore((state) => state.current);
  const isMacOsxTheme = currentTheme === "macosx";

  // Auth state and handlers from useAuth
  const {
    username,
    authToken,
    hasPassword,
    // Username/signup dialog
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    // Token/login verification dialog
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    // Logout
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
  } = useAuth();

  const isLoggedIn = !!(username && authToken);

  // Filter out admin-only apps from the Apple menu
  const visibleApps = apps.filter((app) => app.id !== "admin");

  const handleAppClick = (appId: string) => {
    // Simply launch the app - the instance system will handle focus if already open
    launchApp(appId as AppId);
  };

  const handleSoftwareUpdate = () => {
    forceRefreshCache();
  };

  const handleSystemPreferences = () => {
    launchApp("control-panels" as AppId);
  };

  return (
    <>
      <MenubarMenu>
        <MenubarTrigger
          className={cn(
            "border-none focus-visible:ring-0 flex items-center justify-center",
            isMacOsxTheme ? "px-1" : "px-3"
          )}
        >
          {isMacOsxTheme ? (
            <ThemedIcon
              name="apple.png"
              alt="Apple Menu"
              style={{ width: 30, height: 30 }}
            />
          ) : (
            "\uf8ff" // 
          )}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {/* About This Computer */}
          <MenubarItem
            onClick={() => setAboutFinderOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("common.appleMenu.aboutThisComputer")}
          </MenubarItem>

          {/* Software Update */}
          <MenubarItem
            onClick={handleSoftwareUpdate}
            className="text-md h-6 px-3"
          >
            {t("common.appleMenu.softwareUpdate")}
          </MenubarItem>

          {/* System Preferences */}
          <MenubarItem
            onClick={handleSystemPreferences}
            className="text-md h-6 px-3"
          >
            {t("common.appleMenu.systemPreferences")}
          </MenubarItem>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Apps submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("common.appleMenu.apps")}
            </MenubarSubTrigger>
            <MenubarSubContent>
              {visibleApps.map((app) => (
                <MenubarItem
                  key={app.id}
                  onClick={() => handleAppClick(app.id)}
                  className="text-md h-6 px-3 flex items-center gap-2"
                >
                  {typeof app.icon === "string" ? (
                    <div className="w-4 h-4 flex items-center justify-center">
                      {app.icon}
                    </div>
                  ) : (
                    <ThemedIcon
                      name={app.icon.src}
                      alt={app.name}
                      className="w-4 h-4 [image-rendering:pixelated]"
                    />
                  )}
                  {getTranslatedAppName(app.id as AppId)}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Account section */}
          {isLoggedIn ? (
            <MenubarItem onClick={logout} className="text-md h-6 px-3">
              {t("common.appleMenu.logOut", { username })}
            </MenubarItem>
          ) : (
            <>
              <MenubarItem
                onClick={promptSetUsername}
                className="text-md h-6 px-3"
              >
                {t("common.appleMenu.createAccount")}
              </MenubarItem>
              <MenubarItem
                onClick={promptVerifyToken}
                className="text-md h-6 px-3"
              >
                {t("common.appleMenu.login")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>

      {/* Dialogs */}
      <AboutFinderDialog
        isOpen={aboutFinderOpen}
        onOpenChange={setAboutFinderOpen}
      />

      {/* Sign Up Dialog */}
      <LoginDialog
        initialTab="signup"
        isOpen={isUsernameDialogOpen}
        onOpenChange={setIsUsernameDialogOpen}
        /* Login props */
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        /* Sign-up props */
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={submitUsernameDialog}
        isSignUpLoading={isSettingUsername}
        signUpError={usernameError}
      />

      {/* Log In Dialog */}
      <LoginDialog
        isOpen={isVerifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        /* Login props */
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        /* Sign-up props */
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={async () => {
          setVerifyDialogOpen(false);
          promptSetUsername();
        }}
        isSignUpLoading={false}
        signUpError={null}
      />

      {/* Logout Confirmation Dialog */}
      <LogoutDialog
        isOpen={isLogoutConfirmDialogOpen}
        onOpenChange={setIsLogoutConfirmDialogOpen}
        onConfirm={confirmLogout}
        hasPassword={hasPassword}
        onSetPassword={() => {
          // For now, just close and prompt login to set password
          setIsLogoutConfirmDialogOpen(false);
        }}
      />
    </>
  );
}
