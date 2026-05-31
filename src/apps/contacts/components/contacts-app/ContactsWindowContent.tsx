import { cn } from "@/lib/utils";
import { ContactsCardPanel } from "./ContactsCardPanel";
import { ContactsGroupPanel } from "./ContactsGroupPanel";
import { ContactsListPanel } from "./ContactsListPanel";
import { ContactsToolbar } from "./ContactsToolbar";
import type { ContactsAppController } from "./useContactsAppController";

type ContactsWindowContentProps = {
  c: ContactsAppController;
};

export function ContactsWindowContent({ c }: ContactsWindowContentProps) {
  const { isMacOsxTheme, isSystem7Theme, containerRef, showGroupPanel, showListPanel, showCardPanel, isMobileLayout } =
    c;

  return (
    <div
      ref={containerRef}
      className={cn(
        "size-full flex flex-col font-os-ui overflow-hidden",
        isMacOsxTheme ? "bg-transparent" : isSystem7Theme ? "bg-white" : "bg-[#efede4]"
      )}
    >
      <ContactsToolbar c={c} />

      <div
        className={cn(
          "flex-1 overflow-hidden",
          isMobileLayout ? "flex flex-col" : "flex",
          !isMobileLayout && isMacOsxTheme && "gap-[5px]"
        )}
      >
        {showGroupPanel && <ContactsGroupPanel c={c} />}
        {showListPanel && <ContactsListPanel c={c} />}
        {showCardPanel && <ContactsCardPanel c={c} />}
      </div>
    </div>
  );
}
