import { ConfirmDialog } from "./ConfirmDialog";
import { useTranslation } from "react-i18next";

interface LogoutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function LogoutDialog({
  isOpen,
  onOpenChange,
  onConfirm,
}: LogoutDialogProps) {
  const { t } = useTranslation();

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
