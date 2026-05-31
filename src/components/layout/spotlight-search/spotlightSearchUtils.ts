import type { SpotlightResult } from "@/hooks/useSpotlightSearch";

export const SECTION_TYPE_ORDER: SpotlightResult["type"][] = [
  "app",
  "document",
  "applet",
  "calendar",
  "contact",
  "music",
  "site",
  "video",
  "setting",
  "command",
  "ai",
];

export function getSectionKey(type: SpotlightResult["type"]): string {
  const map: Record<SpotlightResult["type"], string> = {
    app: "spotlight.sections.apps",
    document: "spotlight.sections.documents",
    applet: "spotlight.sections.applets",
    calendar: "spotlight.sections.calendar",
    contact: "spotlight.sections.contacts",
    music: "spotlight.sections.music",
    site: "spotlight.sections.sites",
    video: "spotlight.sections.videos",
    setting: "spotlight.sections.settings",
    command: "spotlight.sections.commands",
    ai: "spotlight.askRyo",
  };
  return map[type];
}

export function getSpotlightPrefetchAppId(
  result: SpotlightResult | undefined
): string | null {
  if (!result) return null;
  switch (result.type) {
    case "app":
      return result.id.startsWith("app-") ? result.id.slice(4) : null;
    case "document":
      return "textedit";
    case "applet":
      return "applet-viewer";
    case "music":
      return "ipod";
    case "site":
      return "internet-explorer";
    case "video":
      return "videos";
    case "calendar":
      return "calendar";
    case "contact":
      return "contacts";
    case "setting":
      return "control-panels";
    case "command":
      return "terminal";
    case "ai":
      return "chats";
    default:
      return null;
  }
}

export type GroupedSpotlightResult = SpotlightResult & { globalIndex: number };

export type SpotlightResultGroup = {
  type: SpotlightResult["type"];
  items: GroupedSpotlightResult[];
};

export function buildGroupedResults(
  results: SpotlightResult[]
): SpotlightResultGroup[] {
  const groups: SpotlightResultGroup[] = [];

  for (const type of SECTION_TYPE_ORDER) {
    const items = results.reduce<GroupedSpotlightResult[]>((acc, result) => {
      if (result.type === type) {
        acc.push({ ...result, globalIndex: 0 });
      }
      return acc;
    }, []);
    if (items.length > 0) {
      groups.push({ type, items });
    }
  }
  let idx = 0;
  for (const group of groups) {
    for (const item of group.items) {
      item.globalIndex = idx++;
    }
  }
  return groups;
}
