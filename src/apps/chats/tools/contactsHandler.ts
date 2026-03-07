import type { ToolContext } from "./types";
import { createShortIdMap, resolveId, type ShortIdMap } from "./helpers";
import i18n from "@/lib/i18n";
import { useContactsStore } from "@/stores/useContactsStore";
import {
  contactMatchesQuery,
  getContactSummary,
  type ContactDraft,
} from "@/utils/contacts";

export interface ContactsControlInput {
  action: "list" | "get" | "create" | "update" | "delete";
  id?: string;
  query?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  organization?: string;
  title?: string;
  notes?: string;
  emails?: string[];
  phones?: string[];
  urls?: string[];
  addresses?: string[];
  birthday?: string | null;
  telegramUsername?: string | null;
  telegramUserId?: string | null;
}

let contactsIdMap: ShortIdMap | undefined;

function toDraft(input: ContactsControlInput): ContactDraft {
  return {
    displayName: input.displayName,
    firstName: input.firstName,
    lastName: input.lastName,
    nickname: input.nickname,
    organization: input.organization,
    title: input.title,
    notes: input.notes,
    emails: input.emails,
    phones: input.phones,
    urls: input.urls,
    addresses: input.addresses,
    birthday: input.birthday,
    telegramUsername: input.telegramUsername,
    telegramUserId: input.telegramUserId,
    source: "ai",
  };
}

function serializeContact(contact: ReturnType<typeof useContactsStore.getState>["contacts"][number]) {
  return {
    id: contactsIdMap?.fullToShort.get(contact.id) || contact.id,
    displayName: contact.displayName,
    organization: contact.organization,
    title: contact.title,
    emails: contact.emails.map((item) => item.value),
    phones: contact.phones.map((item) => item.value),
    urls: contact.urls.map((item) => item.value),
    addresses: contact.addresses.map((item) => item.formatted),
    telegramUsername: contact.telegramUsername || null,
    telegramUserId: contact.telegramUserId || null,
    birthday: contact.birthday,
    notes: contact.notes || null,
    summary: getContactSummary(contact) || null,
  };
}

function hasMeaningfulDraft(input: ContactsControlInput): boolean {
  return Boolean(
    input.displayName ||
      input.firstName ||
      input.lastName ||
      input.nickname ||
      input.organization ||
      input.title ||
      input.notes ||
      input.telegramUsername ||
      input.telegramUserId ||
      input.birthday ||
      input.emails?.length ||
      input.phones?.length ||
      input.urls?.length ||
      input.addresses?.length
  );
}

export const handleContactsControl = (
  input: ContactsControlInput,
  toolCallId: string,
  context: ToolContext
): void => {
  const store = useContactsStore.getState();

  switch (input.action) {
    case "list": {
      const contacts = input.query
        ? store.contacts.filter((contact) => contactMatchesQuery(contact, input.query || ""))
        : store.contacts;

      contactsIdMap = createShortIdMap(
        contacts.map((contact) => contact.id),
        "c"
      );

      context.addToolResult({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message:
            contacts.length === 0
              ? i18n.t("apps.chats.toolCalls.contacts.noContacts")
              : i18n.t("apps.chats.toolCalls.contacts.found", {
                  count: contacts.length,
                }),
          contacts: contacts.map(serializeContact),
        },
      });
      return;
    }

    case "get": {
      if (!input.id) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.missingId"),
        });
        return;
      }

      const id = resolveId(input.id, contactsIdMap);
      const contact = store.contacts.find((item) => item.id === id);

      if (!contact) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.notFound", {
            id: input.id,
          }),
        });
        return;
      }

      context.addToolResult({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message: i18n.t("apps.chats.toolCalls.contacts.loaded", {
            name: contact.displayName,
          }),
          contact: serializeContact(contact),
        },
      });
      return;
    }

    case "create": {
      if (!hasMeaningfulDraft(input)) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.missingData"),
        });
        return;
      }

      const id = store.addContact(toDraft(input));
      const contact = useContactsStore
        .getState()
        .contacts.find((item) => item.id === id);

      context.launchApp("contacts");
      context.addToolResult({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message: i18n.t("apps.chats.toolCalls.contacts.created", {
            name: contact?.displayName || i18n.t("apps.contacts.title"),
          }),
          contact: contact ? serializeContact(contact) : null,
        },
      });
      return;
    }

    case "update": {
      if (!input.id) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.missingId"),
        });
        return;
      }

      const id = resolveId(input.id, contactsIdMap);
      const existing = store.contacts.find((item) => item.id === id);
      if (!existing) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.notFound", {
            id: input.id,
          }),
        });
        return;
      }

      if (!hasMeaningfulDraft(input)) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.noUpdates"),
        });
        return;
      }

      store.updateContact(id, toDraft(input));
      const updated = useContactsStore
        .getState()
        .contacts.find((item) => item.id === id);

      context.launchApp("contacts");
      context.addToolResult({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message: i18n.t("apps.chats.toolCalls.contacts.updated", {
            name: updated?.displayName || existing.displayName,
          }),
          contact: updated ? serializeContact(updated) : null,
        },
      });
      return;
    }

    case "delete": {
      if (!input.id) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.missingId"),
        });
        return;
      }

      const id = resolveId(input.id, contactsIdMap);
      const existing = store.contacts.find((item) => item.id === id);
      if (!existing) {
        context.addToolResult({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.notFound", {
            id: input.id,
          }),
        });
        return;
      }

      store.deleteContact(id);
      context.addToolResult({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message: i18n.t("apps.chats.toolCalls.contacts.deleted", {
            name: existing.displayName,
          }),
        },
      });
      return;
    }
  }
};
