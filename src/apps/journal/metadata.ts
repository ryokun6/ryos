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
      "Open on the journal a tool would hand you: a date, a mood score, a streak, a daily reminder, and a weekly report. Entries use the TextEdit editor.",
  },
  {
    icon: "🎚️",
    title: "Turn Features Off",
    description:
      "Each feature has its own switch in the demo drawer. The streak is the one to remove first if a day without writing should not feel like a debt.",
  },
  {
    icon: "🧰",
    title: "Demo Drawer",
    description:
      "Feature switches, the Two Structures preset, and Reset Demo live in the drawer beside the window.",
  },
  {
    icon: "↔️",
    title: "Two Structures",
    description:
      "Choose Two Structures in the demo drawer to see the same days as one page a day and as scraps on one page.",
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
