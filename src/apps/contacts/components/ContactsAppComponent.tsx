import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ContactsMenuBar } from "./ContactsMenuBar";
import { useContactsLogic } from "../hooks/useContactsLogic";
import { appMetadata } from "..";
import type { AppProps } from "@/apps/base/types";
import { cn } from "@/lib/utils";
import { getContactInitials, getContactSummary, type Contact } from "@/utils/contacts";
import { Plus, Trash } from "@phosphor-icons/react";

function splitMultivalueInput(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatMultivalue(values: string[]): string {
  return values.join("\n");
}

function ContactListItem({
  contact,
  isSelected,
  onClick,
}: {
  contact: Contact;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2 text-left border-b transition-colors",
        isSelected ? "bg-black/10" : "hover:bg-black/5"
      )}
      style={{ borderColor: "rgba(0,0,0,0.08)" }}
    >
      <div className="shrink-0 w-9 h-9 rounded-full bg-[#d7c3a2] border border-black/15 flex items-center justify-center text-[11px] font-semibold text-black/75">
        {getContactInitials(contact)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold truncate">{contact.displayName}</div>
        <div className="text-[11px] text-black/55 truncate">
          {getContactSummary(contact) || "\u00A0"}
        </div>
      </div>
    </button>
  );
}

function Field({
  label,
  children,
  fullWidth = false,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1", fullWidth && "md:col-span-2")}>
      <span className="text-[11px] font-semibold opacity-70">{label}</span>
      {children}
    </label>
  );
}

const inputClassName =
  "w-full rounded-none border border-black/20 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-black/45";

export function ContactsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOsxTheme,
    isSystem7Theme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    searchQuery,
    setSearchQuery,
    contacts,
    selectedContact,
    handleSelectContact,
    handleCreateContact,
    handleDeleteSelectedContact,
    updateSelectedContact,
    handleImport,
    handleFileSelected,
    fileInputRef,
  } = useContactsLogic();

  const menuBar = (
    <ContactsMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewContact={handleCreateContact}
      onImport={handleImport}
      onDeleteContact={handleDeleteSelectedContact}
      hasSelectedContact={Boolean(selectedContact)}
    />
  );

  if (!isWindowOpen) {
    return null;
  }

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.contacts.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="contacts"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          className={cn(
            "h-full flex flex-col font-os-ui overflow-hidden",
            isMacOsxTheme ? "bg-[#ece9e0]" : isSystem7Theme ? "bg-white" : "bg-[#efede4]"
          )}
        >
          <div className="flex-1 flex min-h-0">
            <aside
              className={cn(
                "w-[250px] shrink-0 flex flex-col border-r",
                isMacOsxTheme ? "bg-white/70" : "bg-black/0"
              )}
              style={{ borderColor: "rgba(0,0,0,0.08)" }}
            >
              <div className="p-3 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <div className="flex gap-2">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("apps.contacts.searchPlaceholder")}
                    className={inputClassName}
                  />
                  <Button
                    type="button"
                    variant={isSystem7Theme ? "player" : "retro"}
                    onClick={handleCreateContact}
                    className="h-auto px-2"
                    title={t("apps.contacts.menu.newContact")}
                  >
                    <Plus size={14} weight="bold" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {contacts.length === 0 ? (
                  <div className="px-4 py-6 text-[12px] text-black/55">
                    {t("apps.contacts.emptyState")}
                  </div>
                ) : (
                  contacts.map((contact) => (
                    <ContactListItem
                      key={contact.id}
                      contact={contact}
                      isSelected={selectedContact?.id === contact.id}
                      onClick={() => handleSelectContact(contact)}
                    />
                  ))
                )}
              </div>
            </aside>

            <main className="flex-1 min-w-0 overflow-y-auto">
              {selectedContact ? (
                <div className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14 h-14 rounded-full bg-[#d7c3a2] border border-black/15 flex items-center justify-center text-lg font-semibold text-black/80 shrink-0">
                        {getContactInitials(selectedContact)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[18px] font-semibold truncate">
                          {selectedContact.displayName}
                        </div>
                        <div className="text-[12px] text-black/55 truncate">
                          {getContactSummary(selectedContact) ||
                            t("apps.contacts.noSummary")}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={isSystem7Theme ? "player" : "retro"}
                      onClick={handleDeleteSelectedContact}
                      className="shrink-0"
                    >
                      <Trash size={13} weight="bold" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label={t("apps.contacts.fields.displayName")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.displayName}
                        onChange={(event) =>
                          updateSelectedContact({ displayName: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.nickname")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.nickname}
                        onChange={(event) =>
                          updateSelectedContact({ nickname: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.firstName")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.firstName}
                        onChange={(event) =>
                          updateSelectedContact({ firstName: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.lastName")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.lastName}
                        onChange={(event) =>
                          updateSelectedContact({ lastName: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.organization")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.organization}
                        onChange={(event) =>
                          updateSelectedContact({ organization: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.jobTitle")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.title}
                        onChange={(event) =>
                          updateSelectedContact({ title: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.telegramUsername")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.telegramUsername}
                        onChange={(event) =>
                          updateSelectedContact({
                            telegramUsername: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.telegramUserId")}>
                      <input
                        className={inputClassName}
                        value={selectedContact.telegramUserId}
                        onChange={(event) =>
                          updateSelectedContact({
                            telegramUserId: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.birthday")}>
                      <input
                        type="date"
                        className={inputClassName}
                        value={selectedContact.birthday || ""}
                        onChange={(event) =>
                          updateSelectedContact({
                            birthday: event.target.value || null,
                          })
                        }
                      />
                    </Field>
                    <Field label={t("apps.contacts.fields.source")}>
                      <input
                        className={cn(inputClassName, "bg-black/5")}
                        value={selectedContact.source}
                        readOnly
                      />
                    </Field>

                    <Field
                      label={t("apps.contacts.fields.emails")}
                      fullWidth
                    >
                      <textarea
                        rows={3}
                        className={inputClassName}
                        value={formatMultivalue(
                          selectedContact.emails.map((item) => item.value)
                        )}
                        onChange={(event) =>
                          updateSelectedContact({
                            emails: splitMultivalueInput(event.target.value),
                          })
                        }
                        placeholder={t("apps.contacts.placeholders.multiValue")}
                      />
                    </Field>

                    <Field
                      label={t("apps.contacts.fields.phones")}
                      fullWidth
                    >
                      <textarea
                        rows={3}
                        className={inputClassName}
                        value={formatMultivalue(
                          selectedContact.phones.map((item) => item.value)
                        )}
                        onChange={(event) =>
                          updateSelectedContact({
                            phones: splitMultivalueInput(event.target.value),
                          })
                        }
                        placeholder={t("apps.contacts.placeholders.multiValue")}
                      />
                    </Field>

                    <Field label={t("apps.contacts.fields.urls")} fullWidth>
                      <textarea
                        rows={2}
                        className={inputClassName}
                        value={formatMultivalue(
                          selectedContact.urls.map((item) => item.value)
                        )}
                        onChange={(event) =>
                          updateSelectedContact({
                            urls: splitMultivalueInput(event.target.value),
                          })
                        }
                        placeholder={t("apps.contacts.placeholders.multiValue")}
                      />
                    </Field>

                    <Field
                      label={t("apps.contacts.fields.addresses")}
                      fullWidth
                    >
                      <textarea
                        rows={3}
                        className={inputClassName}
                        value={formatMultivalue(
                          selectedContact.addresses.map((item) => item.formatted)
                        )}
                        onChange={(event) =>
                          updateSelectedContact({
                            addresses: splitMultivalueInput(event.target.value),
                          })
                        }
                        placeholder={t("apps.contacts.placeholders.multiValue")}
                      />
                    </Field>

                    <Field label={t("apps.contacts.fields.notes")} fullWidth>
                      <textarea
                        rows={6}
                        className={inputClassName}
                        value={selectedContact.notes}
                        onChange={(event) =>
                          updateSelectedContact({ notes: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-[13px] text-black/55 p-6 text-center">
                  {t("apps.contacts.emptySelection")}
                </div>
              )}
            </main>
          </div>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          appId="contacts"
          helpItems={translatedHelpItems}
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="contacts"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".vcf,.vcard,text/vcard"
          className="hidden"
          onChange={handleFileSelected}
        />
      </WindowFrame>
    </>
  );
}
