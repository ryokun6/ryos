import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { ContactsMenuBar } from "./ContactsMenuBar";
import { UserPicturePicker } from "./UserPicturePicker";
import { useContactsLogic } from "../hooks/useContactsLogic";
import { appMetadata } from "..";
import type { AppProps } from "@/apps/base/types";
import { cn } from "@/lib/utils";
import { getContactInitials, type Contact } from "@/utils/contacts";
import { Plus, DownloadSimple, MagnifyingGlass, XCircle, SidebarSimple, IdentificationCard } from "@phosphor-icons/react";
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

function getMultivalueDraft(contact: Contact | null | undefined) {
  return {
    phones: formatMultivalue(contact?.phones.map((p) => p.value) || []),
    emails: formatMultivalue(contact?.emails.map((e) => e.value) || []),
    addresses: formatMultivalue(contact?.addresses.map((a) => a.formatted) || []),
    urls: formatMultivalue(contact?.urls.map((u) => u.value) || []),
  };
}

function ContactListItem({
  contact,
  isSelected,
  isMine,
  mineLabel,
  onClick,
}: {
  contact: Contact;
  isSelected: boolean;
  isMine: boolean;
  mineLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 pl-2 pr-3 py-1.5 text-left",
        isSelected ? "" : "hover:bg-black/5 transition-colors"
      )}
      data-selected={isSelected ? "true" : undefined}
    >
      {contact.picture ? (
        <img
          src={contact.picture}
          alt=""
          className="shrink-0 w-5 h-5 rounded-full bg-white/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] object-contain"
        />
      ) : (
        <div
          className="shrink-0 w-5 h-5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] bg-[linear-gradient(to_bottom,#e0e0e0,#c8c8c8)] flex items-center justify-center text-[8px] font-semibold text-white"
          style={{ textShadow: smallAvatarInitialsTextShadow }}
        >
          {getContactInitials(contact)}
        </div>
      )}
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <div className="text-[12px] leading-tight truncate flex-1">{contact.displayName}</div>
        {isMine ? (
          <span className={cn("shrink-0 text-[10px]", isSelected ? "opacity-70" : "text-black/45")}>
            {mineLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function GroupListItem({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px]",
        isSelected ? "" : "hover:bg-black/5 transition-colors"
      )}
      data-selected={isSelected ? "true" : undefined}
    >
      <span className="truncate">{label}</span>
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
        bordered
          ? "relative text-[11px] font-regular text-center"
          : "relative text-[9px] font-bold uppercase tracking-wide opacity-50 px-2.5 pt-2 pb-1",
        useGeneva && "font-geneva-12"
      )}
      style={bordered ? {
        background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
        color: "#222",
        textShadow: "0 1px 0 #e1e1e1",
        borderTop: "1px solid rgba(255,255,255,0.5)",
        borderBottom: "1px solid #787878",
      } : {
        color: "rgba(0,0,0,0.5)",
      }}
    >
      <span>{title}</span>
      {trailing ? <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span> : null}
    </div>
  );
}

const Panel = AppSidebarPanel;

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start py-[5px]">
      <div className="w-16 shrink-0 text-right text-[11px] font-bold text-black/50 pr-2 pt-px">{label}</div>
      <div className="flex-1 min-w-0 break-words text-[12px]">{children}</div>
    </div>
  );
}

function formatBirthday(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const smallAvatarInitialsTextShadow =
  "0 1px 1px rgba(0, 0, 0, 0.35), 0 0 2px rgba(0, 0, 0, 0.12)";

const avatarInitialsTextShadow =
  "0 2px 3px rgba(0, 0, 0, 0.45), 0 0 3px rgba(0, 0, 0, 0.15)";

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
    lastRemoteSyncAt,
    updateSelectedContact,
    handleImport,
    handleFileSelected,
    fileInputRef,
  } = useContactsLogic();
  const useGeneva = isMacOsxTheme || isSystem7Theme;
  const mineLabel = t("apps.contacts.badges.mine", { defaultValue: "My Card" });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(820);
  const [isPicturePickerOpen, setIsPicturePickerOpen] = useState(false);
  const shouldEditOnNextSelectionRef = useRef(false);
  const skipNextMultivalueSyncRef = useRef(false);
  const [showGroupSidebar, setShowGroupSidebar] = useState(true);
  const [isCardOnlyView, setIsCardOnlyView] = useState(false);
  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });
  const isMobileLayout = containerWidth < 640;
  const [isEditing, setIsEditing] = useState(false);
  const selectedContactRef = useRef(selectedContact);
  const [multivalueDraft, setMultivalueDraft] = useState(() =>
    getMultivalueDraft(selectedContact)
  );
  selectedContactRef.current = selectedContact;
  useEffect(() => {
    setIsEditing(shouldEditOnNextSelectionRef.current);
    shouldEditOnNextSelectionRef.current = false;
  }, [selectedContact?.id]);
  useEffect(() => {
    setMultivalueDraft(getMultivalueDraft(selectedContactRef.current));
  }, [isEditing, selectedContact?.id]);
  useEffect(() => {
    if (!lastRemoteSyncAt) {
      return;
    }
    if (skipNextMultivalueSyncRef.current) {
      skipNextMultivalueSyncRef.current = false;
      return;
    }
    setMultivalueDraft(getMultivalueDraft(selectedContact));
  }, [lastRemoteSyncAt, selectedContact]);
  const handleCreateContactAndEdit = () => {
    shouldEditOnNextSelectionRef.current = true;
    handleCreateContact();
  };
  const showGroupPanel = !isMobileLayout && showGroupSidebar && !isCardOnlyView;
  const showListPanel = !isCardOnlyView;
  const showCardPanel = true;

  const menuBar = (
    <ContactsMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewContact={handleCreateContactAndEdit}
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
                    {!isMobileLayout && (
                      <button
                        type="button"
                        className="metal-inset-btn metal-inset-icon"
                        data-state={showGroupSidebar && !isCardOnlyView ? "on" : "off"}
                        onClick={() => setShowGroupSidebar((current) => !current)}
                        title={t("apps.contacts.views.toggleGroups", { defaultValue: "Toggle Groups" })}
                        aria-label={t("apps.contacts.views.toggleGroups", { defaultValue: "Toggle Groups" })}
                      >
                      <SidebarSimple size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      data-state={isCardOnlyView ? "on" : "off"}
                      onClick={() => setIsCardOnlyView((current) => !current)}
                      title={t("apps.contacts.views.cardOnly", { defaultValue: "Card Only" })}
                      aria-label={t("apps.contacts.views.cardOnly", { defaultValue: "Card Only" })}
                    >
                      <IdentificationCard size={14} />
                    </button>
                  </div>
                  <div className="metal-inset-btn-group">
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={handleCreateContactAndEdit}
                      title={t("apps.contacts.menu.newContact")}
                    >
                      <Plus size={12} weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={handleImport}
                      title={t("apps.contacts.menu.importVCard")}
                    >
                      <DownloadSimple size={12} weight="bold" />
                    </button>
                  </div>
                </div>
                <div className="flex-1" />
                <div className={cn("flex items-center gap-2", isMobileLayout && "flex-1 min-w-0")}>
                  <div className={cn("relative", isMobileLayout ? "flex-1 min-w-0 max-w-none" : "w-[150px]")}>
                    <MagnifyingGlass
                      size={13}
                      weight="bold"
                      className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-black/45"
                    />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      aria-label={t("apps.contacts.searchPlaceholder")}
                      title={t("apps.contacts.searchPlaceholder")}
                      className="w-full rounded-full border border-black/40 bg-white pl-7 pr-7 py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] outline-none font-geneva-12"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setSearchQuery("")}
                        className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center text-black/40 hover:text-black/60"
                        aria-label={t("spotlight.ariaLabels.clearSearch")}
                        title={t("spotlight.ariaLabels.clearSearch")}
                      >
                        <XCircle size={14} weight="fill" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-0">
                  {!isMobileLayout && (
                    <Button
                      type="button"
                      variant={isSystem7Theme ? "player" : "ghost"}
                      onClick={() => setShowGroupSidebar((current) => !current)}
                      data-state={showGroupSidebar && !isCardOnlyView ? "on" : "off"}
                      className={cn("h-6 w-6 px-0", isXpTheme && "text-black")}
                      title={t("apps.contacts.views.toggleGroups", { defaultValue: "Toggle Groups" })}
                    >
                      <SidebarSimple size={14} />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={isSystem7Theme ? "player" : "ghost"}
                    onClick={() => setIsCardOnlyView((current) => !current)}
                    data-state={isCardOnlyView ? "on" : "off"}
                    className={cn("h-6 w-6 px-0", isXpTheme && "text-black")}
                    title={t("apps.contacts.views.cardOnly", { defaultValue: "Card Only" })}
                  >
                    <IdentificationCard size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant={isSystem7Theme ? "player" : "ghost"}
                    onClick={handleCreateContactAndEdit}
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
                    <DownloadSimple size={12} weight="bold" />
                  </Button>
                </div>
                <div className="flex-1" />
                <div className={cn("flex items-center gap-2 min-w-0", isMobileLayout && "flex-1")}>
                  <div className={cn("relative min-w-0", isMobileLayout ? "flex-1 max-w-none" : "w-[170px]")}>
                    <MagnifyingGlass
                      size={13}
                      weight="bold"
                      className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-black/35"
                    />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      aria-label={t("apps.contacts.searchPlaceholder")}
                      title={t("apps.contacts.searchPlaceholder")}
                      className="w-full rounded-full border border-black/20 bg-white pl-7 pr-7 py-1 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] outline-none min-w-0"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setSearchQuery("")}
                        className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center text-black/35 hover:text-black/55"
                        aria-label={t("spotlight.ariaLabels.clearSearch")}
                        title={t("spotlight.ariaLabels.clearSearch")}
                      >
                        <XCircle size={14} weight="fill" />
                      </button>
                    )}
                  </div>
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
            {showGroupPanel && (
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
                    isSelected={selectedGroupId === group.id}
                    onClick={() => handleSelectGroup(group.id)}
                  />
                ))}
              </div>
            </Panel>
            )}

            {showListPanel && (
            <Panel
              bordered={isMacOsxTheme}
              className={cn(
                "flex flex-col min-h-0",
                isMobileLayout
                  ? showCardPanel
                    ? "w-full max-w-none self-stretch h-[140px] shrink-0 basis-auto"
                    : "flex-1 w-full max-w-none self-stretch basis-auto"
                  : showCardPanel
                    ? "w-[245px] shrink-0"
                    : "flex-1 min-w-0"
              )}
              style={
                !isMacOsxTheme
                  ? showCardPanel && isMobileLayout
                    ? { borderBottom: "1px solid rgba(0,0,0,0.08)" }
                    : showCardPanel
                      ? { borderRight: "1px solid rgba(0,0,0,0.08)" }
                      : undefined
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
                {contacts.length === 0 ? null : (
                  contacts.map((contact) => (
                    <ContactListItem
                      key={contact.id}
                      contact={contact}
                      isSelected={selectedContact?.id === contact.id}
                      isMine={contact.id === myContactId}
                      mineLabel={mineLabel}
                      onClick={() => handleSelectContact(contact)}
                    />
                  ))
                )}
              </div>
            </Panel>
            )}

            {showCardPanel && (
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
                      style={
                        selectedContact.picture
                          ? { background: "rgba(255, 255, 255, 0.72)" }
                          : {
                              background: "linear-gradient(to bottom, #dcdcdc, #b8b8b8)",
                              textShadow: avatarInitialsTextShadow,
                            }
                      }
                      title={t("apps.contacts.changePicture")}
                    >
                      {selectedContact.picture ? (
                        <img
                          src={selectedContact.picture}
                          alt={selectedContact.displayName}
                          className="w-full h-full object-contain"
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
                            value={multivalueDraft.phones}
                            onChange={(e) => {
                              const value = e.target.value;
                              skipNextMultivalueSyncRef.current = true;
                              setMultivalueDraft((prev) => ({ ...prev, phones: value }));
                              updateSelectedContact({ phones: splitMultivalueInput(value) });
                            }}
                            placeholder={t("apps.contacts.placeholders.multiValue")}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.email")}>
                          <textarea
                            rows={2}
                            className={cn(editInputClass, "resize-none")}
                            value={multivalueDraft.emails}
                            onChange={(e) => {
                              const value = e.target.value;
                              skipNextMultivalueSyncRef.current = true;
                              setMultivalueDraft((prev) => ({ ...prev, emails: value }));
                              updateSelectedContact({ emails: splitMultivalueInput(value) });
                            }}
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
                            value={multivalueDraft.addresses}
                            onChange={(e) => {
                              const value = e.target.value;
                              skipNextMultivalueSyncRef.current = true;
                              setMultivalueDraft((prev) => ({ ...prev, addresses: value }));
                              updateSelectedContact({ addresses: splitMultivalueInput(value) });
                            }}
                            placeholder={t("apps.contacts.placeholders.multiValue")}
                          />
                        </CardRow>
                        <CardRow label={t("apps.contacts.cardLabels.url")}>
                          <textarea
                            rows={2}
                            className={cn(editInputClass, "resize-none")}
                            value={multivalueDraft.urls}
                            onChange={(e) => {
                              const value = e.target.value;
                              skipNextMultivalueSyncRef.current = true;
                              setMultivalueDraft((prev) => ({ ...prev, urls: value }));
                              updateSelectedContact({ urls: splitMultivalueInput(value) });
                            }}
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
                          <CardRow key={p.id} label={p.label && p.label !== "other" ? p.label : t("apps.contacts.cardLabels.phone")}>
                            <a href={`tel:${p.value}`} className="break-all text-blue-600 hover:underline">{p.value}</a>
                          </CardRow>
                        ))}
                        {selectedContact.emails.map((e) => (
                          <CardRow key={e.id} label={e.label && e.label !== "other" ? e.label : t("apps.contacts.cardLabels.email")}>
                            <a href={`mailto:${e.value}`} className="break-all text-blue-600 hover:underline">{e.value}</a>
                          </CardRow>
                        ))}
                        {selectedContact.birthday && (
                          <CardRow label={t("apps.contacts.cardLabels.birthday")}>{formatBirthday(selectedContact.birthday)}</CardRow>
                        )}
                        {selectedContact.addresses.map((a) => (
                          <CardRow key={a.id} label={a.label && a.label !== "other" ? a.label : t("apps.contacts.cardLabels.home")}>{a.formatted}</CardRow>
                        ))}
                        {selectedContact.urls.map((u) => (
                          <CardRow key={u.id} label={u.label && u.label !== "other" ? u.label : t("apps.contacts.cardLabels.url")}>
                            <a href={u.value.startsWith("http") ? u.value : `https://${u.value}`} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 hover:underline">{u.value}</a>
                          </CardRow>
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
                  {isEditing ? (
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-[#8b1e1e] hover:text-[#6f1717] px-2.5 py-0.5 rounded border border-[#8b1e1e]/20 bg-[#fff5f5]"
                      onClick={handleDeleteSelectedContact}
                    >
                      {t("common.dialog.delete")}
                    </button>
                  ) : (
                    <span className="text-[10px] text-black/40">
                      {t("apps.contacts.status.cardsCount", { count: contacts.length })}
                    </span>
                  )}
                </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-[13px] text-black/55 p-6 text-center">
                  {t("apps.contacts.emptySelection")}
                </div>
              )}
            </Panel>
            )}
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
