export { JOURNAL_HELP_I18N_KEYS } from "./helpKeys";

export const appMetadata = {
  name: "Journal",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/journal.png",
};

export const helpItems = [
  {
    icon: "📓",
    title: "Complete Answer",
    description:
      "Open on the journal a tool would hand you: a date, a mood score, a streak, a daily reminder, and a weekly report.",
  },
  {
    icon: "🎚️",
    title: "Turn Features Off",
    description:
      "Each feature has its own switch. The streak is the one to remove first if a day without writing should not feel like a debt.",
  },
  {
    icon: "🛠️",
    title: "Workbench",
    description:
      "The same request shows a plan you can keep or apply one edit at a time, with a before and after, a trial photo, and undo. It is a local illustration. Nothing is generated live.",
  },
  {
    icon: "↔️",
    title: "Two Structures",
    description:
      "The same sample days can be one page per day, or scraps scattered on a page. Both stay available.",
  },
  {
    icon: "🖼️",
    title: "Photos",
    description:
      "Sample photos are already in the entries. Add one more to see how a picture sits in the layout, then undo it.",
  },
  {
    icon: "↺",
    title: "Reset the Demo",
    description:
      "Reset Demo puts the sample journal, the switches, and the plan back to the start.",
  },
];
