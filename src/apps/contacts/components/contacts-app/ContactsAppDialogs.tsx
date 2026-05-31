import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { appMetadata } from "../../";
import { UserPicturePicker } from "../UserPicturePicker";
import type { ContactsAppController } from "./useContactsAppController";

type ContactsAppDialogsProps = {
  c: ContactsAppController;
};

export function ContactsAppDialogs({ c }: ContactsAppDialogsProps) {
  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isPicturePickerOpen,
    setIsPicturePickerOpen,
    selectedContact,
    updateSelectedContact,
    handleFileSelected,
    fileInputRef,
  } = c;

  return (
    <>
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
    </>
  );
}
