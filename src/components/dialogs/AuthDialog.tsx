import React, { useState, useEffect } from "react";
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

interface AuthDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // Login props
  onLogin: (username: string, password: string) => Promise<void>;
  loginUsernameInput: string;
  onLoginUsernameInputChange: (value: string) => void;
  loginPasswordInput: string;
  onLoginPasswordInputChange: (value: string) => void;
  // Sign up props
  onSignUp: () => Promise<void>;
  signUpUsername: string;
  onSignUpUsernameChange: (value: string) => void;
  signUpPassword: string;
  onSignUpPasswordChange: (value: string) => void;
  // Common props
  isLoading: boolean;
  error: string | null;
  onErrorChange: (error: string | null) => void;
  initialTab?: "login" | "signup";
}

export function AuthDialog({
  isOpen,
  onOpenChange,
  onLogin,
  loginUsernameInput,
  onLoginUsernameInputChange,
  loginPasswordInput,
  onLoginPasswordInputChange,
  onSignUp,
  signUpUsername,
  onSignUpUsernameChange,
  signUpPassword,
  onSignUpPasswordChange,
  isLoading,
  error,
  onErrorChange,
  initialTab = "login",
}: AuthDialogProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(initialTab);

  // Reset to initial tab when dialog opens and clear errors
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      onErrorChange(null);
    }
  }, [isOpen, initialTab, onErrorChange]);

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isLoading) {
      await onLogin(loginUsernameInput, loginPasswordInput);
    }
  };

  const handleSignUpSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isLoading) {
      await onSignUp();
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "login" | "signup");
    onErrorChange(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-system7-window-bg border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] max-w-[400px]"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">
            {activeTab === "login" ? "Log In to ryOS" : "Create New Account"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {activeTab === "login" 
              ? "Log in to your account" 
              : "Create an account to access chat rooms and save your settings"}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2 pb-6 px-6">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid grid-cols-2 w-full h-fit mb-4 bg-transparent p-0.5 border border-black">
              <TabsTrigger
                value="signup"
                className="relative font-geneva-12 text-[12px] px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10 data-[state=inactive]:border-r-0"
              >
                Sign Up
              </TabsTrigger>
              <TabsTrigger
                value="login"
                className="relative font-geneva-12 text-[12px] px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10"
              >
                Login
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signup" className="mt-0">
              <form onSubmit={handleSignUpSubmit}>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-gray-700 text-[12px] font-geneva-12">
                      Set Username
                    </Label>
                    <Input
                      autoFocus={activeTab === "signup"}
                      value={signUpUsername}
                      onChange={(e) => {
                        onSignUpUsernameChange(e.target.value);
                        onErrorChange(null);
                      }}
                      placeholder=""
                      className="shadow-none font-geneva-12 text-[12px] h-8"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-700 text-[12px] font-geneva-12">
                      Set Password (optional)
                    </Label>
                    <Input
                      type="password"
                      value={signUpPassword}
                      onChange={(e) => {
                        onSignUpPasswordChange(e.target.value);
                        onErrorChange(null);
                      }}
                      placeholder=""
                      className="shadow-none font-geneva-12 text-[12px] h-8"
                      disabled={isLoading}
                    />
                    <p className="text-[11px] text-gray-600 font-geneva-12">
                      Add a password to recover your account later.
                    </p>
                  </div>
                </div>

                {error && (
                  <p className="text-red-600 text-[12px] font-geneva-12 mt-3">
                    {error}
                  </p>
                )}

                <DialogFooter className="mt-4 gap-2 sm:justify-end">
                  <Button
                    type="submit"
                    variant="retro"
                    disabled={isLoading || !signUpUsername.trim()}
                    className="w-full sm:w-auto"
                  >
                    {isLoading ? "Creating..." : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="login" className="mt-0">
              <form onSubmit={handleLoginSubmit}>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-gray-700 text-[12px] font-geneva-12">
                      Username
                    </Label>
                    <Input
                      autoFocus={activeTab === "login"}
                      value={loginUsernameInput}
                      onChange={(e) => {
                        onLoginUsernameInputChange(e.target.value);
                        onErrorChange(null);
                      }}
                      placeholder=""
                      className="shadow-none font-geneva-12 text-[12px] h-8"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 text-[12px] font-geneva-12">
                      Password
                    </Label>
                    <Input
                      type="password"
                      value={loginPasswordInput}
                      onChange={(e) => {
                        onLoginPasswordInputChange(e.target.value);
                        onErrorChange(null);
                      }}
                      placeholder=""
                      className="shadow-none font-geneva-12 text-[12px] h-8"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-600 text-[12px] font-geneva-12 mt-3">
                    {error}
                  </p>
                )}

                <DialogFooter className="mt-4 gap-2 sm:justify-end">
                  <Button
                    type="submit"
                    variant="retro"
                    disabled={
                      isLoading ||
                      !loginPasswordInput.trim() ||
                      !loginUsernameInput.trim()
                    }
                    className="w-full sm:w-auto"
                  >
                    {isLoading ? "Logging in..." : "Log In"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}