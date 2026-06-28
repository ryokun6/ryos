import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@phosphor-icons/react";
import {
  createAppletAuthBridgeScript,
  getAppletSandboxAttribute,
  injectAppletRuntime,
} from "@/utils/appletAuthBridge";
import { useMemo, useRef } from "react";
import type { AppStoreViewModel } from "./useAppStore";
import { appletIconStyles } from "./constants";
import { ensureMacFonts } from "./utils";
import { useAppletAuthMessaging } from "@/components/shared/html-preview/hooks/useAppletAuthMessaging";

interface AppStoreDetailViewProps {
  vm: AppStoreViewModel;
}

export function AppStoreDetailView({ vm }: AppStoreDetailViewProps) {
  const {
    t,
    focusWindow,
    selectedApplet,
    selectedAppletContent,
    isWindowsTheme,
    isMacChrome,
    isSystem7Chrome,
    isMacTheme,
    isSystem7Theme,
    isBulkUpdating,
    clearSelectedAppletDetail,
    handleInstall,
    handlePreviewClick,
  } = vm;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const {
    isTrustedApplet,
    appletBridgeNonce,
    appletStorageSnapshot,
    handleIframeLoad,
  } = useAppletAuthMessaging(
    selectedApplet?.createdBy,
    selectedAppletContent || "",
    true,
    selectedApplet?.id
  );
  const previewContent = useMemo(
    () =>
      selectedAppletContent
        ? injectAppletRuntime(
            ensureMacFonts(selectedAppletContent, isMacTheme),
            createAppletAuthBridgeScript(
              appletBridgeNonce,
              appletStorageSnapshot,
              isTrustedApplet
            )
          )
        : "",
    [
      appletBridgeNonce,
      appletStorageSnapshot,
      isMacTheme,
      isTrustedApplet,
      selectedAppletContent,
    ]
  );
  if (!selectedApplet) return null;

  const displayName =
    selectedApplet.title ||
    selectedApplet.name ||
    t("apps.applet-viewer.dialogs.untitledApplet");
  const displayIcon = selectedApplet.icon || "📱";

  return (
    <>
      <style>{appletIconStyles}</style>
      <div className="size-full flex flex-col">
        <div
          className={`flex items-center gap-3 px-3 py-2 ${
            isWindowsTheme
              ? "border-b border-[#919b9c]"
              : isMacChrome
                ? ""
                : isSystem7Chrome
                  ? "bg-neutral-100 border-b border-black"
                  : "bg-neutral-100 border-b border-neutral-200"
          }`}
          style={{
            background: isWindowsTheme ? "transparent" : undefined,
            backgroundImage: isMacChrome ? "var(--os-pinstripe-window)" : undefined,
            borderBottom: isMacChrome
              ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
              : undefined,
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={clearSelectedAppletDetail}
            className="size-7 flex-shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div
            className="!text-2xl flex-shrink-0 applet-icon flex items-center justify-center"
            style={{ fontSize: "1.5rem" }}
          >
            {displayIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm font-geneva-12 truncate">{displayName}</div>
          </div>
          <Button
            size="sm"
            variant={isMacTheme ? "secondary" : isSystem7Theme ? "retro" : "default"}
            onClick={() => void handleInstall(selectedApplet)}
            className="w-[60px]"
            disabled={isBulkUpdating}
          >
            {t("apps.applet-viewer.status.get")}
          </Button>
        </div>
        <div
          className="flex-1 overflow-hidden bg-white"
          onClick={() => {
            focusWindow?.();
            void handlePreviewClick(selectedApplet);
          }}
        >
          {selectedAppletContent ? (
            <iframe
              ref={iframeRef}
              srcDoc={previewContent}
              title={displayName}
              className="size-full border-0"
              sandbox={getAppletSandboxAttribute(isTrustedApplet)}
              onLoad={() =>
                handleIframeLoad(iframeRef.current?.contentWindow)
              }
              style={{
                display: "block",
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">
                  {t("apps.applet-viewer.dialogs.loading")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
