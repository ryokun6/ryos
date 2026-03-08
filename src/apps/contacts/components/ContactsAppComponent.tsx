import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { getContactInitials, type Contact } from "@/utils/contacts";
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
        isSelected ? "" : "hover:bg-black/5"
      )}
      style={{
        borderColor: "rgba(0,0,0,0.08)",
        ...(isSelected ? { background: "var(--os-color-selection-bg)", color: "var(--os-color-selection-text)" } : {}),
      }}
    >
      {contact.picture ? (
        <img
          src={contact.picture}
          alt=""
          className="shrink-0 w-5 h-5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] object-cover"
        />
      ) : (
        <div className="shrink-0 w-5 h-5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] bg-[linear-gradient(to_bottom,#e0e0e0,#c8c8c8)] flex items-center justify-center text-[8px] font-semibold text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.3)]">
          {getContactInitials(contact)}
        </div>
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
        "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] transition-colors border-b",
        isSelected ? "" : "hover:bg-black/5"
      )}
      style={{
        borderColor: "rgba(0,0,0,0.08)",
        ...(isSelected ? { background: "var(--os-color-selection-bg)", color: "var(--os-color-selection-text)" } : {}),
      }}
    >
      <span className="truncate">{label}</span>
      <span className={cn("text-[10px]", isSelected ? "opacity-70" : "text-black/45")}>
        {count}
      </span>
    </button>
  );
}

function PanelHeader({
  title,
  trailing,
  useGeneva = false,
  bordered = false,
}: {
  title: string;
  trailing?: ReactNode;
  useGeneva?: boolean;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-0.5 text-[11px] border-b",
        useGeneva && "font-geneva-12"
      )}
      style={bordered ? {
        background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
        color: "#222",
        textShadow: "0 1px 0 #e1e1e1",
        borderTop: "1px solid rgba(255,255,255,0.5)",
        borderBottom: "1px solid #787878",
      } : {
        borderColor: "rgba(0,0,0,0.1)",
        fontWeight: 600,
      }}
    >
      <span className={cn("flex-1", bordered && "font-regular text-center")}>{title}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

function Panel({
  className,
  children,
  bordered = true,
  style,
}: {
  className?: string;
  children: ReactNode;
  bordered?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden calendar-sidebar",
        bordered ? "bg-white/90" : "bg-white",
        className
      )}
      style={{
        ...(bordered ? {
          border: "1px solid rgba(0, 0, 0, 0.55)",
          boxShadow:
            "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
        } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start py-[5px]">
      <div className="w-16 shrink-0 text-right text-[11px] font-bold text-black/50 pr-2 pt-px">{label}</div>
      <div className="flex-1 min-w-0 text-[12px]">{children}</div>
    </div>
  );
}

function formatBirthday(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const editInputClass =
  "w-full bg-white/60 border border-black/10 rounded-sm px-1.5 py-0.5 text-[12px] outline-none focus:border-black/25";

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
    handleMarkAsMine,
    myContactId,
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
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => { setIsEditing(false); }, [selectedContact?.id]);

  const menuBar = (
    <ContactsMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewContact={handleCreateContact}
      onImport={handleImport}
      onDeleteContact={handleDeleteSelectedContact}
      onMarkAsMine={handleMarkAsMine}
      hasSelectedContact={Boolean(selectedContact)}
      isSelectedMine={selectedContact?.id === myContactId}
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
            "h-full w-full flex flex-col font-os-ui overflow-hidden",
            isMacOsxTheme ? "bg-transparent" : isSystem7Theme ? "bg-white" : "bg-[#efede4]"
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between py-1.5 gap-2",
              isMacOsxTheme ? "px-1" : "px-2"
            )}
            style={{
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
                      "rounded-full border border-black/40 bg-white px-3 py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] outline-none font-geneva-12",
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
              "flex-1 overflow-hidden",
              isMobileLayout ? "flex flex-col" : "flex",
              !isMobileLayout && isMacOsxTheme && "gap-[5px]"
            )}
          >
            {!isMobileLayout && (
            <Panel
              bordered={isMacOsxTheme}
              className="w-[170px] shrink-0 flex flex-col min-h-0"
              style={!isMacOsxTheme ? { borderRight: "1px solid rgba(0,0,0,0.08)" } : undefined}
            >
              <PanelHeader
                title={t("apps.contacts.groupHeaders.groups", {
                  defaultValue: "Group",
                })}
                useGeneva={useGeneva}
                bordered={isMacOsxTheme}
              />
              <div className={cn("flex-1 overflow-y-auto", useGeneva && "font-geneva-12")}>
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
              bordered={isMacOsxTheme}
              className={cn(
                "flex flex-col min-h-0",
                isMobileLayout
                  ? "w-full max-w-none self-stretch h-[140px] shrink-0 basis-auto"
                  : "w-[245px] shrink-0"
              )}
              style={
                !isMacOsxTheme
                  ? isMobileLayout
                    ? { borderBottom: "1px solid rgba(0,0,0,0.08)" }
                    : { borderRight: "1px solid rgba(0,0,0,0.08)" }
                  : undefined
              }
            >
              <PanelHeader
                title={t("apps.contacts.groupHeaders.names", {
                  defaultValue: "Name",
                })}
                useGeneva={useGeneva}
                bordered={isMacOsxTheme}
              />
              <div className={cn("flex-1 overflow-y-auto", useGeneva && "font-geneva-12")}>
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
              bordered={isMacOsxTheme}
              className={cn(
                "flex-1 min-w-0 flex flex-col",
                isMobileLayout && "w-full max-w-none self-stretch basis-auto"
              )}
            >
              {selectedContact ? (
                <>
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                  <div className="flex items-start gap-3 pt-3 pb-2 px-4">
                    <button
                      type="button"
                      onClick={() => setIsPicturePickerOpen(true)}
                      className="w-12 h-12 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] flex items-center justify-center text-base font-semibold text-white overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      style={selectedContact.picture ? undefined : { background: "linear-gradient(to bottom, #dcdcdc, #b8b8b8)", textShadow: "0 1px 1px rgba(0,0,0,0.3)" }}
                      title={t("apps.contacts.changePicture")}
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
                    <div className="min-w-0 flex-1 pt-0.5 space-y-1">
                      {isEditing ? (
                        <>
                          <div className="flex gap-1.5">
                            <input
                              className={cn(editInputClass, "text-[14px] font-bold")}
                              placeholder={t("apps.contacts.fields.firstName")}
                              value={selectedContact.firstName}
                              onChange={(e) => updateSelectedContact({ firstName: e.target.value })}
                            />
                            <input
                              className={cn(editInputClass, "text-[14px] font-bold")}
                              placeholder={t("apps.contacts.fields.lastName")}
                              value={selectedContact.lastName}
                              onChange={(e) => updateSelectedContact({ lastName: e.target.value })}
                            />
                          </div>
                          <input
                            className={cn(editInputClass, "text-[11px]")}
                            placeholder={t("apps.contacts.fields.organization")}
                            value={selectedContact.organization}
                            onChange={(e) => updateSelectedContact({ organization: e.target.value })}
                          />
                        </>
                      ) : (
                        <>
                          <div className="text-[15px] font-bold leading-tight">{selectedContact.displayName}</div>
                          {selectedContact.organization && (
                            <div className="text-[11px] text-black/50">{selectedContact.organization}</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  

                  <div className="px-3">
                    {isEditing ? (
                      <>
                        <CardRow label={t("apps.contacts.cardLabels.phone")}>
                          <textarea
                            rows={2}
                            className={cn(editInputClass, "resize-none")}
                            value={formatMultivalue(selectedContact.phones.map((p) => p.value))}
                            onChange={(e) => updateSelectedContact({ phones: splitMultivalueInput(e.target.value) })}
                            placeholder={t("apps.contacts.placeholders.multiValue")}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.email")}>
                          <textarea
                            rows={2}
                            className={cn(editInputClass, "resize-none")}
                            value={formatMultivalue(selectedContact.emails.map((e) => e.value))}
                            onChange={(e) => updateSelectedContact({ emails: splitMultivalueInput(e.target.value) })}
                            placeholder={t("apps.contacts.placeholders.multiValue")}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.birthday")}>
                          <input
                            type="date"
                            className={editInputClass}
                            value={selectedContact.birthday || ""}
                            onChange={(e) => updateSelectedContact({ birthday: e.target.value || null })}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.address")}>
                          <textarea
                            rows={2}
                            className={cn(editInputClass, "resize-none")}
                            value={formatMultivalue(selectedContact.addresses.map((a) => a.formatted))}
                            onChange={(e) => updateSelectedContact({ addresses: splitMultivalueInput(e.target.value) })}
                            placeholder={t("apps.contacts.placeholders.multiValue")}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.url")}>
                          <textarea
                            rows={2}
                            className={cn(editInputClass, "resize-none")}
                            value={formatMultivalue(selectedContact.urls.map((u) => u.value))}
                            onChange={(e) => updateSelectedContact({ urls: splitMultivalueInput(e.target.value) })}
                            placeholder={t("apps.contacts.placeholders.multiValue")}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.nickname")}>
                          <input
                            className={editInputClass}
                            value={selectedContact.nickname}
                            onChange={(e) => updateSelectedContact({ nickname: e.target.value })}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.note")}>
                          <textarea
                            rows={3}
                            className={cn(editInputClass, "resize-none")}
                            value={selectedContact.notes}
                            onChange={(e) => updateSelectedContact({ notes: e.target.value })}
                          />
                        </CardRow>
                      </>
                    ) : (
                      <>
                        {selectedContact.phones.map((p) => (
                          <CardRow key={p.id} label={p.label && p.label !== "other" ? p.label : t("apps.contacts.cardLabels.phone")}>{p.value}</CardRow>
                        ))}
                        {selectedContact.emails.map((e) => (
                          <CardRow key={e.id} label={e.label && e.label !== "other" ? e.label : t("apps.contacts.cardLabels.email")}>{e.value}</CardRow>
                        ))}
                        {selectedContact.birthday && (
                          <CardRow label={t("apps.contacts.cardLabels.birthday")}>{formatBirthday(selectedContact.birthday)}</CardRow>
                        )}
                        {selectedContact.addresses.map((a) => (
                          <CardRow key={a.id} label={a.label && a.label !== "other" ? a.label : t("apps.contacts.cardLabels.home")}>{a.formatted}</CardRow>
                        ))}
                        {selectedContact.urls.map((u) => (
                          <CardRow key={u.id} label={u.label && u.label !== "other" ? u.label : t("apps.contacts.cardLabels.url")}>{u.value}</CardRow>
                        ))}
                        {selectedContact.nickname && (
                          <CardRow label={t("apps.contacts.cardLabels.nickname")}>{selectedContact.nickname}</CardRow>
                        )}
                        {selectedContact.notes && (
                          <CardRow label={t("apps.contacts.cardLabels.note")}>{selectedContact.notes}</CardRow>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div
                  className="shrink-0 flex items-center justify-between px-4 py-2 border-t"
                  style={{ borderColor: "rgba(0,0,0,0.08)" }}
                >
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-black/60 hover:text-black/80 px-3 py-0.5 rounded border border-black/15 bg-white/60"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? t("apps.contacts.buttons.done") : t("apps.contacts.buttons.edit")}
                  </button>
                  <span className="text-[10px] text-black/40">
                    {t("apps.contacts.status.cardsCount", { count: contacts.length })}
                  </span>
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
