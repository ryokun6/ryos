import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ContactsMenuBar } from "./ContactsMenuBar";
import { UserPicturePicker } from "./UserPicturePicker";
import { useContactsLogic } from "../hooks/useContactsLogic";
import { appMetadata } from "..";
import type { AppProps } from "@/apps/base/types";
import { cn } from "@/lib/utils";
import { getContactInitials, getContactSummary, type Contact } from "@/utils/contacts";
import { Plus, UploadSimple } from "@phosphor-icons/react";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";

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
        "w-full flex items-center gap-2 px-3 py-1.5 text-left border-b transition-colors",
        isSelected
          ? "bg-[#b6b6b6] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
          : "hover:bg-black/5"
      )}
      style={{ borderColor: "rgba(0,0,0,0.08)" }}
    >
      {contact.picture ? (
        <img
          src={contact.picture}
          alt=""
          className="shrink-0 w-3.5 h-3.5 rounded-[2px] border border-black/20 object-cover"
        />
      ) : (
        <div className="shrink-0 w-3.5 h-3.5 rounded-[2px] border border-black/20 bg-[#efefef]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-tight truncate">{contact.displayName}</div>
      </div>
    </button>
  );
}

function GroupListItem({
  label,
  count,
  isSelected,
  onClick,
}: {
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-2 py-1 text-left text-[11px] transition-colors rounded-sm",
        isSelected
          ? "bg-[#7b7b7b] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          : "text-black/80 hover:bg-black/5"
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cn("text-[10px]", isSelected ? "text-white/80" : "text-black/45")}>
        {count}
      </span>
    </button>
  );
}

function PanelHeader({
  title,
  trailing,
  useGeneva = false,
}: {
  title: string;
  trailing?: ReactNode;
  useGeneva?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-0.5 text-[11px] border-b",
        useGeneva && "font-geneva-12"
      )}
      style={{
        background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
        color: "#222",
        textShadow: "0 1px 0 #e1e1e1",
        borderTop: "1px solid rgba(255,255,255,0.5)",
        borderBottom: "1px solid #787878",
      }}
    >
      <span className="font-regular text-center flex-1">{title}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("overflow-hidden bg-white/90", className)}
      style={{
        border: "1px solid rgba(0, 0, 0, 0.55)",
        boxShadow:
          "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
      }}
    >
      {children}
    </div>
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

const compactInputClassName =
  "w-full rounded-none border border-black/20 bg-white px-2 py-1 text-[12px] outline-none focus:border-black/45";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="py-2 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="text-[11px] font-semibold text-black/55 mb-1">{label}</div>
      {children}
    </div>
  );
}

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
    selectedGroupId,
    contactGroups,
    contacts,
    selectedContact,
    handleSelectGroup,
    handleSelectContact,
    handleCreateContact,
    handleDeleteSelectedContact,
    updateSelectedContact,
    handleImport,
    handleFileSelected,
    fileInputRef,
  } = useContactsLogic();
  const useGeneva = isMacOsxTheme || isSystem7Theme;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(820);
  const [isPicturePickerOpen, setIsPicturePickerOpen] = useState(false);
  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });
  const isMobileLayout = containerWidth < 640;

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
        material={isMacOsxTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          ref={containerRef}
          className={cn(
            "h-full flex flex-col font-os-ui overflow-hidden",
            isMacOsxTheme ? "bg-transparent" : isSystem7Theme ? "bg-white" : "bg-[#efede4]"
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between py-1.5 border-b gap-2",
              isMacOsxTheme ? "px-1" : "px-2"
            )}
            style={{
              borderColor: isXpTheme
                ? "#ACA899"
                : isMacOsxTheme
                  ? "rgba(0,0,0,0.18)"
                  : "rgba(0,0,0,0.1)",
              background: isXpTheme
                ? "#ECE9D8"
                : isMacOsxTheme
                  ? "transparent"
                  : "#e0e0e0",
            }}
          >
            {isMacOsxTheme ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="metal-inset-btn-group">
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={handleCreateContact}
                      title={t("apps.contacts.menu.newContact")}
                    >
                      <Plus size={9} weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={handleImport}
                      title={t("apps.contacts.menu.importVCard")}
                    >
                      <UploadSimple size={9} weight="bold" />
                    </button>
                  </div>
                </div>
                <div className="flex-1" />
                <div className={cn("flex items-center gap-2", isMobileLayout && "flex-1 min-w-0")}>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("apps.contacts.searchPlaceholder")}
                    className={cn(
                      "rounded-full border border-black/20 bg-white px-3 py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] outline-none font-geneva-12",
                      isMobileLayout ? "flex-1 min-w-0 max-w-none" : "w-[150px]"
                    )}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-0">
                  <Button
                    type="button"
                    variant={isSystem7Theme ? "player" : "ghost"}
                    onClick={handleCreateContact}
                    className={cn("h-6 w-6 px-0", isXpTheme && "text-black")}
                    title={t("apps.contacts.menu.newContact")}
                  >
                    <Plus size={12} weight="bold" />
                  </Button>
                  <Button
                    type="button"
                    variant={isSystem7Theme ? "player" : "ghost"}
                    onClick={handleImport}
                    className={cn("h-6 w-6 px-0", isXpTheme && "text-black")}
                    title={t("apps.contacts.menu.importVCard")}
                  >
                    <UploadSimple size={12} weight="bold" />
                  </Button>
                </div>
                <div className="flex-1" />
                <div className={cn("flex items-center gap-2 min-w-0", isMobileLayout && "flex-1")}>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("apps.contacts.searchPlaceholder")}
                    className={cn(
                      "rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] outline-none min-w-0",
                      isMobileLayout ? "flex-1 max-w-none" : "w-[170px]"
                    )}
                  />
                </div>
              </>
            )}
          </div>

          <div
            className={cn(
              "flex-1 overflow-hidden w-full",
              isMobileLayout
                ? "flex flex-col w-full h-full items-stretch"
                : "flex",
              isMacOsxTheme && !isMobileLayout && "px-[5px] pb-[5px]",
              !isMobileLayout && isMacOsxTheme && "gap-[5px]"
            )}
          >
            {!isMobileLayout && (
            <Panel className="w-[170px] shrink-0 flex flex-col min-h-0">
              <PanelHeader
                title={t("apps.contacts.groupHeaders.groups", {
                  defaultValue: "Group",
                })}
                useGeneva={useGeneva}
              />
              <div className={cn("flex-1 overflow-y-auto p-1.5 space-y-0.5 calendar-sidebar", useGeneva && "font-geneva-12")}>
                {contactGroups.map((group) => (
                  <GroupListItem
                    key={group.id}
                    label={group.label}
                    count={group.contacts.length}
                    isSelected={selectedGroupId === group.id}
                    onClick={() => handleSelectGroup(group.id)}
                  />
                ))}
              </div>
            </Panel>
            )}

            <Panel
              className={cn(
                "flex flex-col min-h-0",
                isMobileLayout
                  ? "w-full max-w-none self-stretch h-[140px] shrink-0 basis-auto"
                  : "w-[245px] shrink-0"
              )}
            >
              <PanelHeader
                title={t("apps.contacts.groupHeaders.names", {
                  defaultValue: "Name",
                })}
                useGeneva={useGeneva}
              />
              <div className={cn("flex-1 overflow-y-auto calendar-sidebar", useGeneva && "font-geneva-12")}>
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
            </Panel>

            <Panel
              className={cn(
                "flex-1 min-w-0 flex flex-col",
                isMobileLayout && "w-full max-w-none self-stretch basis-auto"
              )}
            >
              <PanelHeader
                title={selectedContact?.displayName || t("apps.contacts.title")}
                useGeneva={useGeneva}
              />
              {selectedContact ? (
                <>
                  <div className="flex items-start gap-3 px-4 pt-4 pb-2 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                    <button
                      type="button"
                      onClick={() => setIsPicturePickerOpen(true)}
                      className="w-16 h-16 shrink-0 rounded-[6px] border border-black/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] flex items-center justify-center text-xl font-semibold text-black/70 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      style={selectedContact.picture ? undefined : { background: "linear-gradient(to bottom, #b8b8b8, #dcdcdc)" }}
                      title="Change picture"
                    >
                      {selectedContact.picture ? (
                        <img
                          src={selectedContact.picture}
                          alt={selectedContact.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        getContactInitials(selectedContact)
                      )}
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        className="w-full border border-[#c59a37] bg-[#f9df7a] px-2 py-1 text-[18px] font-semibold outline-none"
                        value={selectedContact.displayName}
                        onChange={(event) =>
                          updateSelectedContact({ displayName: event.target.value })
                        }
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          className={compactInputClassName}
                          value={selectedContact.organization}
                          onChange={(event) =>
                            updateSelectedContact({ organization: event.target.value })
                          }
                          placeholder={t("apps.contacts.fields.organization")}
                        />
                        <input
                          className={compactInputClassName}
                          value={selectedContact.title}
                          onChange={(event) =>
                            updateSelectedContact({ title: event.target.value })
                          }
                          placeholder={t("apps.contacts.fields.jobTitle")}
                        />
                      </div>
                      <div className="text-[12px] text-black/55 truncate">
                        {getContactSummary(selectedContact) || t("apps.contacts.noSummary")}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pb-3">
                    <DetailRow label={t("apps.contacts.fields.phones")}>
                      <textarea
                        rows={2}
                        className={compactInputClassName}
                        value={formatMultivalue(selectedContact.phones.map((item) => item.value))}
                        onChange={(event) =>
                          updateSelectedContact({
                            phones: splitMultivalueInput(event.target.value),
                          })
                        }
                        placeholder={t("apps.contacts.placeholders.multiValue")}
                      />
                    </DetailRow>

                    <DetailRow label={t("apps.contacts.fields.emails")}>
                      <textarea
                        rows={2}
                        className={compactInputClassName}
                        value={formatMultivalue(selectedContact.emails.map((item) => item.value))}
                        onChange={(event) =>
                          updateSelectedContact({
                            emails: splitMultivalueInput(event.target.value),
                          })
                        }
                        placeholder={t("apps.contacts.placeholders.multiValue")}
                      />
                    </DetailRow>

                    <DetailRow label={t("apps.contacts.fields.birthday")}>
                      <input
                        type="date"
                        className={compactInputClassName}
                        value={selectedContact.birthday || ""}
                        onChange={(event) =>
                          updateSelectedContact({
                            birthday: event.target.value || null,
                          })
                        }
                      />
                    </DetailRow>

                    <DetailRow label={t("apps.contacts.fields.telegramUsername")}>
                      <input
                        className={compactInputClassName}
                        value={selectedContact.telegramUsername}
                        onChange={(event) =>
                          updateSelectedContact({
                            telegramUsername: event.target.value,
                          })
                        }
                      />
                    </DetailRow>

                    <DetailRow label={t("apps.contacts.fields.telegramUserId")}>
                      <input
                        className={compactInputClassName}
                        value={selectedContact.telegramUserId}
                        onChange={(event) =>
                          updateSelectedContact({
                            telegramUserId: event.target.value,
                          })
                        }
                      />
                    </DetailRow>

                    <DetailRow label={t("apps.contacts.fields.addresses")}>
                      <textarea
                        rows={3}
                        className={compactInputClassName}
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
                    </DetailRow>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <Field label={t("apps.contacts.fields.firstName")}>
                        <input
                          className={compactInputClassName}
                          value={selectedContact.firstName}
                          onChange={(event) =>
                            updateSelectedContact({ firstName: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("apps.contacts.fields.lastName")}>
                        <input
                          className={compactInputClassName}
                          value={selectedContact.lastName}
                          onChange={(event) =>
                            updateSelectedContact({ lastName: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("apps.contacts.fields.nickname")}>
                        <input
                          className={compactInputClassName}
                          value={selectedContact.nickname}
                          onChange={(event) =>
                            updateSelectedContact({ nickname: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("apps.contacts.fields.source")}>
                        <input
                          className={cn(compactInputClassName, "bg-black/5")}
                          value={selectedContact.source}
                          readOnly
                        />
                      </Field>
                    </div>

                    <DetailRow label={t("apps.contacts.fields.urls")}>
                      <textarea
                        rows={2}
                        className={compactInputClassName}
                        value={formatMultivalue(selectedContact.urls.map((item) => item.value))}
                        onChange={(event) =>
                          updateSelectedContact({
                            urls: splitMultivalueInput(event.target.value),
                          })
                        }
                        placeholder={t("apps.contacts.placeholders.multiValue")}
                      />
                    </DetailRow>

                    <DetailRow label={t("apps.contacts.fields.notes")}>
                      <textarea
                        rows={4}
                        className={compactInputClassName}
                        value={selectedContact.notes}
                        onChange={(event) =>
                          updateSelectedContact({ notes: event.target.value })
                        }
                      />
                    </DetailRow>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-[13px] text-black/55 p-6 text-center">
                  {t("apps.contacts.emptySelection")}
                </div>
              )}
            </Panel>
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
        <UserPicturePicker
          isOpen={isPicturePickerOpen}
          onOpenChange={setIsPicturePickerOpen}
          currentPicture={selectedContact?.picture ?? null}
          onSelect={(picture) => updateSelectedContact({ picture })}
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
