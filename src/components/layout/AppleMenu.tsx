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
import { AppId, appRegistry } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStore } from "@/stores/useAppStore";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getTranslatedAppName } from "@/utils/i18n";
import { forceRefreshCache } from "@/utils/prefetch";

export function AppleMenu() {
  const { t } = useTranslation();
  const [aboutFinderOpen, setAboutFinderOpen] = useState(false);
  const launchApp = useLaunchApp();
  const currentTheme = useThemeStore((state) => state.current);
  const isMacOsxTheme = currentTheme === "macosx";

  // Recent items from store
  const recentApps = useAppStore((state) => state.recentApps);
  const recentDocuments = useAppStore((state) => state.recentDocuments);

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

  const handleAppClick = (appId: string) => {
    launchApp(appId as AppId);
  };

  const handleDocumentClick = (path: string, appId: AppId) => {
    launchApp(appId, { path });
  };

  const handleSoftwareUpdate = () => {
    forceRefreshCache();
  };

  const handleSystemPreferences = () => {
    launchApp("control-panels" as AppId);
  };

  const handleAppletStore = () => {
    launchApp("applet-viewer" as AppId, { path: "", content: "" });
  };

  // Get top 5 recent apps
  const topRecentApps = recentApps.slice(0, 5);
  // Get top 5 recent documents
  const topRecentDocuments = recentDocuments.slice(0, 5);

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

          <MenubarSeparator className="h-[2px] bg-black my-1" />

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

          {/* Applet Store */}
          <MenubarItem
            onClick={handleAppletStore}
            className="text-md h-6 px-3"
          >
            {t("common.appleMenu.appletStore")}
          </MenubarItem>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Recent Items submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("common.appleMenu.recentItems")}
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-[200px]">
              {/* Recent Apps section */}
              {topRecentApps.length > 0 ? (
                <>
                  {topRecentApps.map((recent) => {
                    const app = appRegistry[recent.appId];
                    if (!app) return null;
                    return (
                      <MenubarItem
                        key={`app-${recent.appId}-${recent.timestamp}`}
                        onClick={() => handleAppClick(recent.appId)}
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
                        {getTranslatedAppName(recent.appId)}
                      </MenubarItem>
                    );
                  })}
                  {recentApps.length > 5 && (
                    <MenubarItem
                      onClick={() => handleSystemPreferences()}
                      className="text-md h-6 px-3 text-gray-500"
                    >
                      {t("common.appleMenu.more")}
                    </MenubarItem>
                  )}
                </>
              ) : (
                <MenubarItem disabled className="text-md h-6 px-3 text-gray-400">
                  {t("common.appleMenu.noRecentApps")}
                </MenubarItem>
              )}

              <MenubarSeparator className="h-[2px] bg-black my-1" />

              {/* Recent Documents section */}
              {topRecentDocuments.length > 0 ? (
                <>
                  {topRecentDocuments.map((recent) => (
                    <MenubarItem
                      key={`doc-${recent.path}-${recent.timestamp}`}
                      onClick={() => handleDocumentClick(recent.path, recent.appId)}
                      className="text-md h-6 px-3 flex items-center gap-2"
                    >
                      <ThemedIcon
                        name="document.png"
                        alt="Document"
                        className="w-4 h-4 [image-rendering:pixelated]"
                      />
                      <span className="truncate max-w-[180px]">{recent.name}</span>
                    </MenubarItem>
                  ))}
                  {recentDocuments.length > 5 && (
                    <MenubarItem
                      onClick={() => launchApp("finder" as AppId, { path: "/" })}
                      className="text-md h-6 px-3 text-gray-500"
                    >
                      {t("common.appleMenu.more")}
                    </MenubarItem>
                  )}
                </>
              ) : (
                <MenubarItem disabled className="text-md h-6 px-3 text-gray-400">
                  {t("common.appleMenu.noRecentDocuments")}
                </MenubarItem>
              )}
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
