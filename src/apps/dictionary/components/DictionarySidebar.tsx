import { Sparkle } from "@phosphor-icons/react";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { PanelHeader } from "@/apps/contacts/components/contacts-app/PanelHeader";
import { cn } from "@/lib/utils";
import type { DictionaryEntry } from "@/shared/dictionary";
import type { DictionaryChineseScript } from "@/stores/useDictionaryStore";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import {
  displayChineseHeadword,
  formatChineseReading,
} from "../utils/phonetics";
import { isCardDue, isNewCard } from "../utils/srs";

export function entryListLabel(
  entry: DictionaryEntry,
  chineseScript: DictionaryChineseScript
): { headword: string; reading: string | null; gloss: string } {
  const headword =
    entry.lang === "zh" ? displayChineseHeadword(entry, chineseScript) : entry.headword;
  let reading: string | null = null;
  if (entry.lang === "zh" && entry.reading) {
    reading = formatChineseReading(entry.reading, "pinyin");
  } else if (entry.lang === "ja" && entry.reading && entry.reading !== entry.headword) {
    reading = entry.reading;
  } else if (entry.lang === "ko" && entry.hanja) {
    reading = entry.hanja;
  } else if (entry.lang === "en" && entry.ipa) {
    reading = entry.ipa;
  }
  return {
    headword,
    reading,
    gloss: entry.senses[0]?.glosses.slice(0, 2).join("; ") ?? "",
  };
}

function ListRow({
  isSelected,
  onClick,
  headword,
  reading,
  gloss,
  lang,
  trailing,
}: {
  isSelected: boolean;
  onClick: () => void;
  headword: string;
  reading?: string | null;
  gloss?: string;
  lang?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={isSelected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1 text-left",
        !isSelected && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] leading-tight" lang={lang}>
            {headword}
          </span>
          {reading ? (
            <span className="truncate text-[10px] leading-tight opacity-55">{reading}</span>
          ) : null}
        </div>
        {gloss ? (
          <div className="truncate text-[11px] leading-tight opacity-60">{gloss}</div>
        ) : null}
      </div>
      {trailing}
    </button>
  );
}

export function DictionarySidebar({
  l,
  className,
  isMobileLayout = false,
  selectedFavoriteId,
  onSelectFavorite,
}: {
  l: DictionaryLogic;
  className?: string;
  isMobileLayout?: boolean;
  selectedFavoriteId: string | null;
  onSelectFavorite: (id: string) => void;
}) {
  const { t, isMacOSTheme, isSystem7Theme, view, chineseScript } = l;
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const now = Date.now();
  const listClassName = cn(
    "min-h-0 overflow-y-auto",
    !isMobileLayout && "flex-1",
    !isMobileLayout && view === "lookup" && l.isHandwritingOpen && "pb-56"
  );

  return (
    <AppSidebarPanel
      bordered={isMacOSTheme}
      className={cn("flex min-h-0 flex-col", className)}
      style={!isMacOSTheme ? { borderRight: "1px solid rgba(0,0,0,0.08)" } : undefined}
    >
      {view === "favorites" ? (
        <>
          <PanelHeader
            title={t("apps.dictionary.views.favorites")}
            useGeneva={useGeneva}
            bordered={isMacOSTheme}
          />
          <div className={listClassName}>
            {l.favorites.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] opacity-50">
                {t("apps.dictionary.empty.noFavorites")}
              </p>
            ) : (
              l.favorites.map((fav) => {
                const label = entryListLabel(fav.entry, chineseScript);
                const due = isNewCard(fav.srs) || isCardDue(fav.srs, now);
                return (
                  <ListRow
                    key={fav.id}
                    isSelected={selectedFavoriteId === fav.id}
                    onClick={() => onSelectFavorite(fav.id)}
                    lang={fav.lang}
                    {...label}
                    trailing={
                      due ? (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-blue-500"
                          title={t("apps.dictionary.flashcards.due")}
                        />
                      ) : null
                    }
                  />
                );
              })
            )}
          </div>
        </>
      ) : (
        <>
          {l.entries.length > 0 ? (
            <>
              <PanelHeader
                title={t("apps.dictionary.sidebar.results")}
                useGeneva={useGeneva}
                bordered={isMacOSTheme}
              />
              <div className={listClassName}>
                {l.entries.map((entry) => (
                  <ListRow
                    key={entry.id}
                    isSelected={l.selectedEntry?.id === entry.id}
                    onClick={() => l.setSelectedEntryId(entry.id)}
                    lang={entry.lang}
                    {...entryListLabel(entry, chineseScript)}
                    trailing={
                      entry.source === "ai" ? (
                        <Sparkle size={11} weight="fill" className="shrink-0 text-amber-500" />
                      ) : null
                    }
                  />
                ))}
              </div>
            </>
          ) : null}
          {l.isStartState ? (
            <>
              <PanelHeader
                title={t("apps.dictionary.sidebar.recent")}
                useGeneva={useGeneva}
                bordered={isMacOSTheme}
              />
              <div className={listClassName}>
                {l.history.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[11px] opacity-50">
                    {t("apps.dictionary.empty.noHistory")}
                  </p>
                ) : (
                  l.history.map((item) => (
                    <ListRow
                      key={`${item.lang}:${item.query}`}
                      isSelected={false}
                      onClick={() => l.searchFor(item.query, item.lang)}
                      headword={item.query}
                      lang={item.lang === "auto" ? undefined : item.lang}
                    />
                  ))
                )}
              </div>
            </>
          ) : null}
        </>
      )}
    </AppSidebarPanel>
  );
}
