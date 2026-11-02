export type JournalCopy = {
  "zh-TW": string;
  "zh-CN": string;
  en: string;
};

export interface JournalFragment {
  id: string;
  dayId: string;
  kind: "text" | "photo";
  text: JournalCopy | null;
  photo: string | null;
  x: number;
  y: number;
  w: number;
  rotate: number;
}

export interface JournalDay {
  id: string;
  mood: number;
}

export const JOURNAL_DAYS: readonly JournalDay[] = [
  { id: "2026-10-27", mood: 3 },
  { id: "2026-10-28", mood: 4 },
  { id: "2026-10-29", mood: 4 },
  { id: "2026-10-30", mood: 5 },
  { id: "2026-10-31", mood: 4 },
  { id: "2026-11-01", mood: 3 },
];

const copy = (zhTW: string, zhCN: string, en: string): JournalCopy => ({
  "zh-TW": zhTW,
  "zh-CN": zhCN,
  en,
});

export const JOURNAL_FRAGMENTS: readonly JournalFragment[] = [
  {
    id: "oct27-note",
    dayId: "2026-10-27",
    kind: "text",
    text: copy(
      "搬來台北以後，日程空了一塊。我沒有立刻把它填上。",
      "搬来台北以后，日程空了一块。我没有立刻把它填上。",
      "After moving to Taipei, a gap opened in the days. I did not fill it right away."
    ),
    photo: null,
    x: 6,
    y: 7,
    w: 34,
    rotate: -2,
  },
  {
    id: "oct28-photo",
    dayId: "2026-10-28",
    kind: "photo",
    text: null,
    photo: "/journal/alley.jpg",
    x: 5,
    y: 28,
    w: 30,
    rotate: -3,
  },
  {
    id: "oct28-note",
    dayId: "2026-10-28",
    kind: "text",
    text: copy(
      "走了一條沒走過的路。巷子底有光，沒有目的地。",
      "走了一条没走过的路。巷子底有光，没有目的地。",
      "I walked a street I had not walked before. There was light at the end of the alley, and no destination."
    ),
    photo: null,
    x: 8,
    y: 58,
    w: 32,
    rotate: 1,
  },
  {
    id: "oct29-note",
    dayId: "2026-10-29",
    kind: "text",
    text: copy(
      "同一首歌又聽了一遍。不是為了記住歌詞，只是想知道它還在。",
      "同一首歌又听了一遍。不是为了记住歌词，只是想知道它还在。",
      "I played the same song again. Not to memorize the lyrics. Just to find it still there."
    ),
    photo: null,
    x: 62,
    y: 6,
    w: 32,
    rotate: 2,
  },
  {
    id: "oct30-photo",
    dayId: "2026-10-30",
    kind: "photo",
    text: null,
    photo: "/journal/tea.jpg",
    x: 36,
    y: 16,
    w: 26,
    rotate: 2,
  },
  {
    id: "oct30-note",
    dayId: "2026-10-30",
    kind: "text",
    text: copy(
      "茶館。把一段話講完，沒有把它收成結論。",
      "茶馆。把一段话讲完，没有把它收成结论。",
      "The tea house. We finished a conversation and did not turn it into a conclusion."
    ),
    photo: null,
    x: 38,
    y: 44,
    w: 28,
    rotate: -1,
  },
  {
    id: "oct31-photo",
    dayId: "2026-10-31",
    kind: "photo",
    text: null,
    photo: "/journal/light.jpg",
    x: 64,
    y: 36,
    w: 28,
    rotate: -2,
  },
  {
    id: "oct31-note",
    dayId: "2026-10-31",
    kind: "text",
    text: copy(
      "下午的光在桌上停了很久。我沒有把它寫成產出。",
      "下午的光在桌上停了很久。我没有把它写成产出。",
      "The afternoon light stayed on the desk for a long time. I did not turn it into output."
    ),
    photo: null,
    x: 56,
    y: 68,
    w: 36,
    rotate: 1,
  },
  {
    id: "nov01-note",
    dayId: "2026-11-01",
    kind: "text",
    text: copy(
      "想留下的是這些碎片，不是一份作業。",
      "想留下的是这些碎片，不是一份作业。",
      "What I want to keep is these fragments, not another assignment."
    ),
    photo: null,
    x: 16,
    y: 76,
    w: 36,
    rotate: -1,
  },
];

export const TRIAL_FRAGMENT: JournalFragment = {
  id: "trial-photo",
  dayId: "2026-11-01",
  kind: "photo",
  text: null,
  photo: "/journal/trial.jpg",
  x: 46,
  y: 58,
  w: 24,
  rotate: 4,
};

export const DEFAULT_DAY_ID = JOURNAL_DAYS[JOURNAL_DAYS.length - 1].id;

export function journalLocale(language: string | undefined): keyof JournalCopy {
  const value = (language ?? "en").toLowerCase();
  if (
    value === "zh-tw" ||
    value.includes("hant") ||
    value.endsWith("-tw") ||
    value.endsWith("-hk") ||
    value.endsWith("-mo")
  ) {
    return "zh-TW";
  }
  if (value.startsWith("zh")) return "zh-CN";
  return "en";
}

export function journalText(
  text: JournalCopy,
  language: string | undefined
): string {
  return text[journalLocale(language)];
}

export function visibleFragments(trialPhoto: boolean): JournalFragment[] {
  return trialPhoto
    ? [...JOURNAL_FRAGMENTS, TRIAL_FRAGMENT]
    : [...JOURNAL_FRAGMENTS];
}

export function fragmentsForDay(
  dayId: string,
  trialPhoto: boolean
): JournalFragment[] {
  return visibleFragments(trialPhoto).filter((fragment) => fragment.dayId === dayId);
}

export function formatJournalDay(dayId: string, language: string | undefined): string {
  const locale = journalLocale(language);
  return new Intl.DateTimeFormat(locale === "en" ? "en" : locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dayId}T12:00:00Z`));
}
