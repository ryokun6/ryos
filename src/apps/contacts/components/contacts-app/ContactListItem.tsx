import { cn } from "@/lib/utils";
import { getContactInitials, type Contact } from "@/utils/contacts";
import { smallAvatarInitialsTextShadow } from "./contactsAppConstants";

export function ContactListItem({
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
          className="shrink-0 size-5 rounded-full bg-white/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] object-contain"
        />
      ) : (
        <div
          className="shrink-0 size-5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] bg-[linear-gradient(to_bottom,#e0e0e0,#c8c8c8)] flex items-center justify-center text-[8px] font-semibold text-white"
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
