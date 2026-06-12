import { formatDateLabel as formatDateLabelShared } from "@/utils/formatDateLabel";

export function formatDateLabel(dateStr: string, locale: string): string {
  return formatDateLabelShared(dateStr, locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
