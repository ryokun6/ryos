import { useEffect, useRef, useState } from "react";
import type { AppProps } from "@/apps/base/types";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { ContactsMenuBar } from "../ContactsMenuBar";
import { useContactsLogic } from "../../hooks/useContactsLogic";
import { getMultivalueDraft } from "./contactsAppUtils";

export type UseContactsAppControllerArgs = Pick<
  AppProps,
  "isWindowOpen" | "onClose" | "isForeground" | "skipInitialSound" | "instanceId"
>;

export function useContactsAppController({
  isWindowOpen: _isWindowOpen,
  onClose,
}: UseContactsAppControllerArgs) {
  const logic = useContactsLogic();
  const {
    t,
    isMacOSTheme,
    isSystem7Theme,
    setIsHelpDialogOpen,
    setIsAboutDialogOpen,
    selectedContact,
    handleCreateContact,
    handleDeleteSelectedContact,
    handleMarkAsMine,
    myContactId,
    lastRemoteSyncAt,
    handleImport,
  } = logic;

  const useGeneva = isMacOSTheme || isSystem7Theme;
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
  const [multivalueDraft, setMultivalueDraft] = useState(() => getMultivalueDraft(selectedContact));

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

  return {
    ...logic,
    useGeneva,
    mineLabel,
    containerRef,
    containerWidth,
    isPicturePickerOpen,
    setIsPicturePickerOpen,
    skipNextMultivalueSyncRef,
    showGroupSidebar,
    setShowGroupSidebar,
    isCardOnlyView,
    setIsCardOnlyView,
    isMobileLayout,
    isEditing,
    setIsEditing,
    multivalueDraft,
    setMultivalueDraft,
    handleCreateContactAndEdit,
    showGroupPanel,
    showListPanel,
    showCardPanel,
    menuBar,
  };
}

export type ContactsAppController = ReturnType<typeof useContactsAppController>;
