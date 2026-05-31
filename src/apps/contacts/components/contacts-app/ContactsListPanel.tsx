import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { cn } from "@/lib/utils";
import { ContactListItem } from "./ContactListItem";
import { PanelHeader } from "./PanelHeader";
import type { ContactsAppController } from "./useContactsAppController";

const Panel = AppSidebarPanel;

type ContactsListPanelProps = {
  c: ContactsAppController;
};

export function ContactsListPanel({ c }: ContactsListPanelProps) {
  const {
    t,
    isMacOsxTheme,
    useGeneva,
    contacts,
    selectedContact,
    myContactId,
    mineLabel,
    handleSelectContact,
    isMobileLayout,
    showCardPanel,
  } = c;

  return (
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
        {contacts.length === 0
          ? null
          : contacts.map((contact) => (
              <ContactListItem
                key={contact.id}
                contact={contact}
                isSelected={selectedContact?.id === contact.id}
                isMine={contact.id === myContactId}
                mineLabel={mineLabel}
                onClick={() => handleSelectContact(contact)}
              />
            ))}
      </div>
    </Panel>
  );
}
