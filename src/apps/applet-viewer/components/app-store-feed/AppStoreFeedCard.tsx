import { Button } from "@/components/ui/button";
import {
  createAppletAuthBridgeScript,
  getAppletSandboxAttribute,
  injectAppletRuntime,
} from "@/utils/appletAuthBridge";
import { useMemo, useRef } from "react";
import type { TFunction } from "i18next";
import type { Applet } from "../../utils/appletActions";
import type { useAppletActions } from "../../utils/appletActions";
import { ensureMacFonts } from "./ensureMacFonts";
import { useAppletAuthMessaging } from "@/components/shared/html-preview/hooks/useAppletAuthMessaging";

type AppletActions = ReturnType<typeof useAppletActions>;

export interface AppStoreFeedCardProps {
  applet: Applet;
  index: number;
  currentIndex: number;
  appletsCount: number;
  isMacTheme: boolean;
  isSystem7Theme: boolean;
  isWindowsTheme: boolean;
  actions: AppletActions;
  content: string | undefined;
  isLoadingContent: boolean;
  t: TFunction;
  scrollToIndex: (index: number) => void;
  onPreviewClick: (applet: Applet) => void;
  onInstall: (applet: Applet) => void;
  onAppletClick: (applet: Applet) => void;
}

export function AppStoreFeedCard({
  applet,
  index,
  currentIndex,
  appletsCount,
  isMacTheme,
  isSystem7Theme,
  isWindowsTheme,
  actions,
  content,
  isLoadingContent,
  t,
  scrollToIndex,
  onPreviewClick,
  onInstall,
  onAppletClick,
}: AppStoreFeedCardProps) {
  const displayName =
    applet.title || applet.name || t("apps.applet-viewer.dialogs.untitledApplet");
  const displayIcon = applet.icon || "📱";
  const installed = actions.isAppletInstalled(applet.id);
  const updateAvailable = actions.needsUpdate(applet);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const {
    isTrustedApplet,
    appletBridgeNonce,
    appletStorageSnapshot,
    handleIframeLoad,
  } = useAppletAuthMessaging(
    applet.createdBy,
    content || "",
    true,
    applet.id
  );
  const previewContent = useMemo(
    () =>
      content
        ? injectAppletRuntime(
            ensureMacFonts(content, isMacTheme),
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
      content,
      isMacTheme,
      isTrustedApplet,
    ]
  );

  return (
    <div
      key={applet.id}
      data-applet-index={index}
      data-applet-card
      className="h-full w-full relative"
      style={{ minHeight: "100%" }}
    >
      <div
        className="absolute inset-0"
        style={{ paddingTop: "54px" }}
        onClick={() => {
          if (index === currentIndex) {
            onPreviewClick(applet);
          }
        }}
        onWheel={(e) => {
          if (index !== currentIndex) return;

          const iframe = e.currentTarget.querySelector(
            "iframe"
          ) as HTMLIFrameElement;
          if (!iframe) return;

          setTimeout(() => {
            try {
              const iframeDoc =
                iframe.contentDocument || iframe.contentWindow?.document;
              if (!iframeDoc) return;

              const scrollTop =
                iframeDoc.documentElement.scrollTop ||
                iframeDoc.body.scrollTop ||
                0;
              const scrollHeight =
                iframeDoc.documentElement.scrollHeight ||
                iframeDoc.body.scrollHeight ||
                0;
              const clientHeight =
                iframeDoc.documentElement.clientHeight ||
                iframeDoc.body.clientHeight ||
                0;

              const atTop = scrollTop <= 5;
              const atBottom = scrollTop + clientHeight >= scrollHeight - 5;
              const canScroll = scrollHeight > clientHeight;

              if (e.deltaY < 0 && atTop && currentIndex > 0 && canScroll) {
                scrollToIndex(currentIndex - 1);
              } else if (
                e.deltaY > 0 &&
                atBottom &&
                currentIndex < appletsCount - 1 &&
                canScroll
              ) {
                scrollToIndex(currentIndex + 1);
              } else if (!canScroll && Math.abs(e.deltaY) > 30) {
                if (e.deltaY > 0 && currentIndex < appletsCount - 1) {
                  scrollToIndex(currentIndex + 1);
                } else if (e.deltaY < 0 && currentIndex > 0) {
                  scrollToIndex(currentIndex - 1);
                }
              }
            } catch {
              if (Math.abs(e.deltaY) > 30) {
                if (e.deltaY > 0 && currentIndex < appletsCount - 1) {
                  scrollToIndex(currentIndex + 1);
                } else if (e.deltaY < 0 && currentIndex > 0) {
                  scrollToIndex(currentIndex - 1);
                }
              }
            }
          }, 100);
        }}
      >
        {content ? (
          (() => {
            return (
              <iframe
                ref={iframeRef}
                srcDoc={previewContent}
                title={displayName}
                className="w-full h-full border-0"
                sandbox={getAppletSandboxAttribute(isTrustedApplet)}
                data-ryos-trusted-applet={isTrustedApplet ? "1" : "0"}
                data-ryos-applet-nonce={appletBridgeNonce}
                onLoad={() =>
                  handleIframeLoad(iframeRef.current?.contentWindow)
                }
                style={{
                  display: "block",
                }}
              />
            );
          })()
        ) : isLoadingContent ? (
          <div className="flex items-center justify-center h-full bg-neutral-50">
            <div className="text-center">
              <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">
                {t("apps.applet-viewer.dialogs.loading")}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full w-full bg-neutral-50" />
        )}
      </div>

      <div
        className={`absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-3 py-2 ${
          isWindowsTheme
            ? "border-b border-[#919b9c]"
            : isMacTheme
              ? ""
              : isSystem7Theme
                ? "bg-neutral-100 border-b border-black"
                : "bg-neutral-100 border-b border-neutral-200"
        }`}
        style={{
          flexWrap: "nowrap",
          background: isWindowsTheme ? "transparent" : undefined,
          backgroundImage: isMacTheme
            ? "var(--os-pinstripe-window)"
            : undefined,
          borderBottom: isMacTheme
            ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
            : undefined,
        }}
      >
        <div
          className="!text-2xl flex-shrink-0 applet-icon flex items-center justify-center"
          style={{ fontSize: "1.5rem" }}
        >
          {displayIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm font-geneva-12 truncate">
            {displayName}
          </div>
          {applet.createdBy && (
            <div className="text-[10px] text-neutral-500 font-geneva-12 truncate">
              {applet.createdBy}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant={
            updateAvailable
              ? "default"
              : isMacTheme
                ? "secondary"
                : isSystem7Theme
                  ? "retro"
                  : "default"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (installed) {
              if (updateAvailable) {
                onInstall(applet);
              } else {
                onAppletClick(applet);
              }
            } else {
              onInstall(applet);
            }
          }}
          className="flex-shrink-0 whitespace-nowrap"
        >
          {installed
            ? updateAvailable
              ? t("apps.applet-viewer.status.update")
              : t("apps.applet-viewer.status.open")
            : t("apps.applet-viewer.status.get")}
        </Button>
      </div>
    </div>
  );
}
