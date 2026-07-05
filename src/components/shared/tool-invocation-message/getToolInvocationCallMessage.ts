import type { TFunction } from "i18next";
import { getSongLibraryCallSummary } from "@/lib/toolInvocationDisplay";
import type { ToolInvocationPart } from "./types";

export function getToolInvocationCallMessage(
  params: {
    toolName: string;
    state: ToolInvocationPart["state"];
    input?: ToolInvocationPart["input"];
    output?: unknown;
    t: TFunction;
    getAppName: (id?: string) => string;
    formatToolName: (name: string) => string;
  }
): string | null {
  const { toolName, state, input, output, t, getAppName, formatToolName } = params;
  if (!(state === "input-streaming" || (state === "input-available" && !output))) {
    return null;
  }

  let displayCallMessage: string | null = null;
    switch (toolName) {
      // Unified VFS tools
      case "list": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path === "/Music") {
          displayCallMessage = t("apps.chats.toolCalls.loadingMusicLibrary");
        } else if (path === "/Applets Store") {
          displayCallMessage = t("apps.chats.toolCalls.listingSharedApplets");
        } else if (path === "/Applications") {
          displayCallMessage = t("apps.chats.toolCalls.listingApplications");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.findingFiles");
        }
        break;
      }
      case "open": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path.startsWith("/Music/")) {
          displayCallMessage = t("apps.chats.toolCalls.playingSong");
        } else if (path.startsWith("/Applets Store/")) {
          displayCallMessage = t("apps.chats.toolCalls.openingAppletPreview");
        } else if (path.startsWith("/Applications/")) {
          displayCallMessage = t("apps.chats.toolCalls.launchingApp");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.openingFile");
        }
        break;
      }
      case "read": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path.startsWith("/Applets Store/")) {
          displayCallMessage = t("apps.chats.toolCalls.fetchingApplet");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.readingFile");
        }
        break;
      }
      case "write":
        displayCallMessage = t("apps.chats.toolCalls.writingContent");
        break;
      case "edit":
        displayCallMessage = t("apps.chats.toolCalls.editingFile");
        break;
      case "launchApp":
        displayCallMessage = t("apps.chats.toolCalls.launching", { appName: getAppName(input?.id) });
        break;
      case "closeApp":
        displayCallMessage = t("apps.chats.toolCalls.closing", { appName: getAppName(input?.id) });
        break;
      case "mediaControl": {
        const action = input?.action || "toggle";
        if (action === "next") {
          displayCallMessage = t("apps.chats.toolCalls.skippingToNext");
        } else if (action === "previous") {
          displayCallMessage = t("apps.chats.toolCalls.skippingToPrevious");
        } else if (action === "addAndPlay") {
          displayCallMessage = t("apps.chats.toolCalls.addingSong");
        } else if (action === "playKnown") {
          displayCallMessage = t("apps.chats.toolCalls.playingSong");
        } else if (action === "list") {
          displayCallMessage = t("apps.chats.toolCalls.tv.listing", {
            defaultValue: "Listing TV channels…",
          });
        } else if (action === "tune") {
          displayCallMessage = t("apps.chats.toolCalls.tv.tuning", {
            defaultValue: "Changing channel…",
          });
        } else if (action === "createChannel") {
          displayCallMessage = t("apps.chats.toolCalls.tv.creating", {
            defaultValue: "Creating channel…",
          });
        } else if (action === "deleteChannel") {
          displayCallMessage = t("apps.chats.toolCalls.tv.deleting", {
            defaultValue: "Deleting channel…",
          });
        } else if (action === "addVideo") {
          displayCallMessage = t("apps.chats.toolCalls.tv.addingVideo", {
            defaultValue: "Adding video to channel…",
          });
        } else if (action === "removeVideo") {
          displayCallMessage = t("apps.chats.toolCalls.tv.removingVideo", {
            defaultValue: "Removing video from channel…",
          });
        } else {
          displayCallMessage = t("apps.chats.toolCalls.controllingPlayback");
        }
        break;
      }
      case "settings":
        displayCallMessage = t("apps.chats.toolCalls.changingSettings");
        break;
      case "searchSongs": {
        const query = typeof input?.query === "string" ? input.query : "";
        displayCallMessage = t("apps.chats.toolCalls.searchingSongs", { query });
        break;
      }
      case "songLibraryControl":
        displayCallMessage =
          getSongLibraryCallSummary(input) ??
          t("apps.chats.toolCalls.running", {
            toolName: formatToolName(toolName),
          });
        break;
      case "webFetch": {
        const url = typeof input?.url === "string" ? input.url : "";
        let hostname = "";
        try { hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname; } catch { /* */ }
        displayCallMessage = t("apps.chats.toolCalls.webFetch.fetching", { hostname: hostname || url });
        break;
      }
      case "mapsSearchPlaces": {
        const query = typeof input?.query === "string" ? input.query : "";
        displayCallMessage = query
          ? t("apps.chats.toolCalls.maps.searching", {
              defaultValue: 'Searching maps for "{{query}}"…',
              query,
            })
          : t("apps.chats.toolCalls.maps.searchingNoQuery", {
              defaultValue: "Searching maps…",
            });
        break;
      }
      case "memoryWrite":
        displayCallMessage = t("apps.chats.toolCalls.memory.saving");
        break;
      case "memoryRead":
        displayCallMessage = t("apps.chats.toolCalls.memory.recalling");
        break;
      case "memoryDelete":
        displayCallMessage = t("apps.chats.toolCalls.memory.deleting");
        break;
      case "cursorCloudAgent":
        displayCallMessage = t("apps.chats.toolCalls.cursorCloudAgent.starting");
        break;
      case "listCursorCloudAgentRuns":
        displayCallMessage = t(
          "apps.chats.toolCalls.listCursorCloudAgentRuns.loading"
        );
        break;
      case "web_search":
      case "google_search":
        displayCallMessage = t("apps.chats.toolCalls.searchingWeb");
        break;
      case "calendarControl": {
        const action = input?.action;
        const title = typeof input?.title === "string" ? input.title : "";
        if (action === "create") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.addingEvent", { title });
        } else if (action === "update") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.updatingEvent");
        } else if (action === "delete") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.deletingEvent");
        } else if (action === "list") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.listingEvents");
        } else if (action === "createTodo") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.addingTodo", { title });
        } else if (action === "toggleTodo") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.togglingTodo");
        } else if (action === "deleteTodo") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.deletingTodo");
        } else if (action === "listTodos") {
          displayCallMessage = t("apps.chats.toolCalls.calendar.listingTodos");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.running", { toolName: formatToolName(toolName) });
        }
        break;
      }
      case "stickiesControl": {
        displayCallMessage = t("apps.chats.toolCalls.stickies.managing");
        break;
      }
      case "contactsControl": {
        const action = input?.action;
        if (action === "list") {
          displayCallMessage = t("apps.chats.toolCalls.contacts.listing");
        } else if (action === "get") {
          displayCallMessage = t("apps.chats.toolCalls.contacts.loading");
        } else if (action === "create") {
          displayCallMessage = t("apps.chats.toolCalls.contacts.creating");
        } else if (action === "update") {
          displayCallMessage = t("apps.chats.toolCalls.contacts.updating");
        } else if (action === "delete") {
          displayCallMessage = t("apps.chats.toolCalls.contacts.deleting");
        }
        break;
      }
      case "infiniteMacControl": {
        const action = input?.action;
        const system = typeof input?.system === "string" ? input.system : "";
        if (action === "launchSystem") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.startingSystem", { system: system || "system" });
        } else if (action === "getStatus") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.gettingStatus");
        } else if (action === "readScreen") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.capturingScreen");
        } else if (action === "mouseMove") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.movingMouse");
        } else if (action === "mouseClick") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.clicking");
        } else if (action === "doubleClick") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.doubleClicking");
        } else if (action === "keyPress") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.pressingKey");
        } else if (action === "pause") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.pausing");
        } else if (action === "unpause") {
          displayCallMessage = t("apps.chats.toolCalls.infiniteMac.resuming");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.running", { toolName: "Infinite Mac" });
        }
        break;
      }
      default:
        displayCallMessage = t("apps.chats.toolCalls.running", { toolName: formatToolName(toolName) });
    }
  return displayCallMessage;
}
