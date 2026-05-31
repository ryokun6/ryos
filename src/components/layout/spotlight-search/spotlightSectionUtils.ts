import type { SpotlightResult } from "@/hooks/useSpotlightSearch";

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
