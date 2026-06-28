import type { ReactNode, RefObject } from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import HtmlPreview from "@/components/shared/HtmlPreview";
import type {
  ErrorResponse,
  NavigationMode,
} from "@/stores/useInternetExplorerStore";
import { ErrorPage } from "./ErrorPage";
import { isIeLiveBrowserAvailable } from "@/utils/runtimeConfig";

export interface InternetExplorerContentPaneProps {
  errorDetails: ErrorResponse | null;
  url: string;
  year: string;
  mode: NavigationMode;
  finalUrl: string | null;
  isFutureYear: boolean;
  isAiLoading: boolean;
  aiGeneratedHtml: string | null;
  generatedHtml: string | null;
  status: string;
  isFetchingWebsiteContent: boolean;
  isForeground: boolean;
  currentTheme: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  loadingBarVariants: Variants;
  t: (key: string, options?: Record<string, unknown>) => string;
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
  getDebugStatusMessage: () => ReactNode;
  handleGoBack: () => void;
  handleNavigate: (navUrl: string, navYear?: string) => void;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  bringInstanceToForeground: (instanceId: string) => void;
  instanceId: string;
}

export function InternetExplorerContentPane({
  errorDetails,
  url,
  year,
  mode,
  finalUrl,
  isFutureYear,
  isAiLoading,
  aiGeneratedHtml,
  generatedHtml,
  status,
  isFetchingWebsiteContent,
  isForeground,
  currentTheme,
  iframeRef,
  loadingBarVariants,
  t,
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
  getDebugStatusMessage,
  handleGoBack,
  handleNavigate,
  handleIframeLoad,
  handleIframeError,
  bringInstanceToForeground,
  instanceId,
}: InternetExplorerContentPaneProps) {
  const renderErrorPage = () => {
    if (!errorDetails) return null;

    const title =
      errorDetails.type === "network"
        ? t("apps.internet-explorer.cannotFindServerOrDnsError")
        : t("apps.internet-explorer.error");
    const primaryMessage =
      errorDetails.message || t("apps.internet-explorer.anErrorOccurred");
    const secondaryMessage = errorDetails.details;
    const suggestions: (string | ReactNode)[] = [
      t("apps.internet-explorer.checkWebAddressAndTryAgain"),
      t("apps.internet-explorer.goBackToPreviousPage"),
      t("apps.internet-explorer.tryRefreshingThePage"),
    ];

    // Offer the "live browser" escape hatch only when the server has it
    // configured and the site actively blocked the proxy (auth / bot walls).
    const liveBrowserOffered =
      isIeLiveBrowserAvailable() &&
      (errorDetails.type === "access_blocked" ||
        errorDetails.type === "http_error");
    if (liveBrowserOffered) {
      suggestions.push(
        <a
          href="#"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            void handleOpenLiveBrowser();
          }}
          className="text-red-600 underline"
        >
          {t("apps.internet-explorer.openInLiveBrowser")}
        </a>
      );
    }

    const footerText = errorDetails.hostname
      ? t("apps.internet-explorer.host", {
          hostname: errorDetails.hostname,
        })
      : "";

    return (
      <ErrorPage
        title={title}
        primaryMessage={primaryMessage}
        secondaryMessage={secondaryMessage}
        suggestions={suggestions}
        details={errorDetails.details}
        footerText={footerText}
        t={t}
        onGoBack={handleGoBack}
        onRetry={() => handleNavigate(url, year)}
      />
    );
  };

  const handleOpenLiveBrowser = async () => {
    const target = errorDetails?.targetUrl || url;
    if (!target) return;
    try {
      const res = await fetch(
        `/api/iframe-check?mode=live&url=${encodeURIComponent(target)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { liveViewUrl?: string };
      if (data.liveViewUrl) {
        window.open(data.liveViewUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      // best-effort: live mode is optional, fail quietly
    }
  };

  return (
    <>
      <div className="flex-1 relative bg-white">
        {errorDetails ? (
          renderErrorPage()
        ) : mode === "future" ||
          isFutureYear ||
          (mode === "past" && (isAiLoading || aiGeneratedHtml !== null)) ? (
          <div className="size-full overflow-hidden absolute inset-0 font-geneva-12">
            <HtmlPreview
              htmlContent={
                isAiLoading ? generatedHtml || "" : aiGeneratedHtml || ""
              }
              onInteractionChange={() => {}}
              className="border-none"
              maxHeight="none"
              minHeight="100%"
              initialFullScreen={false}
              isInternetExplorer={true}
              isStreaming={isAiLoading && generatedHtml !== aiGeneratedHtml}
              playElevatorMusic={playElevatorMusic}
              stopElevatorMusic={stopElevatorMusic}
              playDingSound={playDingSound}
              baseUrlForAiContent={url}
              mode={mode}
              appletCreatedBy="ryo"
            />
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={finalUrl || ""}
            className="border-0 block"
            style={{
              width: "calc(100% + 1px)",
              height: "calc(100% + 1px)",
            }}
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        )}

        {!isForeground && (
          <div
            className="absolute inset-0 bg-transparent z-50"
            onClick={() => bringInstanceToForeground(instanceId)}
            onMouseDown={() => bringInstanceToForeground(instanceId)}
            onTouchStart={() => bringInstanceToForeground(instanceId)}
            onWheel={() => bringInstanceToForeground(instanceId)}
            onDragStart={() => bringInstanceToForeground(instanceId)}
            onKeyDown={() => bringInstanceToForeground(instanceId)}
          />
        )}

        <AnimatePresence>
          {(status === "loading" ||
            isAiLoading ||
            isFetchingWebsiteContent) && (
            <motion.div
              className="absolute top-0 left-0 right-0 bg-transparent backdrop-blur-sm overflow-hidden z-40"
              variants={loadingBarVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <div
                className={`h-full ${
                  isAiLoading && mode === "past" && parseInt(year) <= 1995
                    ? "animate-progress-indeterminate-orange-reverse"
                    : isAiLoading
                      ? "animate-progress-indeterminate-orange"
                      : isFetchingWebsiteContent && mode === "past"
                        ? "animate-progress-indeterminate-green-reverse"
                        : isFetchingWebsiteContent
                          ? "animate-progress-indeterminate-green"
                          : mode === "past" && !isAiLoading
                            ? "animate-progress-indeterminate-reverse"
                            : "animate-progress-indeterminate"
                }`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {(status === "loading" ||
          (isAiLoading && generatedHtml !== aiGeneratedHtml) ||
          isFetchingWebsiteContent) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.15 }}
            className={`os-status-bar os-status-bar-text font-geneva-12 absolute bottom-0 left-0 right-0 bg-neutral-100 dark:bg-neutral-900 text-[10px] px-2 py-1 flex items-center z-50 ${
              currentTheme === "system7"
                ? "border-t border-black"
                : "border-t border-neutral-300 dark:border-white/10"
            }`}
          >
            <div className="flex-1 truncate">{getDebugStatusMessage()}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
