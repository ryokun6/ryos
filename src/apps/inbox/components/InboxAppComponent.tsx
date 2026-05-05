import {
  useCallback,
  useEffect,
  useState,
} from "react";
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
import { ArrowLeft, EnvelopeSimple, Trash } from "@phosphor-icons/react";

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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function formatInboxTimestamp(
  ts: number,
  now: number,
  tRel: (key: string, opts?: { count?: number }) => string,
  tAbs: (ts: number) => string
): string {
  const diff = now - ts;
  if (diff < 60_000) return tRel("apps.inbox.time.justNow");
  if (diff < 3_600_000)
    return tRel("apps.inbox.time.minutesAgo", { count: Math.max(1, Math.floor(diff / 60_000)) });
  if (diff < 86_400_000)
    return tRel("apps.inbox.time.hoursAgo", { count: Math.max(1, Math.floor(diff / 3_600_000)) });

  const d = new Date(ts);
  const yesterday = new Date(now - 86_400_000);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return tRel("apps.inbox.time.yesterday");
  }

  const dayDiff = Math.floor(diff / 86_400_000);
  if (dayDiff < 7) return tRel("apps.inbox.time.daysAgo", { count: dayDiff });

  return tAbs(ts);
}

function buildCopyText(item: InboxItem): string {
  const lines = [item.title, item.preview];
  if (item.body) lines.push("", item.body);
  if (item.action?.kind === "open_url" && item.action.url)
    lines.push("", item.action.url);
  return lines.join("\n");
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
  const [copyDone, setCopyDone] = useState(false);

  const {
    translatedHelpItems,
    isXpTheme,
    tab,
    setTab,
    items,
    filteredItems,
    totalUnread,
    filteredUnreadCount,
    selectedId,
    setSelectedId,
    selectedItem,
    markRead,
    markUnread,
    markAllReadFiltered,
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

  const formatAbsolute = useCallback(
    (ts: number) => {
      try {
        return new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(ts);
      } catch {
        return new Date(ts).toLocaleString();
      }
    },
    [locale]
  );

  const relTime = useCallback(
    (ts: number) => {
      const now = Date.now();
      return formatInboxTimestamp(ts, now, t, formatAbsolute);
    },
    [formatAbsolute, locale, t]
  );

  const handleSelect = useCallback(
    (item: InboxItem) => {
      setSelectedId(item.id);
      markRead(item.id);
      if (!isMdUp) setMobilePane("detail");
    },
    [markRead, setSelectedId, isMdUp]
  );

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

  const moveSelection = useCallback(
    (delta: number) => {
      if (filteredItems.length === 0) return;
      const idx = selectedId
        ? filteredItems.findIndex((i) => i.id === selectedId)
        : -1;
      const start = idx >= 0 ? idx : 0;
      const next = Math.min(
        filteredItems.length - 1,
        Math.max(0, start + delta)
      );
      const item = filteredItems[next];
      setSelectedId(item.id);
      markRead(item.id);
    },
    [filteredItems, markRead, selectedId, setSelectedId]
  );

  const copySelection = useCallback(async () => {
    if (!selectedItem) return;
    const text = buildCopyText(selectedItem);
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setCopyDone(false);
    }
  }, [selectedItem]);

  useEffect(() => {
    if (!isWindowOpen || !isForeground) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      if (!e.key) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
        return;
      }
      if (e.key === "Enter") {
        if (!selectedItem) return;
        e.preventDefault();
        if (selectedItem.action) handlePrimaryAction();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        if (!selectedItem) return;
        e.preventDefault();
        markRead(selectedItem.id);
        return;
      }
      if (e.key === "u" || e.key === "U") {
        if (!selectedItem) return;
        e.preventDefault();
        markUnread(selectedItem.id);
        return;
      }
      if (e.key === "c" || e.key === "C") {
        if (!selectedItem) return;
        e.preventDefault();
        void copySelection();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (!selectedItem) return;
        e.preventDefault();
        const id = selectedItem.id;
        removeItem(id);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    copySelection,
    handlePrimaryAction,
    isForeground,
    isWindowOpen,
    markRead,
    markUnread,
    moveSelection,
    removeItem,
    selectedItem,
  ]);

  const emptyState = (opts: { title: string; hint?: string }) => (
    <li className="px-4 py-10">
      <div className="mx-auto flex max-w-[240px] flex-col items-center text-center">
        <EnvelopeSimple
          className="mb-3 h-10 w-10 text-black/25 dark:text-white/22"
          weight="duotone"
          aria-hidden
        />
        <p className="text-[12px] font-medium leading-snug text-black/65 dark:text-white/60">
          {opts.title}
        </p>
        {opts.hint ? (
          <p className="mt-2 text-[11px] leading-relaxed text-black/45 dark:text-white/40">
            {opts.hint}
          </p>
        ) : null}
      </div>
    </li>
  );

  const listSection = (
    <div className="flex min-h-0 flex-1 flex-col border-black/15 md:max-w-[min(100%,380px)] md:border-r md:border-os-window">
      <div className="shrink-0 border-b border-black/15 px-2 py-2">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
          <p className="truncate text-[10px] text-black/40 dark:text-white/35">
            {t("apps.inbox.toolbar.summaryCount", {
              total: items.length,
              unread: totalUnread,
            })}
          </p>
        </div>
        <div
          className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto"
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
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y divide-black/10 py-1">
          {filteredItems.length === 0 ? (
            tab === "unread"
              ? emptyState({
                  title: t("apps.inbox.toolbar.emptyUnread"),
                  hint: t("apps.inbox.toolbar.emptyUnreadHint"),
                })
              : tab === "all"
                ? emptyState({
                    title: t("apps.inbox.toolbar.emptyAll"),
                  })
                : emptyState({
                    title: t("apps.inbox.toolbar.emptyFiltered"),
                    hint: t("apps.inbox.toolbar.emptyFilteredHint"),
                  })
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
                      unread &&
                        !active &&
                        "bg-blue-500/[0.06] dark:bg-blue-400/[0.08]"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          unread
                            ? "bg-blue-600 dark:bg-blue-400"
                            : "bg-black/15 dark:bg-white/20"
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "truncate text-[12px] leading-tight",
                            unread
                              ? "font-semibold"
                              : "font-medium opacity-90"
                          )}
                        >
                          {item.title}
                        </div>
                        <div className="line-clamp-2 text-[11px] leading-snug text-black/55 dark:text-white/50">
                          {item.preview}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-black/40 dark:text-white/35">
                          <span className="min-w-0 truncate">
                            {tabLabel(item.category)}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {relTime(item.updatedAt)}
                          </span>
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

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-black/15 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 text-[11px]"
            disabled={filteredUnreadCount === 0}
            onClick={markAllReadFiltered}
          >
            {t("apps.inbox.toolbar.markAllReadInView")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
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
            onClick={() =>
              runToolbarCommand(() => markUnread(selectedItem!.id))
            }
          >
            {t("apps.inbox.menu.markUnread")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={!selectedItem}
            onClick={() =>
              runToolbarCommand(() => removeItem(selectedItem!.id))
            }
            aria-label={t("apps.inbox.menu.deleteItem")}
          >
            <Trash className="h-3.5 w-3.5" weight="bold" />
          </Button>
        </div>
        <p className="px-0.5 text-[9px] leading-tight text-black/35 dark:text-white/28">
          {t("apps.inbox.toolbar.keyboardHints")}
        </p>
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
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <EnvelopeSimple
                className="mb-2 h-9 w-9 text-black/25 dark:text-white/22"
                weight="duotone"
                aria-hidden
              />
              <p className="text-[12px] text-black/55 dark:text-white/48">
                {t("apps.inbox.toolbar.detailEmptyFiltered")}
              </p>
            </div>
          ) : !selectedItem ? (
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
                    {relTime(selectedItem.updatedAt)}
                    <span className="text-black/35 dark:text-white/30">
                      {" "}
                      ({formatAbsolute(selectedItem.updatedAt)})
                    </span>
                  </p>
                  {selectedItem.source?.producer ? (
                    <p className="mt-0.5 text-[10px] text-black/40 dark:text-white/35">
                      {t("apps.inbox.toolbar.producer")}:{" "}
                      {selectedItem.source.producer}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => toggleRead(selectedItem.id)}
                  >
                    {selectedItem.readAt
                      ? t("apps.inbox.menu.markUnread")
                      : t("apps.inbox.menu.markRead")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => void copySelection()}
                  >
                    {copyDone
                      ? t("apps.inbox.toolbar.copied")
                      : t("apps.inbox.toolbar.copySummary")}
                  </Button>
                </div>
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
      onMarkAllReadInView={markAllReadFiltered}
      markAllReadDisabled={filteredUnreadCount === 0}
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
