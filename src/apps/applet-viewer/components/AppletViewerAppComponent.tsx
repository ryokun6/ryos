import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { AppletViewerMenuBar } from "./AppletViewerMenuBar";
import { AppStore } from "./AppStore";
import { appMetadata, AppletViewerInitialData } from "../index";
import { generateAppletShareUrl } from "@/utils/sharedUrl";
import { useAppletViewerLogic } from "../hooks/useAppletViewerLogic";

export function AppletViewerAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
  instanceId,
  initialData,
}: AppProps<AppletViewerInitialData>) {
  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
    shareId,
    setShareId,
    iframeRef,
    currentTheme,
    isXpTheme,
    isMacTheme,
    hasAppletContent,
    htmlContent,
    shareCode,
    windowTitle,
    injectAppletAuthScript,
    ensureMacFonts,
    sendAuthPayload,
    focusWindow,
    handleExportAsApp,
    handleExportAsHtml,
    handleShareApplet,
    handleFileSelect,
    promptSetUsername,
    promptVerifyToken,
    logout,
    updateCount,
    handleCheckForUpdates,
    handleUpdateAll,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    getAppletTitle,
  } = useAppletViewerLogic({ instanceId, initialData });

  const menuBar = (
    <AppletViewerMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onExportAsApp={handleExportAsApp}
      onExportAsHtml={handleExportAsHtml}
      onShareApplet={handleShareApplet}
      hasAppletContent={hasAppletContent}
      handleFileSelect={handleFileSelect}
      instanceId={instanceId}
      onSetUsername={promptSetUsername}
      onVerifyToken={promptVerifyToken}
      onLogout={logout}
      updateCount={updateCount}
      onCheckForUpdates={handleCheckForUpdates}
      onUpdateAll={handleUpdateAll}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="applet-viewer"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="w-full h-full bg-white overflow-hidden">
          {hasAppletContent ? (
            <div className="relative h-full w-full">
              <iframe
                ref={iframeRef}
                srcDoc={injectAppletAuthScript(ensureMacFonts(htmlContent))}
                title={windowTitle}
                className="border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
                style={{
                  display: "block",
                  margin: 0,
                  padding: 0,
                  width: "calc(100% + 1px)",
                  height: "calc(100% + 1px)",
                }}
                onLoad={() =>
                  sendAuthPayload(iframeRef.current?.contentWindow || null)
                }
                onFocus={focusWindow}
                onFocusCapture={focusWindow}
              />
              {!isForeground && (
                <div
                  className="absolute inset-0 z-50 bg-transparent"
                  aria-hidden="true"
                  onClick={focusWindow}
                  onMouseDown={focusWindow}
                  onTouchStart={focusWindow}
                  onWheel={focusWindow}
                  onDragStart={focusWindow}
                  onKeyDown={focusWindow}
                />
              )}
            </div>
          ) : (
            <div
              className="relative h-full w-full"
              style={
                isMacTheme
                  ? {
                      backgroundColor: "var(--os-color-window-bg)",
                      backgroundImage: "var(--os-pinstripe-window)",
                    }
                  : undefined
              }
            >
              <AppStore
                theme={currentTheme}
                sharedAppletId={shareCode || undefined}
                focusWindow={focusWindow}
              />
              {!isForeground && (
                <div
                  className="absolute inset-0 z-50 bg-transparent"
                  aria-hidden="true"
                  onClick={focusWindow}
                  onMouseDown={focusWindow}
                  onTouchStart={focusWindow}
                  onWheel={focusWindow}
                  onDragStart={focusWindow}
                  onKeyDown={focusWindow}
                />
              )}
            </div>
          )}
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="applet-viewer"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="applet-viewer"
      />
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => {
          setIsShareDialogOpen(false);
          setShareId("");
        }}
        itemType="Applet"
        itemIdentifier={shareId}
        title={shareId ? getAppletTitle(htmlContent) : undefined}
        generateShareUrl={generateAppletShareUrl}
      />
      <LoginDialog
        initialTab={isVerifyDialogOpen ? "login" : "signup"}
        isOpen={isUsernameDialogOpen || isVerifyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsUsernameDialogOpen(false);
            setVerifyDialogOpen(false);
          }
        }}
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
    </>
  );
}
