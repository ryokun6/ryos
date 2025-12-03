import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { getTabStyles } from "@/utils/tabStyles";
import { useTranslation } from "react-i18next";

interface LoginDialogProps {
  /* Common */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the dialog opens, choose which tab is active first */
  initialTab?: "login" | "signup";

  /* Login fields */
  usernameInput: string;
  onUsernameInputChange: (value: string) => void;
  passwordInput: string;
  onPasswordInputChange: (value: string) => void;
  onLoginSubmit: () => Promise<void>;
  isLoginLoading: boolean;
  loginError: string | null;

  /* Sign-up fields */
  newUsername: string;
  onNewUsernameChange: (value: string) => void;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  onSignUpSubmit: () => Promise<void>;
  isSignUpLoading: boolean;
  signUpError: string | null;
}

export function LoginDialog({
  isOpen,
  onOpenChange,
  initialTab = "login",
  /* Login props */
  usernameInput,
  onUsernameInputChange,
  passwordInput,
  onPasswordInputChange,
  onLoginSubmit,
  isLoginLoading,
  loginError,
  /* Sign-up props */
  newUsername,
  onNewUsernameChange,
  newPassword,
  onNewPasswordChange,
  onSignUpSubmit,
  isSignUpLoading,
  signUpError,
}: LoginDialogProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(initialTab);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const tabStyles = getTabStyles(currentTheme);
  const { t } = useTranslation();
  const dialogTitle = t("common.auth.dialogTitle");

  // Reset to the initial tab whenever the dialog is reopened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  /* Handlers */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (activeTab === "login") {
      if (!isLoginLoading) {
        await onLoginSubmit();
      }
    } else {
      if (!isSignUpLoading) {
        await onSignUpSubmit();
      }
    }
  };

  const renderLoginForm = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label
          className={cn(
            "text-gray-700",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {t("common.auth.username")}
        </Label>
        <Input
          autoFocus={activeTab === "login"}
          value={usernameInput}
          onChange={(e) => onUsernameInputChange(e.target.value)}
          className={cn(
            "shadow-none h-8",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
          disabled={isLoginLoading}
        />
      </div>
      <div className="space-y-2">
        <Label
          className={cn(
            "text-gray-700",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {t("common.auth.password")}
        </Label>
        <Input
          type="password"
          value={passwordInput}
          onChange={(e) => onPasswordInputChange(e.target.value)}
          className={cn(
            "shadow-none h-8",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
          disabled={isLoginLoading}
        />
      </div>
    </div>
  );

  const renderSignUpForm = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label
          className={cn(
            "text-gray-700",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {t("common.auth.username")}
        </Label>
        <Input
          autoFocus={activeTab === "signup"}
          value={newUsername}
          onChange={(e) => onNewUsernameChange(e.target.value)}
          className={cn(
            "shadow-none h-8",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
          disabled={isSignUpLoading}
        />
      </div>
      <div className="space-y-2">
        <Label
          className={cn(
            "text-gray-700",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {t("common.auth.password")}
        </Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => onNewPasswordChange(e.target.value)}
          className={cn(
            "shadow-none h-8",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
          disabled={isSignUpLoading}
        />
      </div>
    </div>
  );

  const isActionLoading =
    activeTab === "login" ? isLoginLoading : isSignUpLoading;
  const activeError = activeTab === "login" ? loginError : signUpError;

  // Automatically close the dialog when an action completes successfully
  const prevLoginLoading = React.useRef(isLoginLoading);
  const prevSignUpLoading = React.useRef(isSignUpLoading);

  React.useEffect(() => {
    // Detect transition from loading -> not loading with no errors
    const loginFinishedSuccessfully =
      prevLoginLoading.current &&
      !isLoginLoading &&
      !loginError &&
      activeTab === "login";

    const signUpFinishedSuccessfully =
      prevSignUpLoading.current &&
      !isSignUpLoading &&
      !signUpError &&
      activeTab === "signup";

    if (isOpen && (loginFinishedSuccessfully || signUpFinishedSuccessfully)) {
      onOpenChange(false);
    }

    prevLoginLoading.current = isLoginLoading;
    prevSignUpLoading.current = isSignUpLoading;
  }, [
    isOpen,
    isLoginLoading,
    isSignUpLoading,
    loginError,
    signUpError,
    activeTab,
    onOpenChange,
  ]);

  const dialogContent = (
    <div className="pt-3 pb-6 px-6">
      <form onSubmit={handleSubmit}>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "login" | "signup")}
          className="w-full"
        >
          {isXpTheme ? (
            <TabsList asChild>
              <menu
                role="tablist"
                className="h-7! flex justify-start! p-0 -mt-1 -mb-[2px] bg-transparent shadow-none grid grid-cols-2 w-full"
              >
                <TabsTrigger
                  value="signup"
                  className={cn(
                    "relative px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10 data-[state=inactive]:border-r-0",
                    "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  )}
                  style={{
                    fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
                    fontSize: "11px",
                  }}
                >
                  {t("common.auth.createAccount")}
                </TabsTrigger>
                <TabsTrigger
                  value="login"
                  className={cn(
                    "relative px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10",
                    "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  )}
                  style={{
                    fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
                    fontSize: "11px",
                  }}
                >
                  {t("common.auth.logIn")}
                </TabsTrigger>
              </menu>
            </TabsList>
          ) : (
            <TabsList
              className={cn(
                tabStyles.tabListClasses,
                "grid grid-cols-2 w-full"
              )}
            >
              <TabsTrigger
                value="signup"
                className={cn(
                  tabStyles.tabTriggerClasses,
                  "px-4 py-1.5",
                  isXpTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : "font-geneva-12 text-[12px]"
                )}
                style={{
                  fontFamily: isXpTheme
                    ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                    : undefined,
                  fontSize: isXpTheme ? "11px" : undefined,
                }}
              >
                {t("common.auth.createAccount")}
              </TabsTrigger>
              <TabsTrigger
                value="login"
                className={cn(
                  tabStyles.tabTriggerClasses,
                  "px-4 py-1.5",
                  isXpTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : "font-geneva-12 text-[12px]"
                )}
                style={{
                  fontFamily: isXpTheme
                    ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                    : undefined,
                  fontSize: isXpTheme ? "11px" : undefined,
                }}
              >
                {t("common.auth.logIn")}
              </TabsTrigger>
            </TabsList>
          )}

          {/* Sign Up */}
          <TabsContent value="signup" className={tabStyles.tabContentClasses}>
            <div className="p-4">{renderSignUpForm()}</div>
          </TabsContent>

          {/* Login */}
          <TabsContent value="login" className={tabStyles.tabContentClasses}>
            <div className="p-4">{renderLoginForm()}</div>
          </TabsContent>
        </Tabs>

        {activeError && (
          <p
            className={cn(
              "text-red-600 mt-3",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            {activeError}
          </p>
        )}

        <DialogFooter className="mt-6 gap-1 sm:justify-end">
          <Button
            type="submit"
            variant="retro"
            disabled={
              isActionLoading ||
              (activeTab === "login"
                ? !usernameInput.trim() || !passwordInput.trim()
                : !newUsername.trim())
            }
            className={cn(
              "w-full sm:w-auto h-7",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            {isActionLoading
              ? activeTab === "login"
                ? t("common.auth.loggingIn")
                : t("common.auth.creatingAccount")
              : activeTab === "login"
              ? t("common.auth.logIn")
              : t("common.auth.createAccount")}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[400px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{dialogTitle}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>{dialogTitle}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {activeTab === "login"
                  ? t("common.auth.loginDescription")
                  : t("common.auth.signupDescription")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
