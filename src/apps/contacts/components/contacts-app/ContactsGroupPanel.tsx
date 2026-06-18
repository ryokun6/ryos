import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { cn } from "@/lib/utils";
import { GroupListItem } from "./GroupListItem";
import { PanelHeader } from "./PanelHeader";
import type { ContactsAppController } from "./useContactsAppController";

const Panel = AppSidebarPanel;

type ContactsGroupPanelProps = {
  c: ContactsAppController;
};

export function ContactsGroupPanel({ c }: ContactsGroupPanelProps) {
  const {
    t,
    isMacOSTheme,
    useGeneva,
    contactGroups,
    selectedGroupId,
    handleSelectGroup,
  } = c;

  return (
    <Panel
      bordered={isMacOSTheme}
      className="w-[170px] shrink-0 flex flex-col min-h-0"
      style={!isMacOSTheme ? { borderRight: "1px solid rgba(0,0,0,0.08)" } : undefined}
    >
      <PanelHeader
        title={t("apps.contacts.groupHeaders.groups", {
          defaultValue: "Group",
        })}
        useGeneva={useGeneva}
        bordered={isMacOSTheme}
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
  );
}
