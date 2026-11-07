import { useRef, useState, type ReactNode } from "react";
import { Smiley, SmileyBlank, SmileyMeh, SmileySad, SmileyWink } from "@phosphor-icons/react";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { PanelHeader } from "@/apps/contacts/components/contacts-app/PanelHeader";
import { cn } from "@/lib/utils";
import {
  clamp,
  entryDocId,
  fragmentsForJournalDay,
  journalPageIndex,
  journalDateUnderTitle,
  journalPageTitle,
  journalSidebarDays,
  JOURNAL_SIDEBAR_MAX_WIDTH,
  JOURNAL_SIDEBAR_MIN_WIDTH,
  moodForDay,
  todayDayId,
  undatedDocId,
} from "../logic";
import {
  formatJournalDay,
  JOURNAL_DAYS,
  sampleJournalTitle,
  type JournalFragment,
} from "../sampleContent";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { JournalCardMenu, type JournalCardMenuState } from "./JournalCardMenu";
import { JournalPageTitle } from "./JournalPageTitle";
import { JournalSidebarCalendar } from "./JournalSidebarCalendar";
import { JournalEntryEditor } from "./JournalEntryEditor";
import { JournalViewToolbar, useJournalViewChrome } from "./JournalViewToolbar";
import { JournalSongMark } from "./journalSong";

function PageCard({
  id,
  highlight,
  onSelect,
  onMenu,
  children,
}: {
  id: string;
  highlight: boolean;
  onSelect: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
  children: ReactNode;
}) {
  return (
    <div
      data-journal-page-card={id}
      className={cn(highlight && "rounded-[8px] ring-2 ring-[#9a7424] os-dark:ring-[#e6c36a]")}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.ctrlKey) return;
        onSelect(id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(id);
        onMenu(id, event.clientX, event.clientY);
      }}
    >
      {children}
    </div>
  );
}

const MOOD_FACES = [SmileySad, SmileyMeh, SmileyBlank, Smiley, SmileyWink] as const;

export function GeneratedView({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  return <DailyJournal l={l} isMobileLayout={isMobileLayout} />;
}

export function DailyJournal({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  const { t, language, journal, isMacOSTheme, isSystem7Theme, isWindowsTheme, sidebarWidth } = l;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const { open, hoverProps } = useJournalViewChrome();
  const [menu, setMenu] = useState<JournalCardMenuState | null>(null);
  const features = journal.toggles;
  const today = todayDayId();
  const sidebarDays = journalSidebarDays(journal);
  const pageIndex = journalPageIndex(journal, today);
  const showingUndated =
    journal.selectedUndatedId !== null &&
    journal.undatedPages.includes(journal.selectedUndatedId);
  const pageItems = [
    ...JOURNAL_DAYS.map((day) => ({ kind: "day" as const, id: day.id })),
    ...journal.undatedPages.map((id) => ({ kind: "page" as const, id })),
  ];
  const selectedDayId = journal.selectedDayId;
  const activeDayId = showingUndated ? null : selectedDayId;
  const pageId = showingUndated ? journal.selectedUndatedId! : activeDayId;
  const pageScraps = pageId ? journal.scraps.filter((scrap) => scrap.pageId === pageId) : [];
  const fragments = activeDayId ? fragmentsForJournalDay(journal, activeDayId) : [];
  const textFragments = fragments.filter((fragment) => fragment.kind === "text");
  const blankId = showingUndated
    ? undatedDocId(journal.selectedUndatedId!)
    : activeDayId
      ? entryDocId(activeDayId)
      : null;
  const blankIsCard = blankId ? pageScraps.some((scrap) => scrap.id === blankId) : false;
  const blankFragment: JournalFragment | null =
    blankIsCard
      ? null
      : showingUndated
        ? {
            id: undatedDocId(journal.selectedUndatedId!),
            dayId: "",
            kind: "text",
            text: null,
            photo: null,
            x: 0,
            y: 0,
            w: 40,
            rotate: 0,
          }
        : textFragments.length === 0 && activeDayId
          ? {
              id: entryDocId(activeDayId),
              dayId: activeDayId,
              kind: "text",
              text: null,
              photo: null,
              x: 0,
              y: 0,
              w: 40,
              rotate: 0,
            }
          : null;
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const moodKey = showingUndated ? journal.selectedUndatedId! : selectedDayId;
  const mood = moodForDay(journal, moodKey);
  const dateLabel =
    features.date && activeDayId ? formatJournalDay(activeDayId, language) : "";
  const defaultPageTitle =
    (pageId ? sampleJournalTitle(pageId, language) : "") ||
    dateLabel ||
    t("apps.journal.pageNumber", { count: pageIndex + 1 });
  const displayedTitle = journalPageTitle(journal, pageId ?? "", defaultPageTitle);
  const titleDate = journalDateUnderTitle(displayedTitle, dateLabel);

  return (
    <div className={cn("flex min-h-0 flex-1", isMobileLayout ? "flex-col" : "flex-row")}>
      <div
        className={cn(
          "relative flex min-h-0 shrink-0",
          isMobileLayout && "w-full",
          isMobileLayout && !features.date && "max-h-[150px]"
        )}
        style={isMobileLayout ? undefined : { width: sidebarWidth }}
      >
      <AppSidebarPanel
        bordered={isMacOSTheme}
        className="flex min-h-0 w-full flex-col"
        style={!isMacOSTheme ? { borderRight: "1px solid rgba(0,0,0,0.08)" } : undefined}
      >
        <PanelHeader
          title={features.date ? t("apps.journal.sidebar.days") : t("apps.journal.views.daily")}
          useGeneva={useGeneva}
          bordered={isMacOSTheme}
        />
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            isMobileLayout && features.date && "max-h-[150px]"
          )}
        >
          {features.date && !sidebarDays.includes(today) ? (
            <button
              type="button"
              onClick={() => l.api.startDay(today)}
              className="flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight text-os-link transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t("apps.journal.sidebar.newJournal")}
            </button>
          ) : null}
          {features.date
            ? sidebarDays.map((dayId) => {
                const active = !showingUndated && dayId === selectedDayId;
                return (
                  <button
                    key={dayId}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => l.api.selectDay(dayId)}
                    data-selected={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight",
                      !active && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                  >
                    <span className="truncate">
                      {journalPageTitle(
                        journal,
                        dayId,
                        sampleJournalTitle(dayId, language) || formatJournalDay(dayId, language)
                      )}
                    </span>
                  </button>
                );
              })
            : null}
          {features.date
            ? journal.undatedPages.map((id, index) => {
                const active = journal.selectedUndatedId === id;
                return (
                  <button
                    key={`page:${id}`}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => l.api.selectUndated(id)}
                    data-selected={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight",
                      !active && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                  >
                    <span className="truncate">
                      {t("apps.journal.pageNumber", {
                        count: sidebarDays.length + index + 1,
                      })}
                    </span>
                  </button>
                );
              })
            : pageItems.map((item, index) => {
                const active =
                  item.kind === "page"
                    ? item.id === journal.selectedUndatedId
                    : !showingUndated && item.id === selectedDayId;
                return (
                  <button
                    key={`${item.kind}:${item.id}`}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() =>
                      item.kind === "page" ? l.api.selectUndated(item.id) : l.api.selectDay(item.id)
                    }
                    data-selected={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight",
                      !active && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                  >
                    <span className="truncate">
                      {t("apps.journal.pageNumber", { count: index + 1 })}
                    </span>
                  </button>
                );
              })}
          {features.date ? null : (
            <button
              type="button"
              onClick={() => l.api.addUndatedPage()}
              className="flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight text-os-link transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t("apps.journal.sidebar.newPage")}
            </button>
          )}
        </div>
        {features.date ? (
          <div className="shrink-0 border-t border-black/10 os-dark:border-white/10">
            <JournalSidebarCalendar
              selectedDate={showingUndated ? "" : selectedDayId}
              today={today}
              language={language}
              isWindowsTheme={isWindowsTheme}
              isMacOSTheme={isMacOSTheme}
              isSystem7Theme={isSystem7Theme}
              onSelectDay={l.api.selectDay}
            />
          </div>
        ) : null}
      </AppSidebarPanel>
      {isMobileLayout ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("apps.journal.sidebar.days")}
          className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none"
          onPointerDown={(event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = sidebarWidthRef.current;
            const move = (pointerEvent: PointerEvent) => {
              l.api.setSidebarWidth(
                clamp(
                  startWidth + pointerEvent.clientX - startX,
                  JOURNAL_SIDEBAR_MIN_WIDTH,
                  JOURNAL_SIDEBAR_MAX_WIDTH
                )
              );
            };
            const stop = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", stop);
              window.removeEventListener("pointercancel", stop);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", stop);
            window.addEventListener("pointercancel", stop);
          }}
        />
      )}
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" {...hoverProps}>
      <article className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 pb-16">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <JournalPageTitle
              key={pageId ?? "page"}
              pageId={pageId ?? ""}
              defaultTitle={defaultPageTitle}
              title={displayedTitle}
              onSave={l.api.setPageTitle}
            />
            {features.mood ? (
              <div className="mt-2 flex items-center gap-2">
                {titleDate ? (
                  <span data-journal-title-date className="text-sm text-os-text-secondary">
                    {titleDate}
                  </span>
                ) : null}
                <div className="flex" role="group" aria-label={t("apps.journal.mood.label")}>
                  {MOOD_FACES.map((Face, index) => {
                    const score = index + 1;
                    const selected = mood === score;
                    return (
                      <button
                        key={score}
                        type="button"
                        aria-label={t("apps.journal.mood.set", { score })}
                        aria-pressed={selected}
                        onClick={() => l.api.setMood(moodKey, score)}
                        className={cn(
                          "p-0.5",
                          selected ? "text-os-link" : "text-os-text-secondary"
                        )}
                      >
                        <Face size={20} weight={selected ? "fill" : "regular"} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </header>
        <div className="mt-4 flex max-w-xl flex-col gap-3">
          {fragments.map((fragment) =>
            fragment.kind === "photo" && fragment.photo ? (
              <PageCard
                key={fragment.id}
                id={fragment.id}
                highlight={journal.selectedCardId === fragment.id}
                onSelect={l.api.selectCard}
                onMenu={(id, x, y) => setMenu({ id, x, y })}
              >
                <img
                  src={fragment.photo}
                  alt={t("apps.journal.photo.alt")}
                  draggable={false}
                  className="max-h-56 w-full rounded-[8px] object-cover"
                />
              </PageCard>
            ) : (
              <PageCard
                key={fragment.id}
                id={fragment.id}
                highlight={false}
                onSelect={l.api.selectCard}
                onMenu={(id, x, y) => setMenu({ id, x, y })}
              >
                <JournalEntryEditor
                  fragment={fragment}
                  saved={journal.texts[fragment.id]}
                  language={language}
                  onChange={l.api.setEntryText}
                  onSelect={l.api.selectCard}
                />
              </PageCard>
            )
          )}
          {blankFragment ? (
            <JournalEntryEditor
              key={blankFragment.id}
              fragment={blankFragment}
              saved={journal.texts[blankFragment.id]}
              language={language}
              onChange={l.api.setEntryText}
            />
          ) : null}
          {pageScraps.map((scrap) => (
            <PageCard
              key={scrap.id}
              id={scrap.id}
              highlight={scrap.kind !== "text" && journal.selectedCardId === scrap.id}
              onSelect={l.api.selectCard}
              onMenu={(id, x, y) => setMenu({ id, x, y })}
            >
              {scrap.kind === "photo" && scrap.photo ? (
                <img
                  src={scrap.photo}
                  alt={t("apps.journal.toolbar.photoAlt")}
                  draggable={false}
                  className="max-h-56 w-full overflow-hidden !rounded-[8px] object-cover"
                  style={{ borderRadius: 8 }}
                />
              ) : scrap.kind === "song" ? (
                <div
                  className="group/song flex w-full cursor-pointer items-center gap-2 rounded-[8px] border border-black/10 bg-[#fffdf8] p-2 text-left os-dark:border-white/10 os-dark:bg-[#3a342c]"
                  onClick={() => {
                    l.api.selectCard(scrap.id);
                  }}
                >
                  <JournalSongMark songId={scrap.songId} cover={scrap.songCover} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{scrap.songTitle}</span>
                    {scrap.songArtist ? (
                      <span className="block truncate text-xs text-os-text-secondary">{scrap.songArtist}</span>
                    ) : null}
                  </span>
                </div>
              ) : (
                <JournalEntryEditor
                  fragment={{
                    id: scrap.id,
                    dayId: scrap.pageId,
                    kind: "text",
                    text: null,
                    photo: null,
                    x: scrap.x,
                    y: scrap.y,
                    w: scrap.w,
                    rotate: scrap.rotate,
                  }}
                  saved={journal.texts[scrap.id]}
                  language={language}
                  onChange={l.api.setEntryText}
                  onSelect={l.api.selectCard}
                />
              )}
            </PageCard>
          ))}
        </div>
      </article>
      <JournalViewToolbar l={l} open={open} pages="none" />
      <JournalCardMenu menu={menu} onClose={() => setMenu(null)} l={l} />
      </div>
    </div>
  );
}
