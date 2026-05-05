/**
 * Imperative helper for features that are not React components.
 * Prefer calling `useInboxStore.getState().upsertItem` directly when already in-app code.
 */
import type {
  InboxCategory,
  InboxDedupeKey,
  InboxActionPayload,
  InboxSourceMeta,
} from "@/lib/inbox/inboxTypes";
import { useInboxStore } from "@/stores/useInboxStore";

export function pushInboxItem(input: {
  dedupeKey?: InboxDedupeKey;
  category: InboxCategory;
  title: string;
  preview: string;
  body?: string;
  action?: InboxActionPayload;
  source?: InboxSourceMeta;
}): string {
  return useInboxStore.getState().upsertItem(input);
}
