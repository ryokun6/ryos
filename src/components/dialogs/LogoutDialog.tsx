import { ConfirmDialog } from "./ConfirmDialog";
import { useTranslation } from "react-i18next";

interface LogoutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  hasPassword?: boolean | null;
  onSetPassword?: () => void;
}

export function LogoutDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  hasPassword,
  onSetPassword,
}: LogoutDialogProps) {
  const { t } = useTranslation();

  // If user doesn't have a password set, show password requirement dialog
  if (hasPassword === false) {
    return (
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onConfirm={() => {
          onOpenChange(false);
          onSetPassword?.();
        }}
        title={t("common.auth.setPasswordRequired")}
        description={t("common.auth.setPasswordRequiredDescription")}
      />
    );
  }

  // Normal logout confirmation
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={t("common.auth.logOut")}
      description={t("common.auth.logOutDescription")}
    />
  );
}
