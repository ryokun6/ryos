import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { cn } from "@/lib/utils";
import { resolveFavoriteDeckId } from "@/stores/useDictionaryStore";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";

export function DictionaryDeckDialogs({ l }: { l: DictionaryLogic }) {
  const { t, deckDialog, selectedDeck } = l;
  const close = (open: boolean) => {
    if (!open) l.setDeckDialog(null);
  };
  const deckName = selectedDeck ? l.deckLabel(selectedDeck) : "";
  const deckIds = new Set(l.decks.map((deck) => deck.id));
  const cardCount = selectedDeck
    ? l.favorites.filter((fav) => resolveFavoriteDeckId(fav, deckIds) === selectedDeck.id).length
    : 0;

  return (
    <>
      <InputDialog
        isOpen={deckDialog === "new" || deckDialog === "rename"}
        onOpenChange={close}
        onSubmit={l.submitDeckDialog}
        title={
          deckDialog === "rename"
            ? t("apps.dictionary.decks.renameTitle")
            : t("apps.dictionary.decks.newTitle")
        }
        description={
          deckDialog === "rename"
            ? t("apps.dictionary.decks.renameDescription", { name: deckName })
            : t("apps.dictionary.decks.newDescription")
        }
        value={l.deckNameDraft}
        onChange={l.setDeckNameDraft}
        submitLabel={
          deckDialog === "rename"
            ? t("apps.dictionary.decks.renameSubmit")
            : t("apps.dictionary.decks.newSubmit")
        }
      />
      <ConfirmDialog
        isOpen={deckDialog === "delete"}
        onOpenChange={close}
        onConfirm={l.submitDeckDialog}
        title={t("apps.dictionary.decks.deleteTitle")}
        description={t("apps.dictionary.decks.deleteDescription", {
          name: deckName,
          count: cardCount,
        })}
      />
    </>
  );
}

export function DictionaryAnkiProgress({ l }: { l: DictionaryLogic }) {
  const { t, ankiProgress } = l;
  if (!ankiProgress) return null;
  const { phase, done, total } = ankiProgress;
  const label =
    phase === "media"
      ? t("apps.dictionary.decks.importProgressMedia", { done, total })
      : phase === "cards"
        ? t("apps.dictionary.decks.importProgressCards", { done, total })
        : t("apps.dictionary.decks.importProgressReading");
  const percent = phase === "reading" || total === 0 ? null : Math.round((done / total) * 100);
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/10 dark:bg-black/30"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "w-[260px] rounded-lg border px-4 py-3 text-center text-[12px] shadow-lg",
          "border-black/15 bg-os-input-bg text-os-text-primary dark:border-white/15 dark:bg-neutral-800"
        )}
      >
        <p className="font-semibold">{t("apps.dictionary.decks.importing")}</p>
        <p className="mt-1 opacity-70">{label}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className={cn(
              "h-full rounded-full bg-blue-500 transition-[width]",
              percent === null && "w-1/3 animate-pulse"
            )}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
