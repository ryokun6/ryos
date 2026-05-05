import type {
  InboxCategory,
  InboxDedupeKey,
} from "@/lib/inbox/inboxTypes";
import type { ExternalToast } from "sonner-original";
import { useInboxStore } from "@/stores/useInboxStore";

function safeLabel(text: string, max = 200): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Flatten React/unknown message to plain string for inbox (best-effort). */
export function toastMessageToString(message: unknown): string | null {
  if (message == null) return null;
  if (typeof message === "string" || typeof message === "number") {
    return String(message);
  }
  return null;
}

export function inferToastInboxMeta(input: {
  method: string;
  message: string;
  data?: ExternalToast;
}): {
  category: InboxCategory;
  stackGroupKey: string;
  appLabel: string;
  title: string;
  preview: string;
  body?: string;
  skip: boolean;
} {
  const descRaw = input.data?.description;
  const description =
    typeof descRaw === "string"
      ? descRaw
      : typeof descRaw === "function"
        ? ""
        : "";

  let title = safeLabel(input.message, 120);
  let preview = description ? safeLabel(description, 280) : "";

  const method = input.method.toLowerCase();
  const fromClass = input.data?.className ?? "";
  const combined = `${title} ${preview} ${fromClass}`.toLowerCase();

  let category: InboxCategory = "system";
  let stackGroupKey = "app:ryos";
  let appLabel = "ryOS";

  if (
    combined.includes("ipod") ||
    combined.includes("library") ||
    title.toLowerCase().includes("track")
  ) {
    category = "system";
    stackGroupKey = "app:ipod";
    appLabel = "iPod";
  } else if (
    combined.includes("karaoke") ||
    combined.includes("dj ") ||
    combined.includes("session") ||
    combined.includes("queue")
  ) {
    category = "system";
    stackGroupKey = "app:karaoke";
    appLabel = "Karaoke";
  } else if (
    combined.includes("calendar") ||
    combined.includes("event") ||
    combined.includes("export")
  ) {
    category = "calendar";
    stackGroupKey = "app:calendar";
    appLabel = "Calendar";
  } else if (
    combined.includes("chats") ||
    combined.includes("chat") ||
    combined.includes("room")
  ) {
    category = "chat";
    stackGroupKey = "app:chats";
    appLabel = "Chats";
  } else if (
    combined.includes("shared page") ||
    combined.includes("explorer") ||
    combined.includes("internet explorer")
  ) {
    category = "shared_link";
    stackGroupKey = "app:internet-explorer";
    appLabel = "Internet Explorer";
  } else if (combined.includes("finder") || combined.includes("file")) {
    category = "system";
    stackGroupKey = "app:finder";
    appLabel = "Finder";
  } else if (
    combined.includes("contact") ||
    combined.includes("address book")
  ) {
    category = "system";
    stackGroupKey = "app:contacts";
    appLabel = "Contacts";
  } else if (combined.includes("applet")) {
    category = "applet";
    stackGroupKey = "app:applet-viewer";
    appLabel = "Applets";
  }

  if (method === "error" && !preview) {
    preview = safeLabel(
      "Something went wrong — open Inbox for the full message.",
      120
    );
  }

  return {
    category,
    stackGroupKey,
    appLabel,
    title,
    preview,
    body: description ? safeLabel(description, 4000) : undefined,
    skip: false,
  };
}

function resolveToastStackGroup(message: string): {
  stackGroupKey: string;
  appLabel: string;
} {
  const t = message.toLowerCase();
  if (t.includes("ipod") || t.includes("library sync") || t.includes("library updated"))
    return { stackGroupKey: "app:ipod", appLabel: "iPod" };
  if (t.includes("karaoke"))
    return { stackGroupKey: "app:karaoke", appLabel: "Karaoke" };
  if (t.includes("calendar") || t.includes("event"))
    return { stackGroupKey: "app:calendar", appLabel: "Calendar" };
  if (t.includes("chat") || t.includes("chats"))
    return { stackGroupKey: "app:chats", appLabel: "Chats" };
  if (t.includes("ryos") && (t.includes("mac") || t.includes("download")))
    return { stackGroupKey: "app:ryos", appLabel: "ryOS" };
  return { stackGroupKey: "app:ryos", appLabel: "ryOS" };
}

export function mirrorToastToInbox(input: {
  method: string;
  message: string;
  data?: ExternalToast;
  toastId: string | number;
}): void {
  const meta = inferToastInboxMeta(input);
  if (meta.skip) return;

  const dedupeKey = `toast_mirror:${String(input.toastId)}` as InboxDedupeKey;

  const labelFix = resolveToastStackGroup(input.message);
  const stackGroupKey = meta.stackGroupKey.startsWith("app:ryos")
    ? labelFix.stackGroupKey
    : meta.stackGroupKey;
  const appLabel =
    meta.stackGroupKey.startsWith("app:ryos") && labelFix.stackGroupKey !== "app:ryos"
      ? labelFix.appLabel
      : meta.appLabel;

  useInboxStore.getState().upsertItem({
    dedupeKey,
    category: meta.category,
    title: meta.title,
    preview: meta.preview || meta.title,
    body: meta.body,
    source: {
      producer: "toast",
      extras: {
        toastMethod: input.method,
        stackGroupKey,
        appLabel,
      },
    },
  });
}
