import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
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
      <AppHelpAboutDialogs
        appId="contacts"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpDialogOpen}
        onHelpOpenChange={setIsHelpDialogOpen}
        isAboutOpen={isAboutDialogOpen}
        onAboutOpenChange={setIsAboutDialogOpen}
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
