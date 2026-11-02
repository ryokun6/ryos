import { useEffect, useRef } from "react";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { useSound, Sounds } from "@/hooks/useSound";
import { cn } from "@/lib/utils";
import { allFeaturesOn } from "../logic";
import { JOURNAL_FEATURES, JOURNAL_PRESETS } from "../types";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { keptChangeLabels } from "./journalUi";

const NOTICE_KEYS = {
  restored: "apps.journal.notice.restored",
} as const;

export function JournalDrawer({
  l,
  isOpen,
  onClose,
}: {
  l: JournalLogic;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, journal, notice } = l;
  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isOpen) void playDrawerOpen();
    else void playDrawerClose();
  }, [isOpen, playDrawerOpen, playDrawerClose]);

  const changes = keptChangeLabels(l);
  const joiner = l.language.startsWith("zh") ? "、" : ", ";
  const presetSelected = {
    journal: journal.view === "daily" && allFeaturesOn(journal.toggles),
    freeform: journal.view === "freeform",
    compare: journal.view === "compare",
  };

  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t("apps.journal.drawer.title")}
      data-journal-drawer=""
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <p className="px-2.5 pb-1 pt-2 text-[11px] uppercase tracking-wide opacity-50">
          {t("apps.journal.drawer.presets")}
        </p>
        {JOURNAL_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => l.api.applyPreset(preset)}
            data-selected={presetSelected[preset] ? "true" : undefined}
            className={cn(
              "flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight",
              !presetSelected[preset] && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            )}
          >
            {t(`apps.journal.presets.${preset}`)}
          </button>
        ))}

        <p className="px-2.5 pb-1 pt-3 text-[11px] uppercase tracking-wide opacity-50">
          {t("apps.journal.generated.question")}
        </p>
        {JOURNAL_FEATURES.map((feature) => {
          const on = journal.toggles[feature];
          return (
            <button
              key={feature}
              type="button"
              aria-pressed={on}
              onClick={() => l.api.toggleFeature(feature)}
              className="flex w-full items-center gap-2 px-2.5 py-1 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-tight">
                  {t(`apps.journal.features.${feature}`)}
                </span>
                {feature === "streak" ? (
                  <span className="block truncate text-[11px] leading-tight text-os-link">
                    {t("apps.journal.generated.ryoPick")}
                  </span>
                ) : (
                  <span className="block truncate text-[11px] leading-tight opacity-60">
                    {t(`apps.journal.features.${feature}Hint`)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] opacity-70">
                {on ? t("apps.journal.features.on") : t("apps.journal.features.off")}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => l.api.resetDemo()}
          className="mt-2 flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          {t("apps.journal.toolbar.reset")}
        </button>
        <p className="px-2.5 pb-2 text-[11px] leading-snug opacity-60">
          {changes.length === 0
            ? t("apps.journal.status.complete")
            : `${t("apps.journal.status.kept")} ${changes.join(joiner)}`}
          {notice ? ` ${t(NOTICE_KEYS[notice])}` : ""}
        </p>
      </div>
    </AppDrawer>
  );
}
