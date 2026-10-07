import type { ReactNode } from "react";
import {
  Cards,
  HandPointing,
  MagnifyingGlass,
  SidebarSimple,
  Star,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { osToolbarSurfaceClassName } from "@/components/shared/osThemePrimitives";
import { cn } from "@/lib/utils";
import {
  DICTIONARY_QUERY_LANGUAGES,
  type DictionaryQueryLanguage,
} from "@/shared/dictionary";
import type { DictionaryView } from "@/stores/useDictionaryStore";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";

function ToolbarButton({
  l,
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  l: DictionaryLogic;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  if (l.isMacOSTheme) {
    return (
      <button
        type="button"
        className="metal-inset-btn metal-inset-icon"
        data-state={active && !disabled ? "on" : "off"}
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-pressed={disabled ? undefined : active}
      >
        {children}
      </button>
    );
  }
  return (
    <Button
      type="button"
      variant={l.isSystem7Theme ? "player" : "ghost"}
      data-state={active && !disabled ? "on" : "off"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "size-6 px-0",
        l.isWindowsTheme && "text-black",
        disabled && "opacity-40",
        active && !disabled && !l.isSystem7Theme && "bg-black/10"
      )}
      title={label}
      aria-label={label}
      aria-pressed={disabled ? undefined : active}
    >
      {children}
    </Button>
  );
}

function ButtonGroup({ l, children }: { l: DictionaryLogic; children: ReactNode }) {
  return (
    <div className={l.isMacOSTheme ? "metal-inset-btn-group" : "flex items-center gap-0"}>
      {children}
    </div>
  );
}

const ALL_DECKS_VALUE = "__all__";

function DeckPicker({ l, isMobileLayout }: { l: DictionaryLogic; isMobileLayout: boolean }) {
  const { t, isMacOSTheme, isSystem7Theme } = l;
  const label = t("apps.dictionary.decks.picker");
  const leafLabel = (name: string) => name.split("::").pop() ?? name;
  return (
    <Select
      value={l.selectedDeckId ?? ALL_DECKS_VALUE}
      onValueChange={(value) => l.setSelectedDeckId(value === ALL_DECKS_VALUE ? null : value)}
    >
      <SelectTrigger
        className={cn(
          "h-6 min-w-0 text-[11px]",
          isMobileLayout ? "w-[132px] shrink" : "w-[180px] shrink",
          (isMacOSTheme || isSystem7Theme) && "font-geneva-12"
        )}
        aria-label={label}
        title={l.selectedDeck ? l.deckLabel(l.selectedDeck) : label}
      >
        <SelectValue>
          <span className="truncate">{leafLabel(l.deckLabel(l.selectedDeck))}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[320px] max-w-[min(420px,90vw)]">
        <SelectItem value={ALL_DECKS_VALUE} className="text-[12px]">
          {t("apps.dictionary.decks.all")}
        </SelectItem>
        {l.decks.map((deck) => {
          const name = l.deckLabel(deck);
          const parents = name.split("::").slice(0, -1);
          return (
            <SelectItem
              key={deck.id}
              value={deck.id}
              className="text-[12px]"
              title={name.replaceAll("::", " › ")}
            >
              <span className="block truncate">
                {parents.length ? (
                  <span className="opacity-45">{parents.join(" › ")} › </span>
                ) : null}
                {leafLabel(name)}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function DictionaryToolbar({
  l,
  isMobileLayout,
}: {
  l: DictionaryLogic;
  isMobileLayout: boolean;
}) {
  const { t, isMacOSTheme, isSystem7Theme, isWindowsTheme, view } = l;
  const viewButtons: { id: DictionaryView; label: string; icon: ReactNode }[] = [
    {
      id: "lookup",
      label: t("apps.dictionary.views.lookup"),
      icon: <MagnifyingGlass size={14} />,
    },
    {
      id: "favorites",
      label: t("apps.dictionary.views.favorites"),
      icon: <Star size={14} />,
    },
    {
      id: "flashcards",
      label: t("apps.dictionary.views.flashcards"),
      icon: <Cards size={14} />,
    },
  ];
  const languageLabel = (lang: DictionaryQueryLanguage) =>
    t(`apps.dictionary.languages.${lang}`);

  const searchInput = (
    <SearchInput
      value={l.query}
      onChange={l.setQuery}
      inputRef={l.searchInputRef}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          l.submitQuery();
        }
      }}
      ariaBusy={l.status === "loading"}
      placeholder={t("apps.dictionary.searchPlaceholder")}
      ariaLabel={t("apps.dictionary.searchPlaceholder")}
      title={t("apps.dictionary.searchPlaceholder")}
      clearAriaLabel={t("spotlight.ariaLabels.clearSearch")}
      className={cn(isMobileLayout ? "w-full min-w-0 max-w-none" : "w-[190px]")}
      inputClassName="h-[26px]"
    />
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 py-1.5",
        isMacOSTheme ? "px-1" : "px-2",
        osToolbarSurfaceClassName({ isMacOSTheme, isSystem7Theme, isWindowsTheme })
      )}
    >
      <div className="flex h-[26px] min-w-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5">
          {!isMobileLayout ? (
            <ButtonGroup l={l}>
              <ToolbarButton
                l={l}
                disabled={view === "flashcards"}
                active={view !== "flashcards" && l.isSidebarVisible}
                onClick={() => l.setSidebarVisible(!l.isSidebarVisible)}
                label={t("apps.dictionary.menu.showSidebar")}
              >
                <SidebarSimple size={14} />
              </ToolbarButton>
            </ButtonGroup>
          ) : null}
          <ButtonGroup l={l}>
            {viewButtons.map((button) => (
              <ToolbarButton
                key={button.id}
                l={l}
                active={view === button.id}
                onClick={() => l.setView(button.id)}
                label={button.label}
              >
                {button.icon}
              </ToolbarButton>
            ))}
          </ButtonGroup>
        </div>
        <div className="min-w-0 flex-1" />
        {view !== "lookup" ? <DeckPicker l={l} isMobileLayout={isMobileLayout} /> : null}
        {view === "lookup" ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Select
              value={l.queryLanguage}
              onValueChange={(value) => l.setQueryLanguage(value as DictionaryQueryLanguage)}
            >
              <SelectTrigger
                className={cn(
                  "h-6 min-w-0 text-[11px]",
                  isMobileLayout ? "w-[84px] shrink" : "w-[92px] shrink-0",
                  (isMacOSTheme || isSystem7Theme) && "font-geneva-12"
                )}
                aria-label={t("apps.dictionary.language")}
                title={t("apps.dictionary.language")}
              >
                <SelectValue>{languageLabel(l.queryLanguage)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DICTIONARY_QUERY_LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang} className="text-[12px]">
                    {languageLabel(lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="shrink-0">
              <ButtonGroup l={l}>
                <ToolbarButton
                  l={l}
                  active={l.isHandwritingOpen}
                  onClick={() => l.setHandwritingOpen(!l.isHandwritingOpen)}
                  label={t("apps.dictionary.menu.handwriting")}
                >
                  <HandPointing size={14} />
                </ToolbarButton>
              </ButtonGroup>
            </div>
            {isMobileLayout ? null : searchInput}
          </div>
        ) : null}
      </div>
      {isMobileLayout && view === "lookup" ? searchInput : null}
    </div>
  );
}
