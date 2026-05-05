import type { AppId } from "@/config/appRegistryData";

/** Structured categories shown as tabs / filters in Inbox */
export type InboxCategory =
  | "system"
  | "cursor_agent"
  | "applet"
  | "chat"
  | "calendar"
  | "shared_link";

/** Stable dedupe key per logical notification source */
export type InboxDedupeKey =
  | `cursor_agent:${string}`
  | `applet_updated:${string}`
  | `welcome:v1`
  | `toast_mirror:${string}`
  | `calendar_reminder:${string}`;

/** Optional payload for actions (open URL, launch app, etc.) */
export interface InboxActionPayload {
  kind: "open_url" | "launch_app";
  /** URL for open_url */
  url?: string;
  /** App id for launch_app */
  appId?: AppId;
  /** Passed to launchApp initialData when kind is launch_app */
  initialData?: unknown;
}

export interface InboxSourceMeta {
  /** Which subsystem produced this item */
  producer?: string;
  /** Extra identifiers for debugging / future linking */
  extras?: Record<string, string>;
}

export interface InboxItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  readAt: number | null;
  category: InboxCategory;
  dedupeKey?: InboxDedupeKey;
  title: string;
  preview: string;
  body?: string;
  action?: InboxActionPayload;
  source?: InboxSourceMeta;
}
