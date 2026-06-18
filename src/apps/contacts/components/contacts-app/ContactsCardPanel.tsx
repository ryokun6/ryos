import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { cn } from "@/lib/utils";
import { getContactInitials } from "@/utils/contacts";
import { CardRow } from "./CardRow";
import { avatarInitialsTextShadow, editInputClass } from "./contactsAppConstants";
import { formatBirthday, splitMultivalueInput } from "./contactsAppUtils";
import type { ContactsAppController } from "./useContactsAppController";

const Panel = AppSidebarPanel;

type ContactsCardPanelProps = {
  c: ContactsAppController;
};

export function ContactsCardPanel({ c }: ContactsCardPanelProps) {
  const {
    t,
    isMacOSTheme,
    selectedContact,
    contacts,
    isEditing,
    setIsEditing,
    multivalueDraft,
    setMultivalueDraft,
    updateSelectedContact,
    skipNextMultivalueSyncRef,
    handleDeleteSelectedContact,
    setIsPicturePickerOpen,
    isMobileLayout,
  } = c;

  return (
    <Panel
      bordered={isMacOSTheme}
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
                className="size-12 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] flex items-center justify-center text-base font-semibold text-white overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
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
                    className="size-full object-contain"
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
                    <CardRow
                      key={p.id}
                      label={p.label && p.label !== "other" ? p.label : t("apps.contacts.cardLabels.phone")}
                    >
                      <a href={`tel:${p.value}`} className="break-all text-os-link hover:underline">
                        {p.value}
                      </a>
                    </CardRow>
                  ))}
                  {selectedContact.emails.map((e) => (
                    <CardRow
                      key={e.id}
                      label={e.label && e.label !== "other" ? e.label : t("apps.contacts.cardLabels.email")}
                    >
                      <a href={`mailto:${e.value}`} className="break-all text-os-link hover:underline">
                        {e.value}
                      </a>
                    </CardRow>
                  ))}
                  {selectedContact.birthday && (
                    <CardRow label={t("apps.contacts.cardLabels.birthday")}>
                      {formatBirthday(selectedContact.birthday)}
                    </CardRow>
                  )}
                  {selectedContact.addresses.map((a) => (
                    <CardRow
                      key={a.id}
                      label={a.label && a.label !== "other" ? a.label : t("apps.contacts.cardLabels.home")}
                    >
                      {a.formatted}
                    </CardRow>
                  ))}
                  {selectedContact.urls.map((u) => (
                    <CardRow
                      key={u.id}
                      label={u.label && u.label !== "other" ? u.label : t("apps.contacts.cardLabels.url")}
                    >
                      <a
                        href={u.value.startsWith("http") ? u.value : `https://${u.value}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-os-link hover:underline"
                      >
                        {u.value}
                      </a>
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
  );
}
