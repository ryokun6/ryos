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
      "Open on the journal a tool would hand you: a date, a mood score, and a daily reminder. Entries use the TextEdit editor.",
  },
  {
    icon: "🎚️",
    title: "Turn Features Off",
    description:
      "The daily reminder and its time are set in Settings.",
  },
  {
    icon: "🧰",
    title: "Settings",
    description:
      "The daily reminder switch and time live in Settings beside the window.",
  },
  {
    icon: "↔️",
    title: "Two Structures",
    description:
      "Journal opens on two structures: the same days as one page a day, and as scraps on one page. Combined stays in the toolbar.",
  },
  {
    icon: "🖼️",
    title: "Photos",
    description:
      "Sample photos are already in the entries. They show on that day's page and among the scraps.",
  },
  {
    icon: "↺",
    title: "Reset the Demo",
    description:
      "Reset Demo puts the sample journal and the switches back to the start. Edited entries return to the sample too.",
  },
];
