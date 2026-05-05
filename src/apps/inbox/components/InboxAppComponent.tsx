import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { AppProps } from "@/apps/base/types";
import { useInboxLogic, type InboxTabFilter } from "../hooks/useInboxLogic";
import { appMetadata } from "../metadata";
import { InboxMenuBar } from "./InboxMenuBar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { AppId } from "@/config/appRegistry";
import type { InboxItem } from "@/lib/inbox/inboxTypes";
import { ArrowLeft, Trash } from "@phosphor-icons/react";

const TAB_ORDER: InboxTabFilter[] = [
  "all",
  "unread",
  "system",
  "cursor_agent",
  "applet",
  "chat",
  "calendar",
  "shared_link",
];

function formatWhen(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(ts);
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function InboxAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const { t } = useTranslation();
  const launchApp = useLaunchApp();
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");

  const {
    translatedHelpItems,
    isXpTheme,
    tab,
    setTab,
    filteredItems,
    selectedId,
    setSelectedId,
    selectedItem,
    markRead,
    markUnread,
    toggleRead,
    removeItem,
    clearRead,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useInboxLogic({ instanceId });

  const locale =
    typeof navigator !== "undefined" ? navigator.language : "en-US";

  const tabLabel = useCallback(
    (key: InboxTabFilter) => {
      if (key === "all") return t("apps.inbox.tabs.all");
      if (key === "unread") return t("apps.inbox.tabs.unread");
      return t(`apps.inbox.tabs.${key}`);
    },
    [t]
  );

  const handleSelect = useCallback(
    (item: InboxItem) => {
      setSelectedId(item.id);
      markRead(item.id);
      if (!isMdUp) setMobilePane("detail");
    },
    [markRead, setSelectedId, isMdUp]
  );

  useEffect(() => {
    if (!selectedId && filteredItems.length > 0) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId, setSelectedId]);

  const handlePrimaryAction = useCallback(() => {
    const action = selectedItem?.action;
    if (!action) return;
    if (action.kind === "open_url" && action.url) {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action.kind === "launch_app" && action.appId) {
      launchApp(action.appId as AppId, {
        initialData: action.initialData,
      });
    }
  }, [launchApp, selectedItem]);

  const runToolbarCommand = useCallback(
    (fn: () => void) => {
      if (!selectedItem) return;
      fn();
    },
    [selectedItem]
  );

  const handleClearRead = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("apps.inbox.toolbar.clearReadConfirm"))
    ) {
      return;
    }
    clearRead();
    setSelectedId(null);
  }, [clearRead, setSelectedId, t]);

  const listSection = (
    <div className="flex min-h-0 flex-1 flex-col border-black/15 md:max-w-[min(100%,380px)] md:border-r md:border-os-window">
      <div
        className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-black/15 px-2 py-1.5"
        role="tablist"
        aria-label={t("apps.inbox.title")}
      >
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 rounded-os px-2 py-1 text-[11px] font-medium transition-colors",
              tab === key
                ? "bg-os-selection-bg text-os-selection-text"
                : "bg-black/[0.04] hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            )}
          >
            {tabLabel(key)}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y divide-black/10 py-1">
          {filteredItems.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12px] text-black/50 dark:text-white/45">
              {itemsEmptyHint(tab, t)}
            </li>
          ) : (
            filteredItems.map((item) => {
              const unread = item.readAt === null;
              const active = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                      active
                        ? "bg-os-selection-bg/25"
                        : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                      unread && !active && "bg-blue-500/[0.06] dark:bg-blue-400/[0.08]"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          unread ? "bg-blue-600 dark:bg-blue-400" : "bg-black/15 dark:bg-white/20"
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "truncate text-[12px] leading-tight",
                            unread ? "font-semibold" : "font-medium opacity-90"
                          )}
                        >
                          {item.title}
                        </div>
                        <div className="line-clamp-2 text-[11px] leading-snug text-black/55 dark:text-white/50">
                          {item.preview}
                        </div>
                        <div className="mt-0.5 text-[10px] text-black/40 dark:text-white/35">
                          {tabLabel(item.category)} ·{" "}
                          {formatWhen(item.updatedAt, locale)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </ScrollArea>

      <div className="flex shrink-0 flex-wrap gap-1 border-t border-black/15 px-2 py-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 text-[11px]"
          disabled={!selectedItem}
          onClick={() => runToolbarCommand(() => markRead(selectedItem!.id))}
        >
          {t("apps.inbox.menu.markRead")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 text-[11px]"
          disabled={!selectedItem}
          onClick={() => runToolbarCommand(() => markUnread(selectedItem!.id))}
        >
          {t("apps.inbox.menu.markUnread")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={!selectedItem}
          onClick={() => runToolbarCommand(() => removeItem(selectedItem!.id))}
          aria-label={t("apps.inbox.menu.deleteItem")}
        >
          <Trash className="h-3.5 w-3.5" weight="bold" />
        </Button>
      </div>
    </div>
  );

  const detailSection = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {!isMdUp && mobilePane === "detail" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-black/15 px-2 py-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setMobilePane("list")}
          >
            <ArrowLeft className="h-3.5 w-3.5" weight="bold" />
            {t("apps.inbox.toolbar.backToList")}
          </Button>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {!selectedItem ? (
            <p className="text-[12px] text-black/50 dark:text-white/45">
              {t("apps.inbox.toolbar.detailPlaceholder")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold leading-tight">
                    {selectedItem.title}
                  </h2>
                  <p className="mt-1 text-[11px] text-black/50 dark:text-white/45">
                    {tabLabel(selectedItem.category)} ·{" "}
                    {t("apps.inbox.toolbar.received")}{" "}
                    {formatWhen(selectedItem.updatedAt, locale)}
                  </p>
                  {selectedItem.source?.producer ? (
                    <p className="mt-0.5 text-[10px] text-black/40 dark:text-white/35">
                      {t("apps.inbox.toolbar.producer")}:{" "}
                      {selectedItem.source.producer}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-[11px]"
                  onClick={() => toggleRead(selectedItem.id)}
                >
                  {selectedItem.readAt
                    ? t("apps.inbox.menu.markUnread")
                    : t("apps.inbox.menu.markRead")}
                </Button>
              </div>

              <p className="text-[12px] leading-relaxed text-black/75 dark:text-white/75">
                {selectedItem.preview}
              </p>

              {selectedItem.body ? (
                <pre className="font-os-ui whitespace-pre-wrap rounded-os border border-black/10 bg-black/[0.03] p-3 text-[11px] leading-snug dark:bg-white/[0.04]">
                  {selectedItem.body}
                </pre>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {selectedItem.action?.kind === "open_url" &&
                selectedItem.action.url ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={handlePrimaryAction}
                  >
                    {t("apps.inbox.toolbar.openLink")}
                  </Button>
                ) : null}
                {selectedItem.action?.kind === "launch_app" &&
                selectedItem.action.appId ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={handlePrimaryAction}
                  >
                    {t("apps.inbox.toolbar.openApp")}
                  </Button>
                ) : null}
                {!selectedItem.action ? (
                  <span className="text-[11px] text-black/45 dark:text-white/40">
                    {t("apps.inbox.toolbar.noActions")}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const menuBar = (
    <InboxMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onMarkRead={() => selectedItem && markRead(selectedItem.id)}
      onMarkUnread={() => selectedItem && markUnread(selectedItem.id)}
      onDelete={() => selectedItem && removeItem(selectedItem.id)}
      onClearRead={handleClearRead}
      hasSelection={!!selectedItem}
    />
  );

  if (!isWindowOpen) return null;

  const showSplit = isMdUp || mobilePane === "list";

  return (
    <>
      {!isXpTheme && isForeground ? menuBar : null}
      <WindowFrame
        title={t("apps.inbox.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="inbox"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex h-full min-h-0 flex-col bg-os-window-bg font-os-ui">
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {showSplit ? listSection : null}
            {isMdUp || mobilePane === "detail" ? detailSection : null}
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="inbox"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="inbox"
      />
    </>
  );
}

function itemsEmptyHint(tab: InboxTabFilter, t: (k: string) => string) {
  if (tab === "unread") return t("apps.inbox.toolbar.emptyFiltered");
  if (tab !== "all") return t("apps.inbox.toolbar.emptyFiltered");
  return t("apps.inbox.toolbar.emptyAll");
}
