export { FITNESS_HELP_I18N_KEYS } from "./helpKeys";

export const appMetadata = {
  name: "Fitness",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/fitness.png",
};

export const helpItems = [
  {
    icon: "🏋️",
    title: "Exercise Guide",
    description:
      "Browse 800+ exercises with pictures, step-by-step instructions, target muscles, and equipment. Filter by muscle, equipment, or type.",
  },
  {
    icon: "📝",
    title: "Log Workouts",
    description:
      "Add exercises to a day and log sets, reps, and weight. Your last session is shown as a hint, and charts track your estimated one-rep max over time.",
  },
  {
    icon: "📅",
    title: "Weekly Schedule",
    description:
      "Plan each weekday's focus (upper, lower, push, pull, legs, core, cardio, full body, or rest) and get exercise recommendations for it. Start from a template.",
  },
  {
    icon: "📏",
    title: "Body & Goals",
    description:
      "Record weight, body fat, and measurements. Set a target weight and a weekly workout target, and watch your progress.",
  },
  {
    icon: "🍱",
    title: "Food Log",
    description:
      "Snap or upload a meal photo and AI estimates the items, calories, and macros. Review and edit before saving, or add food manually. Estimates may be inaccurate.",
  },
  {
    icon: "☁️",
    title: "Sync",
    description:
      "Workouts, body stats, food, schedule, and goals sync across devices when Cloud Sync is on. Units and the current view stay on this device.",
  },
];
