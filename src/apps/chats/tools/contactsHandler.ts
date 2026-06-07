import type { ToolContext } from "./types";
import { createShortIdMap, resolveId, type ShortIdMap } from "./helpers";
import i18n from "@/lib/i18n";
import { useContactsStore } from "@/stores/useContactsStore";
import { contactMatchesQuery } from "@/utils/contacts";
import {
  contactsInputToDraft,
  hasMeaningfulContactDraft,
  serializeContactToolRecord,
  type ContactsControlInput,
} from "@/shared/tools/contacts";

export type { ContactsControlInput } from "@/shared/tools/contacts";

let contactsIdMap: ShortIdMap | undefined;

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

      context.addToolOutput({
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
          contacts: contacts.map((contact) =>
            serializeContactToolRecord(contact, contactsIdMap)
          ),
        },
      });
      return;
    }

    case "get": {
      if (!input.id) {
        context.addToolOutput({
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
        context.addToolOutput({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.notFound", {
            id: input.id,
          }),
        });
        return;
      }

      context.addToolOutput({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message: i18n.t("apps.chats.toolCalls.contacts.loaded", {
            name: contact.displayName,
          }),
          contact: serializeContactToolRecord(contact, contactsIdMap),
        },
      });
      return;
    }

    case "create": {
      if (!hasMeaningfulContactDraft(input)) {
        context.addToolOutput({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.missingData"),
        });
        return;
      }

      const id = store.addContact(contactsInputToDraft(input));
      const contact = useContactsStore
        .getState()
        .contacts.find((item) => item.id === id);

      context.launchApp("contacts");
      context.addToolOutput({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message: i18n.t("apps.chats.toolCalls.contacts.created", {
            name: contact?.displayName || i18n.t("apps.contacts.title"),
          }),
          contact: contact
            ? serializeContactToolRecord(contact, contactsIdMap)
            : null,
        },
      });
      return;
    }

    case "update": {
      if (!input.id) {
        context.addToolOutput({
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
        context.addToolOutput({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.notFound", {
            id: input.id,
          }),
        });
        return;
      }

      if (!hasMeaningfulContactDraft(input)) {
        context.addToolOutput({
          tool: "contactsControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.contacts.noUpdates"),
        });
        return;
      }

      store.updateContact(id, contactsInputToDraft(input));
      const updated = useContactsStore
        .getState()
        .contacts.find((item) => item.id === id);

      context.launchApp("contacts");
      context.addToolOutput({
        tool: "contactsControl",
        toolCallId,
        output: {
          success: true,
          message: i18n.t("apps.chats.toolCalls.contacts.updated", {
            name: updated?.displayName || existing.displayName,
          }),
          contact: updated
            ? serializeContactToolRecord(updated, contactsIdMap)
            : null,
        },
      });
      return;
    }

    case "delete": {
      if (!input.id) {
        context.addToolOutput({
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
        context.addToolOutput({
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
      context.addToolOutput({
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
