import { Streamdown } from "streamdown";
import type { AppProps } from "@/apps/base/types";
import type { PreviewInitialData } from "..";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { PREVIEW_FILE_ACCEPT } from "@/utils/fileAssociations";
import { appMetadata } from "../metadata";
import { usePreviewLogic } from "../hooks/usePreviewLogic";
import { PreviewMenuBar } from "./PreviewMenuBar";

export function PreviewAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<PreviewInitialData>) {
  const {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    currentPath,
    displayName,
    displayText,
    kind,
    objectUrl,
    isLoading,
    error,
    zoom,
    setZoom,
    fitToWindow,
    setFitToWindow,
    fileInputRef,
    handleOpen,
    handleFileInputChange,
    handleDrop,
    openWithApps,
    handleOpenWith,
  } = usePreviewLogic({ initialData, instanceId, isWindowOpen });

  const isImage = kind === "image";
  const menuBar = (
    <PreviewMenuBar
      onClose={onClose}
      onOpen={() => void handleOpen()}
      onOpenWith={(appId) => void handleOpenWith(appId)}
      openWithApps={openWithApps}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      isImage={isImage}
      zoom={zoom}
      onSetZoom={setZoom}
      fitToWindow={fitToWindow}
      onSetFitToWindow={setFitToWindow}
    />
  );

  const previewContent = (() => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center text-os-text-secondary">
          {t("apps.preview.status.loading")}
        </div>
      );
    }

    if (!currentPath) {
      return (
        <button
          type="button"
          onClick={() => void handleOpen()}
          className="flex h-full w-full flex-col items-center justify-center gap-3 text-os-text-secondary hover:text-os-text-primary"
        >
          <img
            src={appMetadata.icon}
            alt=""
            className="size-24 object-contain drop-shadow-md"
          />
          <span className="text-lg font-semibold text-os-text-primary">
            {t("apps.preview.empty.title")}
          </span>
          <span>{t("apps.preview.empty.hint")}</span>
        </button>
      );
    }

    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <span className="text-4xl" aria-hidden="true">
            ⚠️
          </span>
          <strong>{t("apps.preview.status.loadFailed")}</strong>
          <span className="text-os-text-secondary">{error}</span>
        </div>
      );
    }

    if (kind === "image" && objectUrl) {
      return (
        <div className="flex min-h-full min-w-full items-center justify-center p-6">
          <img
            src={objectUrl}
            alt={displayName}
            draggable={false}
            className={
              fitToWindow
                ? "max-h-full max-w-full object-contain drop-shadow-lg"
                : "max-w-none object-contain drop-shadow-lg"
            }
            style={
              fitToWindow
                ? undefined
                : { width: `${zoom}%`, height: "auto" }
            }
          />
        </div>
      );
    }

    if (kind === "pdf" && objectUrl) {
      return (
        <iframe
          src={objectUrl}
          title={displayName}
          className="h-full w-full border-0 bg-white"
        />
      );
    }

    if (kind === "html") {
      return (
        <iframe
          srcDoc={displayText}
          sandbox=""
          title={displayName}
          className="h-full w-full border-0 bg-white"
        />
      );
    }

    if (kind === "markdown") {
      return (
        <article className="prose-textedit mx-auto min-h-full w-full max-w-3xl p-8 text-os-text-primary">
          <Streamdown controls={false} mode="static" skipHtml>
            {displayText}
          </Streamdown>
        </article>
      );
    }

    if (kind === "text") {
      return (
        <pre className="min-h-full whitespace-pre-wrap break-words p-6 font-os-mono text-sm text-os-text-primary">
          {displayText}
        </pre>
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="text-5xl" aria-hidden="true">
          📄
        </span>
        <strong>{t("apps.preview.status.unsupported")}</strong>
        <span className="text-os-text-secondary">
          {t("apps.preview.status.unsupportedDescription")}
        </span>
      </div>
    );
  })();

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: displayName,
        onClose,
        isForeground,
        appId: "preview",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
      }}
      leading={
        <input
          ref={fileInputRef}
          type="file"
          accept={PREVIEW_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileInputChange}
        />
      }
      trailing={
        <AppHelpAboutDialogs
          appId="preview"
          helpItems={translatedHelpItems}
          metadata={appMetadata}
          isHelpOpen={isHelpDialogOpen}
          onHelpOpenChange={setIsHelpDialogOpen}
          isAboutOpen={isAboutDialogOpen}
          onAboutOpenChange={setIsAboutDialogOpen}
        />
      }
    >
      <div
        className="relative h-full overflow-auto bg-os-panel-bg font-os-ui text-os-text-primary"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {previewContent}
      </div>
    </AppWindowShell>
  );
}
