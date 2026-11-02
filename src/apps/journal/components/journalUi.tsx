import { JOURNAL_FEATURES } from "../types";
import type { JournalLogic } from "../hooks/useJournalLogic";

export function keptChangeLabels(l: JournalLogic): string[] {
  const { t, journal } = l;
  const labels: string[] = [];
  for (const feature of JOURNAL_FEATURES) {
    if (!journal.toggles[feature]) {
      labels.push(t(`apps.journal.features.${feature}`));
    }
  }
  return labels;
}
